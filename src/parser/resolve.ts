import { PRACTICE_QTY_CAP, RISK_DELTAS, SYMBOLS, SYMBOL_META, type Sym } from '../config'
import { atmStrike, nearestStrike, offsetStrike, strikeByDelta, strikesFor } from '../engine/chain'
import { expiriesFor, fmtExpiry } from '../engine/dates'
import { closestAllowed, isUnlocked, levelFor, STRATEGY_NAMES } from '../engine/recognize'
import { fmtNet, summarize } from '../engine/strategy'
import type { Leg, Level, StrategyKind } from '../engine/types'
import { earningsExpiry, nearestExpiries, snapExpiry, type CommandIntent } from './parse'

let legSeq = 0
export const newLegId = () => `leg_${Date.now().toString(36)}_${(legSeq++).toString(36)}`

export interface OpenPosition {
  id: string
  symbol: Sym
  name: string
  legs: Leg[]
  units: number
}

export interface ResolveContext {
  now: Date
  level: Level
  spots: Record<Sym, number>
  positions: OpenPosition[]
  /** The selected or last-used strategy block, for "roll this". */
  selected?: { id: string; symbol: Sym | null; legs: Leg[]; name: string; positionId?: string }
}

export type Resolution =
  | {
      kind: 'propose'
      symbol: Sym
      legs: Leg[]
      units: number
      limit: number | 'mid'
      sentence: string
      assumptions: string[]
      strategyKind: StrategyKind
      label?: string
      closesPositionId?: string
      rollOf?: string
    }
  | { kind: 'clarify'; message: string; field: 'expiry' | 'underlying' | 'quantity'; options: { label: string; value: string }[] }
  | { kind: 'locked'; message: string; strategy: StrategyKind; needs: Level; alternative: StrategyKind | null }
  | { kind: 'show'; symbol: Sym; message: string }
  | { kind: 'error'; message: string; chips: string[] }

export const EXAMPLES = [
  'Spawn a low-risk iron condor for SPY expiring Friday',
  'Buy a bull call spread on SPY 600/605 next Friday',
  'Sell 2 AAPL 200 puts for the 21st',
  'Bear put spread QQQ 3 contracts, limit 2.40',
  'Straddle on NVDA before earnings',
  'Close my SPY spread',
  'Roll this to next week',
]

const NOT_UNDERSTOOD: Resolution = {
  kind: 'error',
  message: "I didn't catch that. Try: bull call spread on SPY 600/605 Friday.",
  chips: ['Bull call spread on SPY 600/605 Friday', 'Low-risk iron condor for SPY expiring Friday', 'Bear put spread QQQ 3 contracts'],
}

const leg = (symbol: Sym, expiry: string, strike: number, type: 'C' | 'P', side: 1 | -1, qty = 1): Leg => ({
  id: newLegId(),
  contract: { symbol, expiry, strike, type },
  side,
  qty,
})

export function resolveIntent(intent: CommandIntent, ctx: ResolveContext): Resolution {
  const { now } = ctx

  // ---- close ----
  if (intent.action === 'close') {
    const sym = intent.underlying as Sym | undefined
    const pos = [...ctx.positions].reverse().find((p) => !sym || p.symbol === sym)
    if (!pos) return { kind: 'error', message: sym ? `No open ${sym} position from this session to close.` : 'No open position from this session to close.', chips: [] }
    const legs = pos.legs.map((l) => ({ ...l, id: newLegId(), side: (l.side * -1) as 1 | -1 }))
    const s = summarize(legs, ctx.spots, now, pos.units)
    return {
      kind: 'propose',
      symbol: pos.symbol,
      legs,
      units: pos.units,
      limit: 'mid',
      strategyKind: s.recognition.kind,
      label: `Close: ${pos.name}`,
      closesPositionId: pos.id,
      sentence: `Close your ${pos.symbol} ${pos.name}, ${pos.units} ${pos.units === 1 ? 'contract' : 'contracts'}, limit ${fmtNet(s.mid)} at mid.`,
      assumptions: ['Closing trades reverse each leg of the open position.'],
    }
  }

  // ---- roll ----
  if (intent.action === 'roll') {
    const sel = ctx.selected
    if (!sel || !sel.legs.length || !sel.symbol) return { kind: 'error', message: 'Select a Strategy Block with legs first, then say "roll this to next week".', chips: [] }
    const list = expiriesFor(sel.symbol, now)
    const current = sel.legs[0].contract.expiry
    const target = intent.expiry ? snapExpiry(sel.symbol, intent.expiry, now) : list.find((e) => e > current) ?? null
    if (!target) {
      return {
        kind: 'clarify',
        message: 'Which expiry should it roll to?',
        field: 'expiry',
        options: list.filter((e) => e > current).slice(0, 3).map((e) => ({ label: fmtExpiry(e), value: e })),
      }
    }
    const legs = sel.legs.map((l) => ({ ...l, id: newLegId(), contract: { ...l.contract, expiry: target! } }))
    return {
      kind: 'propose',
      symbol: sel.symbol,
      legs,
      units: 1,
      limit: 'mid',
      strategyKind: summarize(legs, ctx.spots, now).recognition.kind,
      label: `Roll: ${sel.name} → ${fmtExpiry(target)}`,
      rollOf: sel.id,
      sentence: `Same strikes as your ${sel.name}, moved to ${fmtExpiry(target)}.`,
      assumptions: sel.positionId ? ['Rolling an open position: close it with "close my spread", then confirm this one.'] : [],
    }
  }

  // ---- ticker ----
  if (intent.unknownTicker && !intent.underlying) {
    return {
      kind: 'clarify',
      message: `I don't have ${intent.unknownTicker.given} in this practice universe. Did you mean ${intent.unknownTicker.suggestion}?`,
      field: 'underlying',
      options: [intent.unknownTicker.suggestion, ...SYMBOLS.filter((s) => s !== intent.unknownTicker!.suggestion).slice(0, 2)].map((s) => ({ label: s, value: s })),
    }
  }
  const symbol = intent.underlying as Sym | undefined
  if (intent.action === 'show') {
    if (!symbol) return NOT_UNDERSTOOD
    return { kind: 'show', symbol, message: `Showing ${symbol}. Every linked widget now follows ${symbol}.` }
  }
  if (!intent.strategy) return NOT_UNDERSTOOD
  if (!symbol) {
    return { kind: 'clarify', message: 'Which stock?', field: 'underlying', options: SYMBOLS.slice(0, 3).map((s) => ({ label: s, value: s })) }
  }

  // ---- level gating ----
  const kind = intent.strategy
  if (!isUnlocked(kind, ctx.level)) {
    const alt = closestAllowed(kind, ctx.level)
    return {
      kind: 'locked',
      strategy: kind,
      needs: levelFor(kind),
      alternative: alt,
      message: `${STRATEGY_NAMES[kind]} isn't available at ${cap(ctx.level)} level.${alt ? ` The closest allowed structure is a ${STRATEGY_NAMES[alt]}.` : ''}`,
    }
  }

  // ---- expiry ----
  let expiry: string | null = null
  if (intent.earnings) {
    expiry = earningsExpiry(symbol, now)
    if (!expiry) {
      return { kind: 'clarify', message: `${symbol} has no single earnings date here. Which expiry?`, field: 'expiry', options: nearestExpiries(symbol, undefined, now).map((e) => ({ label: fmtExpiry(e), value: e })) }
    }
  } else if (intent.expiry) {
    expiry = snapExpiry(symbol, intent.expiry, now)
    if (!expiry) {
      return {
        kind: 'clarify',
        message: `${fmtExpiry(intent.expiry)} isn't a listed ${symbol} expiry. Which one?`,
        field: 'expiry',
        options: nearestExpiries(symbol, intent.expiry, now).map((e) => ({ label: fmtExpiry(e), value: e })),
      }
    }
  } else {
    return { kind: 'clarify', message: 'Which expiry?', field: 'expiry', options: nearestExpiries(symbol, undefined, now).map((e) => ({ label: fmtExpiry(e), value: e })) }
  }

  // ---- quantity ----
  const units = intent.quantity ?? 1
  if (units <= 0) return { kind: 'error', message: 'Quantity must be at least 1.', chips: [] }
  if (units > PRACTICE_QTY_CAP) {
    return {
      kind: 'clarify',
      message: `Practice mode caps orders at ${PRACTICE_QTY_CAP} contracts. How many?`,
      field: 'quantity',
      options: [1, 5, PRACTICE_QTY_CAP].map((n) => ({ label: String(n), value: String(n) })),
    }
  }

  // ---- legs ----
  const spot = ctx.spots[symbol]
  const meta = SYMBOL_META[symbol]
  const width = meta.width
  const ks = (intent.strikes ?? []).map((k) => nearestStrike(symbol, k)).filter((k) => strikesFor(symbol).includes(k))
  const assumptions: string[] = []
  const atm = atmStrike(symbol, spot)
  const roundAtm = nearestStrike(symbol, Math.round(spot / width) * width)
  const risk = intent.risk ?? 'medium'
  const target = RISK_DELTAS[risk]
  let legs: Leg[] = []
  const sorted = [...ks].sort((a, b) => a - b)

  switch (kind) {
    case 'long_call':
    case 'short_call':
    case 'long_put':
    case 'short_put': {
      const type = kind.endsWith('call') ? 'C' : 'P'
      const k = sorted[0] ?? atm
      if (!sorted.length) assumptions.push(`Strike at the money (${k}).`)
      legs = [leg(symbol, expiry, k, type, kind.startsWith('long') ? 1 : -1)]
      break
    }
    case 'bull_call_spread': {
      const [k1, k2] = sorted.length >= 2 ? sorted : [roundAtm, offsetStrike(symbol, roundAtm, width)]
      if (sorted.length < 2) assumptions.push(`Buy the ${k1} call near the money, sell the ${k2} call ${width} points higher.`)
      legs = [leg(symbol, expiry, k1, 'C', 1), leg(symbol, expiry, k2, 'C', -1)]
      break
    }
    case 'bear_put_spread': {
      const [k1, k2] = sorted.length >= 2 ? sorted : [offsetStrike(symbol, roundAtm, -width), roundAtm]
      if (sorted.length < 2) assumptions.push(`Buy the ${k2} put near the money, sell the ${k1} put ${width} points lower.`)
      legs = [leg(symbol, expiry, k2, 'P', 1), leg(symbol, expiry, k1, 'P', -1)]
      break
    }
    case 'bull_put_spread': {
      let k1: number, k2: number
      if (sorted.length >= 2) [k1, k2] = sorted
      else {
        k2 = strikeByDelta(symbol, expiry, 'P', target, spot, now)
        k1 = offsetStrike(symbol, k2, -width)
        assumptions.push(`Short put at about ${Math.round(target * 100)} delta, wing ${width} points wide.`)
      }
      legs = [leg(symbol, expiry, k2, 'P', -1), leg(symbol, expiry, k1, 'P', 1)]
      break
    }
    case 'bear_call_spread': {
      let k1: number, k2: number
      if (sorted.length >= 2) [k1, k2] = sorted
      else {
        k1 = strikeByDelta(symbol, expiry, 'C', target, spot, now)
        k2 = offsetStrike(symbol, k1, width)
        assumptions.push(`Short call at about ${Math.round(target * 100)} delta, wing ${width} points wide.`)
      }
      legs = [leg(symbol, expiry, k1, 'C', -1), leg(symbol, expiry, k2, 'C', 1)]
      break
    }
    case 'iron_condor': {
      let pLo: number, pHi: number, cLo: number, cHi: number
      if (sorted.length >= 4) [pLo, pHi, cLo, cHi] = sorted
      else {
        const d = intent.risk ? target : RISK_DELTAS.low
        pHi = strikeByDelta(symbol, expiry, 'P', d, spot, now)
        cLo = strikeByDelta(symbol, expiry, 'C', d, spot, now)
        pLo = offsetStrike(symbol, pHi, -width)
        cHi = offsetStrike(symbol, cLo, width)
        assumptions.push(`Short strikes at about ${Math.round(d * 100)} delta, wings ${width} points wide.`)
      }
      legs = [leg(symbol, expiry, pLo, 'P', 1), leg(symbol, expiry, pHi, 'P', -1), leg(symbol, expiry, cLo, 'C', -1), leg(symbol, expiry, cHi, 'C', 1)]
      break
    }
    case 'long_straddle':
    case 'short_straddle': {
      const k = sorted[0] ?? atm
      if (!sorted.length) assumptions.push(`Both legs at the money (${k}).`)
      const s = kind === 'long_straddle' ? 1 : -1
      legs = [leg(symbol, expiry, k, 'C', s), leg(symbol, expiry, k, 'P', s)]
      break
    }
    case 'long_strangle':
    case 'short_strangle': {
      let kp: number, kc: number
      if (sorted.length >= 2) [kp, kc] = sorted
      else {
        kp = strikeByDelta(symbol, expiry, 'P', 0.25, spot, now)
        kc = strikeByDelta(symbol, expiry, 'C', 0.25, spot, now)
        assumptions.push('Call and put at about 25 delta.')
      }
      const s = kind === 'long_strangle' ? 1 : -1
      legs = [leg(symbol, expiry, kc, 'C', s), leg(symbol, expiry, kp, 'P', s)]
      break
    }
    case 'calendar': {
      const list = expiriesFor(symbol, now)
      const far = list[list.indexOf(expiry) + 1]
      if (!far) return { kind: 'clarify', message: 'A calendar needs a later expiry too. Pick the near one:', field: 'expiry', options: list.slice(0, -1).slice(0, 3).map((e) => ({ label: fmtExpiry(e), value: e })) }
      const k = sorted[0] ?? atm
      const type = intent.optType ?? 'C'
      legs = [leg(symbol, expiry, k, type, -1), leg(symbol, far, k, type, 1)]
      assumptions.push(`Sell the ${fmtExpiry(expiry)} ${k}${type}, buy the ${fmtExpiry(far)} ${k}${type}.`)
      break
    }
    default:
      return NOT_UNDERSTOOD
  }

  const s = summarize(legs, ctx.spots, now, units)
  const limit = typeof intent.limit === 'number' ? intent.limit : 'mid'
  const limitText = typeof limit === 'number' ? `${limit.toFixed(2)} ${s.mid > 0 ? 'debit' : 'credit'}` : fmtNet(s.mid)
  const sentence = `${STRATEGY_NAMES[s.recognition.kind] ?? STRATEGY_NAMES[kind]} on ${symbol}, expiring ${fmtExpiry(expiry)}, ${units} ${units === 1 ? 'contract' : 'contracts'}, limit ${limitText}.`
  if (!intent.quantity) assumptions.push('1 contract (none given).')
  return { kind: 'propose', symbol, legs, units, limit, sentence, assumptions, strategyKind: s.recognition.kind }
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}
