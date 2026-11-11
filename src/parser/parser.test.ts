import { describe, expect, it } from 'vitest'
import { recognize } from '../engine/recognize'
import { parseCommand, resolveDate } from './parse'
import { resolveIntent, type ResolveContext } from './resolve'

const NOW = new Date(2026, 10, 11, 10, 30) // Wed 11 Nov 2026
const spots = { SPY: 601.8, QQQ: 521.4, AAPL: 228.6, NVDA: 182.3, TSLA: 341.9 }
const ctx = (level: ResolveContext['level'] = 'pro'): ResolveContext => ({ now: NOW, level, spots, positions: [] })
const p = (t: string) => parseCommand(t, { now: NOW })

describe('date resolver', () => {
  it('resolves Friday words', () => {
    expect(resolveDate('expiring Friday', NOW).date).toBe('2026-11-13')
    expect(resolveDate('next Friday', NOW).date).toBe('2026-11-20')
    expect(resolveDate('roll to next week', NOW).date).toBe('2026-11-20')
  })
  it('resolves calendar dates', () => {
    expect(resolveDate('for the 21st', NOW).date).toBe('2026-11-21')
    expect(resolveDate('Nov 14', NOW).date).toBe('2026-11-14')
    expect(resolveDate('20 nov', NOW).date).toBe('2026-11-20')
    expect(resolveDate('before earnings', NOW).earnings).toBe(true)
  })
})

describe('parser (PRD §7.4 phrases)', () => {
  it('low-risk iron condor', () => {
    const i = p('Spawn a low-risk iron condor for SPY expiring Friday')
    expect(i).toMatchObject({ action: 'open', strategy: 'iron_condor', underlying: 'SPY', expiry: '2026-11-13', risk: 'low' })
    expect(i.confidence).toBeGreaterThan(0.7)
  })
  it('bull call spread with strikes', () => {
    expect(p('Buy a bull call spread on SPY 600/605 next Friday')).toMatchObject({ strategy: 'bull_call_spread', underlying: 'SPY', strikes: [600, 605], expiry: '2026-11-20' })
  })
  it('sell puts with quantity and day-of-month', () => {
    expect(p('Sell 2 AAPL 200 puts for the 21st')).toMatchObject({ strategy: 'short_put', underlying: 'AAPL', quantity: 2, strikes: [200], expiry: '2026-11-21' })
  })
  it('quantity and limit', () => {
    const i = p('Bear put spread QQQ 3 contracts, limit 2.40')
    expect(i).toMatchObject({ strategy: 'bear_put_spread', underlying: 'QQQ', quantity: 3, limit: 2.4 })
    expect(i.strikes).toBeUndefined()
  })
  it('straddle before earnings', () => {
    expect(p('Straddle on NVDA before earnings')).toMatchObject({ strategy: 'long_straddle', underlying: 'NVDA', earnings: true })
  })
  it('close and roll', () => {
    expect(p('Close my SPY spread')).toMatchObject({ action: 'close', underlying: 'SPY' })
    expect(p('Roll this to next week')).toMatchObject({ action: 'roll', expiry: '2026-11-20' })
  })
  it('flags an unknown ticker with a suggestion', () => {
    expect(p('bull call spread on SPX friday').unknownTicker).toEqual({ given: 'SPX', suggestion: 'SPY' })
  })
})

describe('resolver', () => {
  it('builds a low-risk iron condor near 12 delta', () => {
    const r = resolveIntent(p('Spawn a low-risk iron condor for SPY expiring Friday'), ctx())
    expect(r.kind).toBe('propose')
    if (r.kind !== 'propose') return
    expect(recognize(r.legs).kind).toBe('iron_condor')
    expect(r.sentence).toMatch(/^Iron Condor on SPY, expiring Fri 13 Nov, 1 contract, limit \d+\.\d\d credit\.$/)
    expect(r.assumptions.join(' ')).toMatch(/12 delta/)
  })
  it('builds the explicit bull call spread', () => {
    const r = resolveIntent(p('Buy a bull call spread on SPY 600/605 next Friday'), ctx('explorer'))
    expect(r.kind).toBe('propose')
    if (r.kind === 'propose') expect(r.legs.map((l) => [l.contract.strike, l.side])).toEqual([[600, 1], [605, -1]])
  })
  it('asks for an expiry instead of guessing', () => {
    const r = resolveIntent(p('Bear put spread QQQ 3 contracts, limit 2.40'), ctx())
    expect(r.kind).toBe('clarify')
    if (r.kind === 'clarify') expect(r.options).toHaveLength(3)
  })
  it('clarifies a date that is not an expiry', () => {
    const r = resolveIntent(p('Sell 2 AAPL 200 puts for the 21st'), ctx())
    expect(r.kind).toBe('clarify')
    if (r.kind === 'clarify') expect(r.options.map((o) => o.value)).toContain('2026-11-20')
  })
  it('resolves earnings to the first expiry after the date', () => {
    const r = resolveIntent(p('Straddle on NVDA before earnings'), ctx())
    expect(r.kind).toBe('propose')
    if (r.kind === 'propose') expect(r.legs[0].contract.expiry).toBe('2026-11-20')
  })
  it('gates locked strategies by level', () => {
    const r = resolveIntent(p('Spawn a low-risk iron condor for SPY expiring Friday'), ctx('explorer'))
    expect(r).toMatchObject({ kind: 'locked', needs: 'pro' })
  })
  it('caps quantity in practice mode', () => {
    expect(resolveIntent(p('bull call spread SPY friday 50 contracts'), ctx()).kind).toBe('clarify')
  })
  it('errors politely on nonsense', () => {
    expect(resolveIntent(p('make me rich'), ctx()).kind).toBe('error')
  })
})
