import { SYMBOLS, SYMBOL_META, type Sym } from '../config'
import type { OptType } from '../engine/bs'
import { addDays, expiriesFor, fmtExpiry, fromIso, startOfDay, toIso, upcomingFridays } from '../engine/dates'
import type { StrategyKind } from '../engine/types'

// Tier 1, deterministic parser (PRD §7.5). Pure functions, unit-tested.

export interface LegSpec {
  type: OptType
  side: 1 | -1
  strike: number
  expiry?: string
}

export interface CommandIntent {
  action: 'open' | 'close' | 'roll' | 'show'
  strategy?: StrategyKind
  underlying?: string
  expiry?: string
  /** Explicit strikes in the order given. */
  strikes?: number[]
  legs?: LegSpec[]
  quantity?: number
  risk?: 'low' | 'medium' | 'high'
  direction?: 'bullish' | 'bearish' | 'neutral'
  limit?: number | 'mid'
  /** "sell"/"short" for single legs, straddles and strangles. */
  verb?: 'buy' | 'sell'
  optType?: OptType
  confidence: number
  clarifications?: { field: string; options: string[]; values?: string[] }[]
  unknownTicker?: { given: string; suggestion: Sym }
  earnings?: boolean
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/[^a-z0-9./\-@$ ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

// Longest aliases first.
const LEXICON: [string, StrategyKind][] = [
  ['iron condor', 'iron_condor'],
  ['condor', 'iron_condor'],
  ['bull call spread', 'bull_call_spread'],
  ['call debit spread', 'bull_call_spread'],
  ['bull call', 'bull_call_spread'],
  ['bear put spread', 'bear_put_spread'],
  ['put debit spread', 'bear_put_spread'],
  ['bear put', 'bear_put_spread'],
  ['bull put spread', 'bull_put_spread'],
  ['put credit spread', 'bull_put_spread'],
  ['bull put', 'bull_put_spread'],
  ['bear call spread', 'bear_call_spread'],
  ['call credit spread', 'bear_call_spread'],
  ['bear call', 'bear_call_spread'],
  ['calendar spread', 'calendar'],
  ['calendar', 'calendar'],
  ['straddle', 'long_straddle'],
  ['strangle', 'long_strangle'],
]

const STOP = new Set(['a', 'an', 'the', 'on', 'for', 'to', 'my', 'this', 'next', 'buy', 'sell', 'put', 'puts', 'call', 'calls', 'spread', 'low', 'risk', 'iron', 'bull', 'bear', 'limit', 'at', 'of', 'in', 'and', 'with', 'qty', 'roll', 'close', 'open', 'spawn', 'show', 'me', 'week', 'friday', 'before', 'after', 'earnings', 'expiring', 'expiry', 'condor', 'straddle', 'strangle', 'calendar', 'contracts', 'contract', 'credit', 'debit', 'mid', 'it', 'one', 'two', 'three', 'make', 'place', 'trade', 'get', 'new', 'up', 'is', 'by', 'from', 'out', 'short', 'long', 'monthly', 'today', 'tomorrow', 'please', 'safe', 'high', 'medium', 'aggressive', 'conservative', 'cheap', 'can', 'you', 'i', 'want', 'like', 'build', 'set', 'create', 'add', 'nov', 'dec', 'jan', 'oct', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'shares', 'exp', 'expires', 'neutral', 'bullish', 'bearish', 'chain', 'quote'])

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function nearestTicker(given: string): Sym {
  let best: Sym = SYMBOLS[0]
  let bestD = Infinity
  for (const s of SYMBOLS) {
    const d = levenshtein(given.toUpperCase(), s)
    if (d < bestD) { bestD = d; best = s }
  }
  return best
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11, january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 }
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Resolve date words into a calendar date (not yet snapped to an expiry). */
export function resolveDate(text: string, now: Date): { date?: string; earnings?: boolean } {
  const t = ' ' + text.toLowerCase() + ' '
  if (/\b(before|ahead of|into)\s+earnings\b/.test(t)) return { earnings: true }
  const fridays = upcomingFridays(now, 6)
  if (/\bnext\s+friday\b/.test(t)) return { date: toIso(fridays[1]) }
  if (/\b(this\s+)?friday\b|\bfri\b/.test(t)) return { date: toIso(fridays[0]) }
  if (/\bnext\s+week\b/.test(t)) return { date: toIso(fridays[1]) }
  if (/\bthis\s+week\b/.test(t)) return { date: toIso(fridays[0]) }
  if (/\bnext\s+month\b|\bmonthly\b/.test(t)) {
    const d = addDays(now, 30)
    return { date: toIso(d) }
  }
  if (/\btoday\b/.test(t)) return { date: toIso(now) }
  // "nov 14", "14 nov", "november 14th"
  let m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/)
  if (m) return { date: toIso(nextDate(now, MONTHS[m[1]], Number(m[2]))) }
  m = t.match(/\b(\d{1,2})(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/)
  if (m) return { date: toIso(nextDate(now, MONTHS[m[3]], Number(m[1]))) }
  // "11/14"
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\d)/)
  if (m && Number(m[1]) <= 12 && Number(m[2]) <= 31 && !/\d\/\d{3}/.test(t)) {
    return { date: toIso(nextDate(now, Number(m[1]) - 1, Number(m[2]))) }
  }
  // "the 21st"
  m = t.match(/\bthe\s+(\d{1,2})(st|nd|rd|th)\b/) ?? t.match(/\b(\d{1,2})(st|nd|rd|th)\b/)
  if (m) {
    const day = Number(m[1])
    const today = startOfDay(now)
    let d = new Date(today.getFullYear(), today.getMonth(), day)
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
    return { date: toIso(d) }
  }
  return {}
}

function nextDate(now: Date, month: number, day: number): Date {
  const today = startOfDay(now)
  let d = new Date(today.getFullYear(), month, day)
  if (d < today) d = new Date(today.getFullYear() + 1, month, day)
  return d
}

/** Snap a calendar date to a listed expiry. Exact match or nothing. */
export function snapExpiry(sym: Sym, iso: string, now: Date): string | null {
  return expiriesFor(sym, now).includes(iso) ? iso : null
}

/** Nearest listed expiries to a date, for clarification chips. */
export function nearestExpiries(sym: Sym, iso: string | undefined, now: Date, n = 3): string[] {
  const list = expiriesFor(sym, now)
  if (!iso) return list.slice(0, n)
  const t = fromIso(iso).getTime()
  return [...list].sort((a, b) => Math.abs(fromIso(a).getTime() - t) - Math.abs(fromIso(b).getTime() - t)).slice(0, n).sort()
}

export function earningsExpiry(sym: Sym, now: Date): string | null {
  const days = SYMBOL_META[sym].earningsInDays
  if (days === null) return null
  const e = toIso(addDays(now, days))
  return expiriesFor(sym, now).find((x) => x >= e) ?? null
}

export interface ParseContext {
  now: Date
  /** Used when no ticker is named. */
  defaultSymbol?: Sym
}

export function parseCommand(text: string, ctx: ParseContext): CommandIntent {
  const raw = text.trim()
  const t = ' ' + tokenize(raw).join(' ') + ' '
  const intent: CommandIntent = { action: 'open', confidence: 0 }
  let score = 0
  if (!raw) return intent

  // Action
  if (/\b(close|exit|flatten)\b/.test(t)) intent.action = 'close'
  else if (/\broll\b/.test(t)) intent.action = 'roll'
  else if (/\b(show|open the|chain for|quote)\b/.test(t) && !/\b(buy|sell|spread|condor|straddle|strangle|calendar)\b/.test(t)) intent.action = 'show'

  // Strategy
  for (const [alias, kind] of LEXICON) {
    if (t.includes(' ' + alias + ' ') || t.includes(' ' + alias + 's ')) {
      intent.strategy = kind
      score += 0.35
      break
    }
  }
  const sell = /\b(sell|short|write)\b/.test(t)
  const buy = /\b(buy|long)\b/.test(t)
  if (sell) intent.verb = 'sell'
  else if (buy) intent.verb = 'buy'
  if (intent.strategy === 'long_straddle' && sell) intent.strategy = 'short_straddle'
  if (intent.strategy === 'long_strangle' && sell) intent.strategy = 'short_strangle'

  // Single legs
  if (!intent.strategy) {
    const put = /\bputs?\b/.test(t)
    const call = /\bcalls?\b/.test(t)
    if (put !== call) {
      intent.optType = put ? 'P' : 'C'
      const s = sell ? -1 : 1
      intent.strategy = put ? (s > 0 ? 'long_put' : 'short_put') : s > 0 ? 'long_call' : 'short_call'
      score += 0.3
    }
  }

  // Ticker
  const words = tokenize(raw)
  for (const w of words) {
    const up = w.toUpperCase()
    if ((SYMBOLS as readonly string[]).includes(up)) {
      intent.underlying = up
      score += 0.25
      break
    }
  }
  if (!intent.underlying) {
    // Ticker-like word that is not a known word.
    const original = raw.split(/\s+/)
    const cand = original.find((w) => /^\$?[A-Z]{2,5}$/.test(w) && !STOP.has(w.toLowerCase().replace('$', '')))
    if (cand) {
      const given = cand.replace('$', '')
      intent.unknownTicker = { given, suggestion: nearestTicker(given) }
    } else if (ctx.defaultSymbol) {
      intent.underlying = ctx.defaultSymbol
      score += 0.05
    }
  }

  // Risk and direction
  if (/\blow[- ]?risk\b|\bconservative\b|\bsafe(r)?\b|\bdefensive\b/.test(t)) intent.risk = 'low'
  else if (/\bhigh[- ]?risk\b|\baggressive\b/.test(t)) intent.risk = 'high'
  else if (/\bmedium[- ]?risk\b|\bmoderate\b/.test(t)) intent.risk = 'medium'
  if (/\bbullish\b|\bgo(es|ing)? up\b|\brise\b/.test(t)) intent.direction = 'bullish'
  else if (/\bbearish\b|\bgo(es|ing)? down\b|\bfall\b/.test(t)) intent.direction = 'bearish'
  else if (/\bneutral\b|\bsideways\b|\brange\b/.test(t)) intent.direction = 'neutral'

  // Limit: "limit 2.40", "@ 2.40", "for 1.85 credit", "at mid"
  let rest = t
  const lim = rest.match(/(?:\blimit|\blmt|@|\bat)\s*\$?(\d+(?:\.\d+)?)\b/) ?? rest.match(/\bfor\s+\$?(\d+\.\d+)\s*(?:credit|debit)?\b/) ?? rest.match(/\$?(\d+\.\d+)\s+(?:credit|debit)\b/)
  if (lim) {
    intent.limit = Number(lim[1])
    rest = rest.replace(lim[0], ' ')
    score += 0.05
  } else if (/\b(at|limit)\s+mid\b/.test(t)) intent.limit = 'mid'

  // Quantity: "3 contracts", "qty 3", "x3", "sell 2 aapl", "two contracts"
  const q =
    rest.match(/\b(\d{1,3})\s*(?:contracts?|lots?|spreads?|condors?|x)\b/) ??
    rest.match(/\b(?:qty|quantity|x)\s*(\d{1,3})\b/) ??
    rest.match(/\b(?:buy|sell|short|long)\s+(\d{1,2})\s+(?=[a-z])/)
  if (q) {
    intent.quantity = Number(q[1])
    rest = rest.replace(q[0], ' ')
    score += 0.05
  } else {
    const wq = rest.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:contracts?|lots?|spreads?)\b/)
    if (wq) { intent.quantity = WORD_NUM[wq[1]]; rest = rest.replace(wq[0], ' ') }
  }

  // Dates (before strikes, so "the 21st" is not a strike)
  const date = resolveDate(raw, ctx.now)
  if (date.earnings) intent.earnings = true
  if (date.date) intent.expiry = date.date
  rest = rest
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b/g, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/g, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\b/g, ' ')
  if (intent.expiry || intent.earnings) score += 0.15

  // Strikes: "600/605", "600-605", "590/595/610/615", or numbers ≥ 5 left over.
  const pair = rest.match(/\b(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))+\b/)
  if (pair) {
    intent.strikes = pair[0].split('/').map(Number)
    score += 0.1
  } else {
    const dash = rest.match(/\b(\d{2,4}(?:\.\d+)?)-(\d{2,4}(?:\.\d+)?)\b/)
    if (dash) intent.strikes = [Number(dash[1]), Number(dash[2])]
    else {
      const nums = [...rest.matchAll(/\b(\d{2,4}(?:\.\d+)?)\b/g)].map((m) => Number(m[1])).filter((n) => n >= 5)
      if (nums.length) intent.strikes = nums
    }
    if (intent.strikes) score += 0.1
  }

  if (intent.action !== 'open') score += 0.3
  intent.confidence = Math.min(1, score)
  return intent
}

export function describeExpiry(iso: string): string {
  return fmtExpiry(iso)
}
