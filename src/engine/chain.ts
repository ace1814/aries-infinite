import { RISK_FREE_RATE, STRIKE_RANGE, SYMBOL_META, type Sym } from '../config'
import { bs, type OptType } from './bs'
import { daysTo, yearsTo } from './dates'
import { rand } from './rng'

export interface Contract {
  symbol: Sym
  expiry: string
  strike: number
  type: OptType
}

export interface Quote extends Contract {
  theo: number
  bid: number
  ask: number
  mid: number
  iv: number
  delta: number
  gamma: number
  theta: number
  vega: number
  volume: number
  oi: number
}

export interface ChainRow {
  strike: number
  call: Quote
  put: Quote
}

export const contractKey = (c: Contract) => `${c.symbol}|${c.expiry}|${c.strike}|${c.type}`

export const round2 = (x: number) => Math.round(x * 100) / 100
const floorTick = (x: number) => Math.floor(x * 100 + 1e-6) / 100
const ceilTick = (x: number) => Math.ceil(x * 100 - 1e-6) / 100

/**
 * Implied volatility with a skew (puts richer than calls: IV rises as strikes fall)
 * and a gentle term structure (short-dated a touch higher).
 */
export function ivFor(sym: Sym, K: number, S: number, T: number): number {
  const base = SYMBOL_META[sym].baseIv
  const m = Math.log(K / S)
  const skew = -1.1 * m // lower strikes → higher IV
  const smile = 2.2 * m * m
  const term = 1 + 0.07 * Math.exp(-T * 10) - 0.02 * Math.min(T * 4, 1)
  return Math.max(0.05, base * term * (1 + skew + smile))
}

/** Strikes are anchored to the seed spot so the grid is stable as price breathes. */
export function strikesFor(sym: Sym): number[] {
  const { spot, strikeStep } = SYMBOL_META[sym]
  const lo = Math.ceil((spot * (1 - STRIKE_RANGE)) / strikeStep) * strikeStep
  const hi = Math.floor((spot * (1 + STRIKE_RANGE)) / strikeStep) * strikeStep
  const out: number[] = []
  for (let k = lo; k <= hi + 1e-9; k += strikeStep) out.push(Math.round(k * 100) / 100)
  return out
}

export function atmStrike(sym: Sym, S: number): number {
  const ks = strikesFor(sym)
  let best = ks[0]
  for (const k of ks) if (Math.abs(k - S) < Math.abs(best - S)) best = k
  return best
}

/** Nearest listed strike to a price. */
export function nearestStrike(sym: Sym, price: number): number {
  return atmStrike(sym, price)
}

export function quote(c: Contract, S: number, now: Date): Quote {
  const meta = SYMBOL_META[c.symbol]
  const T = yearsTo(c.expiry, now)
  const iv = ivFor(c.symbol, c.strike, S, T)
  const g = bs(c.type, S, c.strike, T, iv, RISK_FREE_RATE, meta.divYield)
  const theo = g.price
  const moneyness = Math.min(1, Math.abs(Math.log(c.strike / S)) / 0.08)
  const dte = daysTo(c.expiry, now)
  const shortDated = dte < 3 ? 0.5 : dte < 8 ? 0.2 : 0
  const half = Math.max(0.01, (theo * 0.012 + 0.01) * (1 + moneyness * 1.2) * (1 + shortDated))
  let bid = floorTick(theo - half)
  let ask = ceilTick(theo + half)
  if (bid < 0.01) bid = 0
  if (ask <= bid) ask = round2(bid + 0.01)
  if (ask < 0.02) ask = 0.02
  const mid = round2((bid + ask) / 2)
  // Volume and open interest: peaks near the money, bonus on round strikes. Stable per contract.
  const key = `${c.symbol}|${c.expiry}|${c.strike}|${c.type}`
  const near = Math.exp(-((Math.log(c.strike / meta.spot) / 0.045) ** 2))
  const round = c.strike % 5 === 0 ? 1.7 : 1
  const expiryFactor = 1 / (1 + dte / 10)
  const scale = c.symbol === 'SPY' ? 42_000 : c.symbol === 'QQQ' ? 18_000 : 9_000
  const oi = Math.round(scale * (0.04 + near) * round * (0.6 + rand(key + 'oi')) * (0.5 + expiryFactor))
  const volume = Math.round(oi * (0.15 + 0.6 * rand(key + 'v')) * (0.4 + expiryFactor))
  return { ...c, theo, bid, ask, mid, iv, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, volume, oi }
}

export function chainFor(sym: Sym, expiry: string, S: number, now: Date): ChainRow[] {
  return strikesFor(sym).map((strike) => ({
    strike,
    call: quote({ symbol: sym, expiry, strike, type: 'C' }, S, now),
    put: quote({ symbol: sym, expiry, strike, type: 'P' }, S, now),
  }))
}

/** Strike whose |delta| is closest to the target, on the OTM side of spot. */
export function strikeByDelta(sym: Sym, expiry: string, type: OptType, target: number, S: number, now: Date): number {
  let best = strikesFor(sym)[0]
  let bestErr = Infinity
  for (const strike of strikesFor(sym)) {
    if (type === 'C' && strike < S) continue
    if (type === 'P' && strike > S) continue
    const q = quote({ symbol: sym, expiry, strike, type }, S, now)
    const err = Math.abs(Math.abs(q.delta) - target)
    if (err < bestErr) { bestErr = err; best = strike }
  }
  return best
}

/** Shift a strike by n listed steps. */
export function stepStrike(sym: Sym, strike: number, n: number): number {
  const ks = strikesFor(sym)
  const i = ks.indexOf(strike)
  if (i < 0) return strike + n * SYMBOL_META[sym].strikeStep
  return ks[Math.max(0, Math.min(ks.length - 1, i + n))]
}

/** Width in points → the strike that far away (rounded to the grid). */
export function offsetStrike(sym: Sym, strike: number, points: number): number {
  return nearestStrike(sym, strike + points)
}
