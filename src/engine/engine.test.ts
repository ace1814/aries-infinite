import { describe, expect, it } from 'vitest'
import { RISK_FREE_RATE, SYMBOL_META } from '../config'
import { bs, ncdf } from './bs'
import { atmStrike, chainFor, quote, strikesFor } from './chain'
import { expiriesFor, thirdFriday, toIso, upcomingFridays } from './dates'
import { analyze, pnlAtExpiry } from './payoff'
import { isUndefinedRisk, mergeLegs, recognize } from './recognize'
import { plainEnglish, summarize } from './strategy'
import type { Leg, PricedLeg } from './types'

const NOW = new Date(2026, 10, 11, 10, 30) // Wed 11 Nov 2026, 10:30
const EXP = '2026-11-13'

const L = (strike: number, type: 'C' | 'P', side: 1 | -1, qty = 1, expiry = EXP, id = `${strike}${type}${side}${expiry}`): Leg => ({
  id,
  contract: { symbol: 'SPY', expiry, strike, type },
  side,
  qty,
})
const P = (l: Leg, premium: number): PricedLeg => ({ ...l, premium, iv: 0.15 })

describe('black-scholes', () => {
  it('ncdf is symmetric and accurate', () => {
    expect(ncdf(0)).toBeCloseTo(0.5, 6)
    expect(ncdf(1.96)).toBeCloseTo(0.975, 3)
    expect(ncdf(-1) + ncdf(1)).toBeCloseTo(1, 7)
  })
  it('satisfies put-call parity', () => {
    const S = 600, K = 605, T = 0.1, iv = 0.18, r = RISK_FREE_RATE, q = 0.01
    const c = bs('C', S, K, T, iv, r, q).price
    const p = bs('P', S, K, T, iv, r, q).price
    expect(c - p).toBeCloseTo(S * Math.exp(-q * T) - K * Math.exp(-r * T), 6)
  })
  it('greeks have the right signs', () => {
    const c = bs('C', 600, 600, 0.05, 0.15, 0.04)
    const p = bs('P', 600, 600, 0.05, 0.15, 0.04)
    expect(c.delta).toBeGreaterThan(0.45)
    expect(p.delta).toBeLessThan(-0.4)
    expect(c.gamma).toBeGreaterThan(0)
    expect(c.theta).toBeLessThan(0)
    expect(c.vega).toBeGreaterThan(0)
  })
  it('collapses to intrinsic at expiry', () => {
    expect(bs('C', 610, 600, 0, 0.2, 0.04).price).toBe(10)
    expect(bs('P', 610, 600, 0, 0.2, 0.04).price).toBe(0)
  })
})

describe('dates and chain', () => {
  it('lists next four Fridays plus the next monthly for SPY', () => {
    expect(upcomingFridays(NOW, 4).map(toIso)).toEqual(['2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04'])
    expect(toIso(thirdFriday(2026, 11))).toBe('2026-12-18')
    expect(expiriesFor('SPY', NOW)).toEqual(['2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04', '2026-12-18'])
  })
  it('lists monthlies only for single names', () => {
    expect(expiriesFor('AAPL', NOW)).toEqual(['2026-11-20', '2026-12-18', '2027-01-15'])
  })
  it('builds strikes ±15% around spot on the step grid', () => {
    const ks = strikesFor('AAPL')
    expect(ks.every((k) => Math.abs((k / 2.5) - Math.round(k / 2.5)) < 1e-9)).toBe(true)
    expect(ks[0]).toBeGreaterThanOrEqual(SYMBOL_META.AAPL.spot * 0.85)
    expect(ks[ks.length - 1]).toBeLessThanOrEqual(SYMBOL_META.AAPL.spot * 1.15)
  })
  it('quotes bid < mid < ask with puts richer than calls (skew)', () => {
    const rows = chainFor('SPY', EXP, 601.8, NOW)
    for (const r of rows) {
      expect(r.call.bid).toBeLessThanOrEqual(r.call.mid)
      expect(r.call.mid).toBeLessThanOrEqual(r.call.ask)
    }
    const low = quote({ symbol: 'SPY', expiry: '2026-12-18', strike: 560, type: 'P' }, 601.8, NOW)
    const high = quote({ symbol: 'SPY', expiry: '2026-12-18', strike: 640, type: 'C' }, 601.8, NOW)
    expect(low.iv).toBeGreaterThan(high.iv)
    expect(atmStrike('SPY', 601.8)).toBe(602)
  })
})

describe('payoff', () => {
  const bcs = [P(L(600, 'C', 1), 3.1), P(L(605, 'C', -1), 1.0)]
  it('computes bull call spread max profit, loss and breakeven', () => {
    const a = analyze(bcs)
    expect(a.net).toBeCloseTo(2.1, 6)
    expect(a.maxLoss).toBeCloseTo(210, 6)
    expect(a.maxProfit).toBeCloseTo(290, 6)
    expect(a.breakevens).toEqual([602.1])
    expect(a.profitZone).toEqual({ from: 605, to: null })
  })
  it('evaluates P&L at expiry', () => {
    expect(pnlAtExpiry(bcs, 590)).toBeCloseTo(-210, 6)
    expect(pnlAtExpiry(bcs, 610)).toBeCloseTo(290, 6)
  })
  it('detects unlimited loss on a naked short call', () => {
    const a = analyze([P(L(610, 'C', -1), 2)])
    expect(a.maxLoss).toBe('unlimited')
    expect(a.maxProfit).toBeCloseTo(200, 6)
  })
  it('detects unlimited profit on a long call', () => {
    expect(analyze([P(L(610, 'C', 1), 2)]).maxProfit).toBe('unlimited')
  })
  it('gives two breakevens and a range for an iron condor', () => {
    const ic = [P(L(580, 'P', 1), 0.5), P(L(585, 'P', -1), 0.9), P(L(615, 'C', -1), 0.8), P(L(620, 'C', 1), 0.4)]
    const a = analyze(ic)
    expect(a.net).toBeCloseTo(-0.8, 6)
    expect(a.maxProfit).toBeCloseTo(80, 6)
    expect(a.maxLoss).toBeCloseTo(420, 6)
    expect(a.breakevens).toEqual([584.2, 615.8])
    expect(a.profitZone).toEqual({ from: 585, to: 615 })
  })
})

describe('recognition (PRD §6.2)', () => {
  const name = (legs: Leg[]) => recognize(legs).kind
  it('names two-leg verticals', () => {
    expect(name([L(600, 'C', 1), L(605, 'C', -1)])).toBe('bull_call_spread')
    expect(name([L(605, 'P', 1), L(600, 'P', -1)])).toBe('bear_put_spread')
    expect(name([L(600, 'C', -1), L(605, 'C', 1)])).toBe('bear_call_spread')
    expect(name([L(605, 'P', -1), L(600, 'P', 1)])).toBe('bull_put_spread')
  })
  it('names straddles and strangles', () => {
    expect(name([L(600, 'C', 1), L(600, 'P', 1)])).toBe('long_straddle')
    expect(name([L(600, 'C', -1), L(600, 'P', -1)])).toBe('short_straddle')
    expect(name([L(610, 'C', 1), L(590, 'P', 1)])).toBe('long_strangle')
    expect(name([L(610, 'C', -1), L(590, 'P', -1)])).toBe('short_strangle')
  })
  it('names an iron condor and flags unbalanced wings', () => {
    const ic = [L(580, 'P', 1), L(585, 'P', -1), L(615, 'C', -1), L(620, 'C', 1)]
    expect(recognize(ic)).toMatchObject({ kind: 'iron_condor', unbalanced: false })
    const un = [L(575, 'P', 1), L(585, 'P', -1), L(615, 'C', -1), L(620, 'C', 1)]
    expect(recognize(un)).toMatchObject({ kind: 'iron_condor', unbalanced: true })
  })
  it('names a calendar and flags mismatched expiries', () => {
    const cal = [L(600, 'C', -1, 1, '2026-11-13'), L(600, 'C', 1, 1, '2026-11-20')]
    expect(recognize(cal)).toMatchObject({ kind: 'calendar', mismatchedExpiry: true })
    const bad = [L(600, 'C', 1, 1, '2026-11-13'), L(605, 'C', -1, 1, '2026-11-20')]
    expect(recognize(bad)).toMatchObject({ kind: 'custom', mismatchedExpiry: true })
  })
  it('flags zero-width spreads and handles singles and customs', () => {
    expect(recognize([L(600, 'C', 1, 1, EXP, 'a'), L(600, 'C', -1, 1, EXP, 'b')]).zeroWidth).toBe(true)
    expect(name([L(600, 'P', -1)])).toBe('short_put')
    expect(name([L(600, 'C', 1), L(605, 'C', 1)])).toBe('custom')
  })
  it('merges duplicate legs into one with qty 2', () => {
    const m = mergeLegs([L(600, 'C', 1, 1, EXP, 'a'), L(600, 'C', 1, 1, EXP, 'b')])
    expect(m).toHaveLength(1)
    expect(m[0].qty).toBe(2)
  })
  it('detects undefined risk', () => {
    expect(isUndefinedRisk([L(600, 'C', -1)])).toBe(true)
    expect(isUndefinedRisk([L(600, 'P', -1)])).toBe(true)
    expect(isUndefinedRisk([L(600, 'C', -1), L(605, 'C', 1)])).toBe(false)
    expect(isUndefinedRisk([L(600, 'C', -1), L(600, 'P', -1)])).toBe(true)
  })
})

describe('plain English', () => {
  it('describes a debit spread without advice words', () => {
    const spots = { SPY: 601.8, QQQ: 521.4, AAPL: 228.6, NVDA: 182.3, TSLA: 341.9 }
    const s = summarize([L(600, 'C', 1), L(605, 'C', -1)], spots, NOW)
    const text = plainEnglish(s, 1, 'SPY').join(' ')
    expect(text).toMatch(/You pay about \$\d+/)
    expect(text).toMatch(/You can lose at most \$\d+/)
    expect(text).toMatch(/above \$605\.00/)
    expect(text).not.toMatch(/\b(best|safe|guaranteed|should)\b/i)
  })
})
