import type { Leg, Level, Recognition, StrategyKind } from './types'

export const STRATEGY_NAMES: Record<StrategyKind, string> = {
  empty: 'New strategy',
  long_call: 'Long Call',
  short_call: 'Short Call',
  long_put: 'Long Put',
  short_put: 'Short Put',
  bull_call_spread: 'Bull Call Spread',
  bear_put_spread: 'Bear Put Spread',
  bear_call_spread: 'Bear Call Spread',
  bull_put_spread: 'Bull Put Spread',
  long_straddle: 'Long Straddle',
  short_straddle: 'Short Straddle',
  long_strangle: 'Long Strangle',
  short_strangle: 'Short Strangle',
  iron_condor: 'Iron Condor',
  calendar: 'Calendar Spread',
  custom: 'Custom',
}

/** Merge legs with the same contract and side (PRD §6.5: duplicate → "Qty 2"). */
export function mergeLegs(legs: Leg[]): Leg[] {
  const out: Leg[] = []
  for (const l of legs) {
    const hit = out.find(
      (o) =>
        o.side === l.side &&
        o.contract.symbol === l.contract.symbol &&
        o.contract.expiry === l.contract.expiry &&
        o.contract.strike === l.contract.strike &&
        o.contract.type === l.contract.type,
    )
    if (hit) hit.qty += l.qty
    else out.push({ ...l, contract: { ...l.contract } })
  }
  return out
}

/** PRD §6.2 recognition table. */
export function recognize(input: Leg[]): Recognition {
  const legs = mergeLegs(input)
  const n = legs.length
  const base = { legCount: n }
  if (n === 0) return { ...base, kind: 'empty', name: STRATEGY_NAMES.empty }

  const expiries = new Set(legs.map((l) => l.contract.expiry))
  const mixed = expiries.size > 1
  const sameQty = legs.every((l) => l.qty === legs[0].qty)

  if (n === 1) {
    const l = legs[0]
    const kind: StrategyKind =
      l.contract.type === 'C' ? (l.side > 0 ? 'long_call' : 'short_call') : l.side > 0 ? 'long_put' : 'short_put'
    return { ...base, kind, name: STRATEGY_NAMES[kind], flavor: l.side > 0 ? 'debit' : 'credit' }
  }

  if (n === 2) {
    const [a, b] = legs
    // Calendar: same strike and type, different expiries, opposite sides.
    if (mixed) {
      if (a.contract.strike === b.contract.strike && a.contract.type === b.contract.type && a.side !== b.side && sameQty) {
        const longLeg = a.side > 0 ? a : b
        const shortLeg = a.side > 0 ? b : a
        const flavor = longLeg.contract.expiry > shortLeg.contract.expiry ? 'debit' : 'credit'
        return { ...base, kind: 'calendar', name: STRATEGY_NAMES.calendar, flavor, mismatchedExpiry: true }
      }
      return { ...base, kind: 'custom', name: `Custom (${n} legs)`, mismatchedExpiry: true }
    }
    if (!sameQty) return { ...base, kind: 'custom', name: `Custom (${n} legs)` }

    if (a.contract.type === b.contract.type && a.side !== b.side) {
      const lo = a.contract.strike < b.contract.strike ? a : b
      const hi = lo === a ? b : a
      if (lo.contract.strike === hi.contract.strike) {
        return { ...base, kind: 'custom', name: `Custom (${n} legs)`, zeroWidth: true }
      }
      if (a.contract.type === 'C') {
        if (lo.side > 0) return { ...base, kind: 'bull_call_spread', name: STRATEGY_NAMES.bull_call_spread, flavor: 'debit' }
        return { ...base, kind: 'bear_call_spread', name: STRATEGY_NAMES.bear_call_spread, flavor: 'credit' }
      }
      if (hi.side > 0) return { ...base, kind: 'bear_put_spread', name: STRATEGY_NAMES.bear_put_spread, flavor: 'debit' }
      return { ...base, kind: 'bull_put_spread', name: STRATEGY_NAMES.bull_put_spread, flavor: 'credit' }
    }

    if (a.contract.type !== b.contract.type && a.side === b.side) {
      const call = a.contract.type === 'C' ? a : b
      const put = call === a ? b : a
      const long = a.side > 0
      if (call.contract.strike === put.contract.strike) {
        const kind = long ? 'long_straddle' : 'short_straddle'
        return { ...base, kind, name: STRATEGY_NAMES[kind], flavor: long ? 'debit' : 'credit' }
      }
      if (put.contract.strike < call.contract.strike) {
        const kind = long ? 'long_strangle' : 'short_strangle'
        return { ...base, kind, name: STRATEGY_NAMES[kind], flavor: long ? 'debit' : 'credit' }
      }
    }
    return { ...base, kind: 'custom', name: `Custom (${n} legs)` }
  }

  if (n === 4 && !mixed && sameQty) {
    const puts = legs.filter((l) => l.contract.type === 'P').sort((x, y) => x.contract.strike - y.contract.strike)
    const calls = legs.filter((l) => l.contract.type === 'C').sort((x, y) => x.contract.strike - y.contract.strike)
    if (puts.length === 2 && calls.length === 2) {
      const [pLo, pHi] = puts
      const [cLo, cHi] = calls
      const shape = pLo.side > 0 && pHi.side < 0 && cLo.side < 0 && cHi.side > 0
      const ordered =
        pLo.contract.strike < pHi.contract.strike &&
        pHi.contract.strike < cLo.contract.strike &&
        cLo.contract.strike < cHi.contract.strike
      if (shape && ordered) {
        const putW = pHi.contract.strike - pLo.contract.strike
        const callW = cHi.contract.strike - cLo.contract.strike
        return {
          ...base,
          kind: 'iron_condor',
          name: STRATEGY_NAMES.iron_condor,
          flavor: 'credit',
          unbalanced: Math.abs(putW - callW) > 1e-9,
        }
      }
    }
  }
  return { ...base, kind: 'custom', name: `Custom (${n} legs)`, mismatchedExpiry: mixed || undefined }
}

// ---- Level gating (PRD §5.4) ----

const EXPLORER: StrategyKind[] = ['empty', 'long_call', 'long_put', 'bull_call_spread', 'bear_put_spread']
const TRADER: StrategyKind[] = [...EXPLORER, 'bull_put_spread', 'bear_call_spread', 'long_straddle', 'short_straddle', 'long_strangle', 'short_strangle']
const PRO: StrategyKind[] = [...TRADER, 'iron_condor', 'calendar', 'custom', 'short_call', 'short_put']

export const LEVEL_STRATEGIES: Record<Level, StrategyKind[]> = { explorer: EXPLORER, trader: TRADER, pro: PRO }

export function isUnlocked(kind: StrategyKind, level: Level): boolean {
  return LEVEL_STRATEGIES[level].includes(kind)
}

/** Lowest level that unlocks a strategy. */
export function levelFor(kind: StrategyKind): Level {
  if (EXPLORER.includes(kind)) return 'explorer'
  if (TRADER.includes(kind)) return 'trader'
  return 'pro'
}

/**
 * Undefined risk: more short calls than long calls (unlimited upside loss),
 * or more short puts than long puts (a naked short put).
 */
export function undefinedRisk(input: Leg[]): { calls: boolean; puts: boolean } {
  const legs = mergeLegs(input)
  const sum = (t: 'C' | 'P', s: 1 | -1) =>
    legs.filter((l) => l.contract.type === t && l.side === s).reduce((a, l) => a + l.qty, 0)
  // Calendars: a long later-dated leg covers a short near-dated one at the same strike.
  return {
    calls: sum('C', -1) > sum('C', 1),
    puts: sum('P', -1) > sum('P', 1),
  }
}

export function isUndefinedRisk(legs: Leg[]): boolean {
  const u = undefinedRisk(legs)
  return u.calls || u.puts
}

/** Closest allowed alternative when a strategy is locked (PRD §7.7). */
export function closestAllowed(kind: StrategyKind, level: Level): StrategyKind | null {
  const order: Partial<Record<StrategyKind, StrategyKind[]>> = {
    iron_condor: ['bull_put_spread', 'bull_call_spread'],
    short_straddle: ['long_straddle', 'bull_call_spread'],
    short_strangle: ['long_strangle', 'bull_call_spread'],
    bull_put_spread: ['bull_call_spread'],
    bear_call_spread: ['bear_put_spread'],
    long_straddle: ['bull_call_spread'],
    long_strangle: ['bull_call_spread'],
    calendar: ['bull_call_spread'],
    short_put: ['bull_put_spread', 'bull_call_spread'],
    short_call: ['bear_call_spread', 'bear_put_spread'],
    custom: ['bull_call_spread'],
  }
  for (const k of order[kind] ?? []) if (isUnlocked(k, level)) return k
  return null
}
