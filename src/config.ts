// Every assumption in the PRD lives here (PRD §0.6). Change numbers here, not in components.

export const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA'] as const
export type Sym = (typeof SYMBOLS)[number]

export interface SymbolMeta {
  name: string
  /** Seed spot. Set SPY close to the real price on recording day (PRD §8). */
  spot: number
  strikeStep: number
  /** Weekly expiries (SPY, QQQ) or monthly only. */
  weekly: boolean
  baseIv: number
  /** Default spread width in points for templates and "low-risk" requests (PRD §7.6). */
  width: number
  divYield: number
  /** Simulated earnings date, days from today. null = no single-name earnings. */
  earningsInDays: number | null
}

export const SYMBOL_META: Record<Sym, SymbolMeta> = {
  SPY: { name: 'S&P 500 ETF', spot: 601.8, strikeStep: 1, weekly: true, baseIv: 0.15, width: 5, divYield: 0.013, earningsInDays: null },
  QQQ: { name: 'Nasdaq-100 ETF', spot: 521.4, strikeStep: 1, weekly: true, baseIv: 0.19, width: 5, divYield: 0.006, earningsInDays: null },
  AAPL: { name: 'Apple Inc.', spot: 228.6, strikeStep: 2.5, weekly: false, baseIv: 0.26, width: 5, divYield: 0.005, earningsInDays: 16 },
  NVDA: { name: 'NVIDIA Corp.', spot: 182.3, strikeStep: 2.5, weekly: false, baseIv: 0.46, width: 5, divYield: 0.0003, earningsInDays: 9 },
  TSLA: { name: 'Tesla Inc.', spot: 341.9, strikeStep: 5, weekly: false, baseIv: 0.56, width: 10, divYield: 0, earningsInDays: 23 },
}

/** USD, per contract per leg. Carried from PRD v1, unverified (PRD §3, §16). */
export const FEE_PER_CONTRACT = 0.55
export const RISK_FREE_RATE = 0.043
export const CONTRACT_MULTIPLIER = 100

/** Simulated account (PRD §6.4, §8). */
export const ACCOUNT_CASH = 25_000
export const ACCOUNT_BUYING_POWER = 25_000

/** Practice-mode quantity cap (PRD §7.7). */
export const PRACTICE_QTY_CAP = 20
/** Re-Quote when net premium moves more than this from the quoted value (PRD §9). */
export const REQUOTE_THRESHOLD = 0.015
/** Soft warning when the limit is this far from mid (PRD §9). */
export const PRICE_COLLAR = 0.25
/** Strike window around spot (PRD §8). */
export const STRIKE_RANGE = 0.15

/** Explorer starts with at most this many widgets, including Chain and Strategy Block (PRD §5.5). */
export const EXPLORER_MAX_WIDGETS = 5

/** Delta targets for "low-risk" style requests. Demo defaults, not recommendations (PRD §7.6). */
export const RISK_DELTAS = { low: 0.12, medium: 0.22, high: 0.3 } as const

/** Market simulation (PRD §8). */
export const FEED = {
  tickMs: 1000,
  /** Per-tick shock as a fraction of spot. */
  tickVol: 0.00009,
  /** Pull back toward the seed each tick (0..1). */
  meanReversion: 0.06,
  /** ?demo=timeout: when the stall starts and how long it lasts. */
  timeoutAfterMs: 6000,
  timeoutForMs: 6000,
}

export const ORDER_SIM = { acceptMinMs: 600, acceptMaxMs: 900, workingMs: 1400 }

export const PARSER = { tier2ConfidenceThreshold: 0.55, tier2Endpoint: '/api/parse' }

// ---- Demo flags (PRD §8) ----
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
const demo = params.getAll('demo')
export const DEMO = {
  fixed: demo.includes('1'),
  requote: demo.includes('requote'),
  timeout: demo.includes('timeout'),
  resetOnboarding: params.get('onboarding') === 'reset',
}
export const DEMO_SEED = 20261020

/** Top panel only: hides onboarding, restored widgets, dock, footer and tips while the shell is being redesigned. */
export const SHELL_ONLY = true
