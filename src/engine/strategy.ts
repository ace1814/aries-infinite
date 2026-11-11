import { CONTRACT_MULTIPLIER, FEE_PER_CONTRACT, type Sym } from '../config'
import { quote, round2, type Quote } from './chain'
import { fmtExpiry } from './dates'
import { analyze, netGreeks, type NetGreeks, type PayoffAnalysis } from './payoff'
import { isUndefinedRisk, mergeLegs, recognize } from './recognize'
import type { Leg, PricedLeg, Recognition } from './types'

export type LivePricedLeg = PricedLeg & { quote: Quote; delta: number; gamma: number; theta: number; vega: number }

/** Price legs at live mid (or a supplied fill premium). */
export function priceLegs(legs: Leg[], spots: Record<Sym, number>, now: Date, fills?: Record<string, number>): LivePricedLeg[] {
  return mergeLegs(legs).map((l) => {
    const q = quote(l.contract, spots[l.contract.symbol], now)
    return {
      ...l,
      premium: fills?.[l.id] ?? q.mid,
      iv: q.iv,
      quote: q,
      delta: q.delta,
      gamma: q.gamma,
      theta: q.theta,
      vega: q.vega,
    }
  })
}

export interface StrategySummary {
  recognition: Recognition
  legs: LivePricedLeg[]
  analysis: PayoffAnalysis
  greeks: NetGreeks
  /** Per share for one unit, positive = debit. */
  mid: number
  /** Natural: buy at ask, sell at bid. */
  natural: number
  undefinedRisk: boolean
  contracts: number
}

export function summarize(legs: Leg[], spots: Record<Sym, number>, now: Date, units = 1): StrategySummary {
  const priced = priceLegs(legs, spots, now)
  const recognition = recognize(legs)
  const analysis = analyze(priced)
  const mid = round2(priced.reduce((s, l) => s + l.side * l.qty * l.quote.mid, 0))
  const natural = round2(priced.reduce((s, l) => s + l.side * l.qty * (l.side > 0 ? l.quote.ask : l.quote.bid), 0))
  return {
    recognition,
    legs: priced,
    analysis,
    greeks: netGreeks(priced, units),
    mid,
    natural,
    undefinedRisk: isUndefinedRisk(legs),
    contracts: priced.reduce((s, l) => s + l.qty, 0) * units,
  }
}

export function estimatedFees(legs: Leg[], units: number): number {
  return round2(FEE_PER_CONTRACT * mergeLegs(legs).reduce((s, l) => s + l.qty, 0) * units)
}

export const money = (x: number, digits = 0) =>
  `$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

export const signedMoney = (x: number) => `${x >= 0 ? '+' : '−'}${money(x)}`

export function fmtPrice(x: number): string {
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "1.85 credit" / "2.40 debit" */
export function fmtNet(net: number): string {
  if (Math.abs(net) < 0.005) return '0.00 even'
  return `${fmtPrice(Math.abs(net))} ${net > 0 ? 'debit' : 'credit'}`
}

/**
 * The plain-English sentence (PRD §5.3 Step 5, §7A.4).
 * Describes the payoff. Never advises.
 */
export function plainEnglish(s: StrategySummary, units: number, symbol: string): string[] {
  const a = s.analysis
  const lines: string[] = []
  if (!s.legs.length) return lines
  const cost = Math.abs(s.mid) * CONTRACT_MULTIPLIER * units
  if (s.mid > 0) lines.push(`You pay about ${money(cost)} to open this.`)
  else if (s.mid < 0) lines.push(`You receive about ${money(cost)} to open this.`)
  if (a.maxLoss === 'unlimited') lines.push('Your possible loss has no fixed limit.')
  else lines.push(`You can lose at most ${money(a.maxLoss * units)}.`)
  if (a.maxProfit === 'unlimited') {
    lines.push(
      a.profitZone?.from
        ? `Your profit keeps growing the further ${symbol} rises above $${fmtPrice(a.profitZone.from)} at expiry.`
        : `Your profit keeps growing as ${symbol} rises.`,
    )
  } else if (a.maxProfit > 0 && a.profitZone) {
    const p = money(a.maxProfit * units)
    const z = a.profitZone
    if (z.from !== null && z.to === null) lines.push(`You make the most (${p}) if ${symbol} is above $${fmtPrice(z.from)} at expiry.`)
    else if (z.from === null && z.to !== null) lines.push(`You make the most (${p}) if ${symbol} is below $${fmtPrice(z.to)} at expiry.`)
    else if (z.from !== null && z.to !== null) {
      if (Math.abs(z.to - z.from) < 0.5) lines.push(`You make the most (${p}) if ${symbol} is right at $${fmtPrice(z.from)} at expiry.`)
      else lines.push(`You make the most (${p}) if ${symbol} stays between $${fmtPrice(z.from)} and $${fmtPrice(z.to)} at expiry.`)
    }
  } else {
    lines.push('This combination cannot make money at expiry with the current prices.')
  }
  return lines
}

export function legLabel(l: Leg): string {
  return `${l.side > 0 ? 'Buy' : 'Sell'} ${l.qty > 1 ? l.qty + '× ' : ''}${l.contract.symbol} ${fmtPrice(l.contract.strike).replace(/\.00$/, '')}${l.contract.type} ${fmtExpiry(l.contract.expiry)}`
}

export function legsSummary(legs: Leg[]): string {
  return mergeLegs(legs)
    .map((l) => `${l.side > 0 ? '+' : '−'}${l.qty > 1 ? l.qty : ''}${fmtPrice(l.contract.strike).replace(/\.00$/, '')}${l.contract.type}`)
    .join(' / ')
}
