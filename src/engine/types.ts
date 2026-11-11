import type { Sym } from '../config'
import type { Contract } from './chain'

export type Side = 1 | -1
export type Level = 'explorer' | 'trader' | 'pro'

export interface Leg {
  id: string
  contract: Contract
  side: Side
  /** Ratio inside one spread unit. */
  qty: number
}

/** A leg with the premium used for P&L (live mid for drafts, fill price for positions). */
export interface PricedLeg extends Leg {
  premium: number
  iv: number
}

export type StrategyKind =
  | 'empty'
  | 'long_call'
  | 'short_call'
  | 'long_put'
  | 'short_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'bear_call_spread'
  | 'bull_put_spread'
  | 'long_straddle'
  | 'short_straddle'
  | 'long_strangle'
  | 'short_strangle'
  | 'iron_condor'
  | 'calendar'
  | 'custom'

export interface Recognition {
  kind: StrategyKind
  name: string
  /** 'debit' | 'credit' when the structure has a conventional sign. */
  flavor?: 'debit' | 'credit'
  unbalanced?: boolean
  mismatchedExpiry?: boolean
  zeroWidth?: boolean
  legCount: number
}

export type { Sym }
