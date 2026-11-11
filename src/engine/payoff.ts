import { CONTRACT_MULTIPLIER, RISK_FREE_RATE, SYMBOL_META } from '../config'
import { bs, intrinsic } from './bs'
import { expiryMoment } from './dates'
import type { PricedLeg } from './types'

const YEAR = 365 * 86_400_000

/** Earliest expiry among legs, as a Date. */
export function firstExpiry(legs: PricedLeg[]): Date | null {
  if (!legs.length) return null
  return legs.map((l) => expiryMoment(l.contract.expiry)).reduce((a, b) => (a < b ? a : b))
}

export function hasMixedExpiries(legs: PricedLeg[]): boolean {
  return new Set(legs.map((l) => l.contract.expiry)).size > 1
}

/**
 * P&L in dollars for ONE strategy unit if the underlying is at S on `at`.
 * Legs already expired by `at` are worth intrinsic; the rest are revalued with Black-Scholes.
 * PRD §6.3: Σ qty × side × (value(S) − premium) × 100
 */
export function pnlAt(legs: PricedLeg[], S: number, at: Date): number {
  let total = 0
  for (const l of legs) {
    const T = (expiryMoment(l.contract.expiry).getTime() - at.getTime()) / YEAR
    const v =
      T <= 1e-9
        ? intrinsic(l.contract.type, S, l.contract.strike)
        : bs(l.contract.type, S, l.contract.strike, T, l.iv, RISK_FREE_RATE, SYMBOL_META[l.contract.symbol].divYield).price
    total += l.qty * l.side * (v - l.premium)
  }
  return total * CONTRACT_MULTIPLIER
}

/** P&L at the earliest expiry. */
export function pnlAtExpiry(legs: PricedLeg[], S: number): number {
  const fe = firstExpiry(legs)
  if (!fe) return 0
  return pnlAt(legs, S, fe)
}

/** Net premium per share for one unit. Positive = debit (you pay), negative = credit. */
export function netPremium(legs: PricedLeg[]): number {
  return legs.reduce((s, l) => s + l.side * l.qty * l.premium, 0)
}

export interface PayoffAnalysis {
  maxProfit: number | 'unlimited'
  /** Positive number = the most you can lose. */
  maxLoss: number | 'unlimited'
  breakevens: number[]
  /** Per share, one unit. Positive = debit. */
  net: number
  /** Price region where the max profit is reached (for plain-English copy). */
  profitZone: { from: number | null; to: number | null } | null
}

function evalPoints(legs: PricedLeg[]): number[] {
  const strikes = legs.map((l) => l.contract.strike)
  const lo = Math.min(...strikes)
  const hi = Math.max(...strikes)
  const pts = new Set<number>([0.0001, ...strikes, hi * 3])
  // Mixed expiries make the curve smooth: sample densely.
  if (hasMixedExpiries(legs)) {
    const a = lo * 0.6
    const b = hi * 1.4
    for (let i = 0; i <= 400; i++) pts.add(a + ((b - a) * i) / 400)
  } else {
    // Linear between strikes, but add a few mid points so zones read cleanly.
    for (let i = 0; i <= 40; i++) pts.add(lo * 0.5 + ((hi * 1.5 - lo * 0.5) * i) / 40)
  }
  return [...pts].sort((x, y) => x - y)
}

export function analyze(legs: PricedLeg[]): PayoffAnalysis {
  const net = netPremium(legs)
  if (!legs.length) return { maxProfit: 0, maxLoss: 0, breakevens: [], net: 0, profitZone: null }
  const pts = evalPoints(legs)
  const vals = pts.map((S) => pnlAtExpiry(legs, S))
  // Slope beyond the highest strike: each call adds side*qty per $1.
  const callSlope = legs.filter((l) => l.contract.type === 'C').reduce((s, l) => s + l.side * l.qty, 0)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const maxProfit: PayoffAnalysis['maxProfit'] = callSlope > 1e-9 ? 'unlimited' : round(max)
  const maxLoss: PayoffAnalysis['maxLoss'] = callSlope < -1e-9 ? 'unlimited' : round(Math.max(0, -min))

  const breakevens: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = vals[i - 1]
    const b = vals[i]
    if (a === 0 && i === 1) breakevens.push(pts[0])
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const x = pts[i - 1] + ((0 - a) * (pts[i] - pts[i - 1])) / (b - a)
      breakevens.push(Math.round(x * 100) / 100)
    } else if (b === 0 && a !== 0) {
      breakevens.push(Math.round(pts[i] * 100) / 100)
    }
  }
  const be = dedupe(breakevens)

  // Profit zone: where P&L is within a cent of its max.
  let profitZone: PayoffAnalysis['profitZone'] = null
  if (maxProfit !== 'unlimited' && max > 0) {
    const eps = Math.max(1, Math.abs(max) * 0.002)
    const idx = vals.map((v, i) => (v >= max - eps ? i : -1)).filter((i) => i >= 0)
    const first = idx[0]
    const last = idx[idx.length - 1]
    profitZone = {
      from: first === 0 ? null : pts[first],
      to: last === pts.length - 1 ? null : pts[last],
    }
  } else if (maxProfit === 'unlimited') {
    profitZone = { from: be.length ? be[be.length - 1] : null, to: null }
  }
  return { maxProfit, maxLoss, breakevens: be, net, profitZone }
}

export interface NetGreeks {
  delta: number
  gamma: number
  theta: number
  vega: number
}

/** Signed sum across legs × quantity × 100 (PRD §6.3). */
export function netGreeks(legs: (PricedLeg & { delta: number; gamma: number; theta: number; vega: number })[], units = 1): NetGreeks {
  const g = { delta: 0, gamma: 0, theta: 0, vega: 0 }
  for (const l of legs) {
    const m = l.side * l.qty * CONTRACT_MULTIPLIER * units
    g.delta += l.delta * m
    g.gamma += l.gamma * m
    g.theta += l.theta * m
    g.vega += l.vega * m
  }
  return g
}

function round(x: number) {
  return Math.round(x * 100) / 100
}

function dedupe(xs: number[]): number[] {
  const out: number[] = []
  for (const x of xs) if (!out.some((y) => Math.abs(y - x) < 0.02)) out.push(x)
  return out
}
