import { SYMBOL_META, type Sym } from '../config'
import { strikesFor, quote } from './chain'
import { expiriesFor, addDays, fmtShort, toIso } from './dates'
import { hash, rng } from './rng'

const round = (x: number) => Math.round(x * 100) / 100

// All research content is simulated sample data (PRD §6A, §8). No real outlets, people or quotes.

export interface ResearchStatic {
  symbol: Sym
  low52: number
  high52: number
  prevClose: number
  open: number
  avgVolume: number
  volumeRatio: number
  intraday: number[]
  ivRank: number
  ivPercentile: number
  analyst: { buy: number; hold: number; sell: number }
  target: { low: number; median: number; high: number }
  community: { bullish: number }
  history: { t: number; o: number; h: number; l: number; c: number }[]
}

const cache = new Map<Sym, ResearchStatic>()

export function researchFor(sym: Sym): ResearchStatic {
  const hit = cache.get(sym)
  if (hit) return hit
  const r = rng(hash('research:' + sym))
  const spot = SYMBOL_META[sym].spot
  // SPY and QQQ sit near the top of the range; single names vary.
  const topBias = sym === 'SPY' ? 0.9 : sym === 'QQQ' ? 0.84 : 0.35 + r() * 0.5
  const span = spot * (0.22 + r() * 0.18)
  const low52 = round(spot - span * topBias)
  const high52 = round(low52 + span)
  const prevClose = round(spot * (1 - 0.006 + r() * 0.009))
  const open = round(prevClose * (1 + (r() - 0.5) * 0.004))
  const avgVolume = Math.round((sym === 'SPY' ? 68e6 : sym === 'QQQ' ? 41e6 : sym === 'NVDA' ? 210e6 : sym === 'TSLA' ? 96e6 : 52e6) * (0.85 + r() * 0.3))
  const volumeRatio = sym === 'SPY' ? 1.8 : round(0.7 + r() * 1.2)
  // U-shaped intraday volume (15-minute bars, 26 in a session).
  const intraday = Array.from({ length: 26 }, (_, i) => {
    const u = 1.6 * Math.exp(-i / 3) + 1.2 * Math.exp(-(25 - i) / 3) + 0.45
    return Math.round(((avgVolume * volumeRatio) / 26) * u * (0.75 + r() * 0.5) * 0.6)
  })
  const ivRank = Math.round(sym === 'SPY' ? 28 : 15 + r() * 70)
  const ivPercentile = Math.min(99, Math.round(ivRank + 8 + r() * 12))
  const buy = Math.round(18 + r() * 22)
  const hold = Math.round(6 + r() * 12)
  const sell = Math.round(r() * 5)
  const target = { low: round(spot * (0.82 + r() * 0.08)), median: round(spot * (1.04 + r() * 0.08)), high: round(spot * (1.2 + r() * 0.15)) }
  const community = { bullish: Math.round(48 + r() * 30) }
  // Daily history for the chart (about 5 years of trading days).
  const days = 1260
  const history: ResearchStatic['history'] = []
  let p = spot * 0.48
  const dailyVol = SYMBOL_META[sym].baseIv / Math.sqrt(252)
  const drift = Math.log(prevClose / p) / days
  const today = new Date()
  for (let i = days; i >= 1; i--) {
    const z = (r() + r() + r() - 1.5) * 1.4
    const o = p
    const c = p * Math.exp(drift + dailyVol * z)
    const h = Math.max(o, c) * (1 + r() * dailyVol * 0.8)
    const l = Math.min(o, c) * (1 - r() * dailyVol * 0.8)
    history.push({ t: addDays(today, -Math.round(i * 1.45)).getTime(), o, h, l, c })
    p = c
  }
  // Pin the last close to prevClose exactly.
  const last = history[history.length - 1]
  const k = prevClose / last.c
  for (const b of history.slice(-60)) { b.o *= k; b.h *= k; b.l *= k; b.c *= k }
  const out = { symbol: sym, low52, high52, prevClose, open, avgVolume, volumeRatio, intraday, ivRank, ivPercentile, analyst: { buy, hold, sell }, target, community, history }
  cache.set(sym, out)
  return out
}

export interface DayStats {
  dayLow: number
  dayHigh: number
  changePct: number
  volume: number
}

/** Day range grows as the simulated price moves. */
const dayExtremes = new Map<Sym, { lo: number; hi: number }>()
export function dayStats(sym: Sym, spot: number, tick: number): DayStats {
  const s = researchFor(sym)
  const r = rng(hash('day:' + sym))
  const base = dayExtremes.get(sym) ?? {
    lo: Math.min(s.open, spot) * (1 - 0.002 - r() * 0.004),
    hi: Math.max(s.open, spot) * (1 + 0.001 + r() * 0.003),
  }
  base.lo = Math.min(base.lo, spot)
  base.hi = Math.max(base.hi, spot)
  dayExtremes.set(sym, base)
  const volume = Math.round(s.avgVolume * s.volumeRatio * (0.92 + Math.min(tick, 600) / 7500))
  return { dayLow: round(base.lo), dayHigh: round(base.hi), changePct: ((spot - s.prevClose) / s.prevClose) * 100, volume }
}

export function rangePosition(price: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(1, (price - lo) / Math.max(hi - lo, 1e-9)))
}

// ---- Takeaway lines: describe the data, never recommend (PRD §6A) ----

export function keyStatsTakeaway(sym: Sym, spot: number): string {
  const s = researchFor(sym)
  const pos = rangePosition(spot, s.low52, s.high52)
  const pct = Math.round(pos * 100)
  if (pos > 0.8) return `${sym} is near the top of its 52-week range (${pct}% of the way up).`
  if (pos < 0.2) return `${sym} is near the bottom of its 52-week range (${pct}% of the way up).`
  return `${sym} sits in the middle of its 52-week range (${pct}% of the way up).`
}

export function volumeTakeaway(sym: Sym): string {
  const s = researchFor(sym)
  if (s.volumeRatio >= 1.15) return `Volume is ${s.volumeRatio.toFixed(1)}× its 30-day average. Busier than usual.`
  if (s.volumeRatio <= 0.85) return `Volume is ${s.volumeRatio.toFixed(1)}× its 30-day average. Quieter than usual.`
  return `Volume is close to its 30-day average (${s.volumeRatio.toFixed(1)}×).`
}

export function sentimentTakeaway(sym: Sym): string {
  const s = researchFor(sym)
  const total = s.analyst.buy + s.analyst.hold + s.analyst.sell
  const buyPct = Math.round((s.analyst.buy / total) * 100)
  return `In this sample, ${buyPct}% of analyst ratings are Buy and ${s.community.bullish}% of community votes lean bullish.`
}

export function ivTakeaway(sym: Sym): string {
  const r = researchFor(sym).ivRank
  if (r < 33) return `IV Rank is ${r}: volatility is in the lower third of its 1-year range.`
  if (r > 66) return `IV Rank is ${r}: volatility is in the upper third of its 1-year range.`
  return `IV Rank is ${r}: volatility is mid-range for the past year.`
}

export function chartTakeaway(sym: Sym, spot: number): string {
  const s = researchFor(sym)
  const ch = ((spot - s.prevClose) / s.prevClose) * 100
  const yearAgo = s.history[Math.max(0, s.history.length - 252)].c
  const yr = ((spot - yearAgo) / yearAgo) * 100
  return `${sym} is ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(2)}% today and ${yr >= 0 ? 'up' : 'down'} ${Math.abs(yr).toFixed(0)}% over a year.`
}

export function chainTakeaway(sym: Sym, spot: number, now: Date): string {
  const exp = expiriesFor(sym, now)[0]
  const ks = strikesFor(sym)
  const atm = ks.reduce((a, b) => (Math.abs(b - spot) < Math.abs(a - spot) ? b : a))
  const q = quote({ symbol: sym, expiry: exp, strike: atm, type: 'C' }, spot, now)
  return `The ${atm} call for ${fmtShort(exp)} costs about $${Math.round(q.mid * 100)} for one contract (premium ${q.mid.toFixed(2)} × 100 shares).`
}

export function oiTakeaway(sym: Sym, spot: number, now: Date): string {
  const exp = expiriesFor(sym, now)[0]
  let best = { k: 0, oi: 0 }
  for (const k of strikesFor(sym)) {
    const oi = quote({ symbol: sym, expiry: exp, strike: k, type: 'C' }, spot, now).oi + quote({ symbol: sym, expiry: exp, strike: k, type: 'P' }, spot, now).oi
    if (oi > best.oi) best = { k, oi }
  }
  return `The most open interest for ${fmtShort(exp)} sits at the ${best.k} strike.`
}

// ---- Templated sample headlines and posts ----

export const SAMPLE_OUTLET = 'Canvas Wire (sample)'

export interface Headline { time: string; tag: 'Earnings' | 'Product' | 'Macro' | 'Markets'; text: string }

export function headlinesFor(sym: Sym, spot: number, now: Date): Headline[] {
  const s = researchFor(sym)
  const r = rng(hash('news:' + sym + toIso(now)))
  const pos = rangePosition(spot, s.low52, s.high52)
  const rangeLine = pos > 0.8 ? `${sym} trades near its 52-week high as volume picks up` : pos < 0.2 ? `${sym} trades near its 52-week low` : `${sym} holds the middle of its 52-week range`
  const earn = SYMBOL_META[sym].earningsInDays
  const items: Omit<Headline, 'time'>[] = [
    { tag: 'Markets', text: rangeLine },
    { tag: 'Markets', text: `Options volume in ${sym} runs ${s.volumeRatio >= 1 ? 'above' : 'below'} its 30-day average` },
    earn
      ? { tag: 'Earnings', text: `${sym} earnings date in ${earn} days; traders watch implied volatility into the report` }
      : { tag: 'Macro', text: `Index options see heavier volume ahead of this week's economic data` },
    { tag: 'Macro', text: 'Rate decision on the calendar; short-dated index options active' },
    { tag: 'Product', text: earn ? `What ${sym} watchers look for at the next product event` : `Fund flows into large index ETFs stay steady this month` },
    { tag: 'Markets', text: `${sym} implied volatility ${s.ivRank < 40 ? 'stays low' : 'edges higher'} versus the past year (IV Rank ${s.ivRank})` },
    { tag: 'Markets', text: `Put/call activity in ${sym} ${r() > 0.5 ? 'leans toward calls' : 'leans toward puts'} in early trading` },
    { tag: 'Macro', text: 'Sector rotation keeps index levels range-bound in afternoon trade' },
  ]
  let minutes = 9 * 60 + 35
  return items.map((it) => {
    minutes += 8 + Math.floor(r() * 40)
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return { ...it, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
  }).reverse()
}

export interface SocialPost { handle: string; ago: string; text: string; mood: 'bullish' | 'bearish' | 'neutral'; likes: number }

const HANDLES = ['@thetadrift_sam', '@wingwidth', '@gammaghost', '@calendar_kat', '@strikezone_lee', '@ivcrush_io', '@spreadsheet_sid', '@deltaneutral_dee']

export function socialFor(sym: Sym): SocialPost[] {
  const r = rng(hash('social:' + sym))
  const templates: Omit<SocialPost, 'handle' | 'ago' | 'likes'>[] = [
    { mood: 'bullish', text: `Watching ${sym} into the close. Volume looks heavier than usual.` },
    { mood: 'neutral', text: `${sym} premiums feel cheap vs last month. Checking IV Rank before doing anything.` },
    { mood: 'bearish', text: `${sym} is stretched near the top of its range. Waiting for a pullback.` },
    { mood: 'bullish', text: `Built a small defined-risk spread on ${sym}. Max loss known up front.` },
    { mood: 'neutral', text: `Anyone else watching open interest around the round strikes on ${sym}?` },
    { mood: 'bearish', text: `Not touching ${sym} until after the next data release.` },
  ]
  return templates.map((t, i) => ({
    ...t,
    handle: HANDLES[(i + hash(sym)) % HANDLES.length],
    ago: `${2 + Math.floor(r() * 50)}m`,
    likes: Math.floor(r() * 240),
  }))
}
