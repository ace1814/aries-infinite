import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { DEMO, DEMO_SEED, FEED, ORDER_SIM, SYMBOLS, SYMBOL_META, type Sym } from '../config'
import type { Contract } from '../engine/chain'
import { rng, gauss } from '../engine/rng'
import { mergeLegs, recognize } from '../engine/recognize'
import { summarize } from '../engine/strategy'
import type { Leg, Level, Side } from '../engine/types'
import type { ResearchProfile, Answers } from '../content/questions'
import type { WidgetKind } from '../content/widgets'
import { newLegId } from '../parser/resolve'
import { track, trackFirstTrade } from './events'

export type OrderStatus = 'ready' | 'sending' | 'working' | 'filled' | 'rejected'

export interface Strategy {
  id: string
  symbol: Sym | null
  legs: Leg[]
  units: number
  priceMode: 'mid' | 'natural' | 'custom'
  limit: number | null
  quotedNet: number | null
  tif: 'day' | 'gtc'
  status: OrderStatus
  rejectReason?: string
  proposed?: boolean
  label?: string
  closesPositionId?: string
  onCanvas: boolean
  pos?: { x: number; y: number }
  collarAck: boolean
  forcedRequote?: boolean
  fill?: { price: number; time: number }
  positionId?: string
  createdAt: number
}

export interface Position {
  id: string
  symbol: Sym
  name: string
  legs: Leg[]
  fills: Record<string, number>
  units: number
  /** Per share, positive = debit. */
  net: number
  openedAt: number
  strategyId: string
  closed?: { at: number; net: number; pnl: number }
}

export interface Toast {
  id: string
  kind: 'fill' | 'info' | 'error'
  title: string
  body?: string
}

export type FirstStep = 'dashboard' | 'readWidget' | 'switchTicker' | 'buildSpread' | 'sendOrder' | 'tryCommand'

export interface WidgetRecord {
  id: string
  kind: WidgetKind
  x: number
  y: number
  w: number
  h: number
  refId?: string
  linked?: boolean
  symbol?: Sym
}

export type OnboardingStep = 1 | 2 | 3 | 4 | 5

interface State {
  // market
  tick: number
  spots: Record<Sym, number>
  feedPaused: boolean
  feedStale: boolean
  activeSymbol: Sym
  // user
  level: Level
  profile: ResearchProfile | null
  answers: Answers
  addLater: WidgetKind[]
  onboarding: { status: 'active' | 'done'; step: OnboardingStep; guide: string | null }
  help: {
    explainMode: boolean
    hotspots: boolean
    glossaryOpen: boolean
    glossaryTerm: string | null
    firstSteps: Record<FirstStep, boolean>
    firstStepsOpen: boolean
    firstStepsDismissed: boolean
    seenNudges: string[]
    ackSimulation: boolean
    shortcutsOpen: boolean
  }
  ui: {
    commandOpen: boolean
    placing: { kind: WidgetKind; label?: string; size?: { w: number; h: number } } | null
    toasts: Toast[]
    customizeOpen: boolean
    symbolPrompt: Sym | null
    ackFor: string | null
    dragOver: string | null
    rejectFlash: string | null
    endScreen: boolean
    unseenFills: number
    pulse: string | null
    hotspot: string | null
    lastPlaced: string | null
  }
  strategies: Record<string, Strategy>
  activeStrategyId: string | null
  positions: Position[]
  layout: WidgetRecord[]
  past: Snapshot[]
  future: Snapshot[]
  forceRequoteOnce: boolean
}

interface Snapshot {
  strategies: Record<string, Strategy>
  activeStrategyId: string | null
}

interface Actions {
  set: (p: Partial<State>) => void
  setHelp: (p: Partial<State['help']>) => void
  setUi: (p: Partial<State['ui']>) => void
  setOnboarding: (p: Partial<State['onboarding']>) => void
  completeStep: (s: FirstStep) => void
  setLevel: (l: Level) => void
  setActiveSymbol: (s: Sym, opts?: { force?: boolean }) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  // strategies
  createStrategy: (p: Partial<Strategy> & { symbol: Sym | null; legs?: Leg[] }) => string
  addLeg: (strategyId: string, contract: Contract, side: Side) => { ok: boolean; reason?: string }
  removeLeg: (strategyId: string, legId: string) => void
  flipLeg: (strategyId: string, legId: string) => void
  setLegQty: (strategyId: string, legId: string, qty: number) => void
  patchStrategy: (id: string, p: Partial<Strategy>, opts?: { history?: boolean }) => void
  clearStrategy: (id: string) => void
  dismissStrategy: (id: string) => void
  setActiveStrategy: (id: string | null) => void
  sendOrder: (id: string) => void
  undo: () => boolean
  redo: () => boolean
  resetPractice: () => void
}

export type Store = State & Actions

const DEFAULT_SPOTS = Object.fromEntries(SYMBOLS.map((s) => [s, SYMBOL_META[s].spot])) as Record<Sym, number>

const STORAGE_KEY = 'aries-sx-v1'

// localStorage with try/catch on every access (PRD §5.2). Corrupt JSON → defaults (PRD §9).
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      const v = localStorage.getItem(k)
      if (v) JSON.parse(v)
      return v
    } catch {
      try { localStorage.removeItem(k) } catch { /* ignore */ }
      return null
    }
  },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

if (DEMO.resetOnboarding) safeStorage.removeItem(STORAGE_KEY)

let idSeq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`

const initialHelp: State['help'] = {
  explainMode: true,
  hotspots: true,
  glossaryOpen: false,
  glossaryTerm: null,
  firstSteps: { dashboard: false, readWidget: false, switchTicker: false, buildSpread: false, sendOrder: false, tryCommand: false },
  firstStepsOpen: false,
  firstStepsDismissed: false,
  seenNudges: [],
  ackSimulation: false,
  shortcutsOpen: false,
}

const initialUi: State['ui'] = {
  commandOpen: false,
  placing: null,
  toasts: [],
  customizeOpen: false,
  symbolPrompt: null,
  ackFor: null,
  dragOver: null,
  rejectFlash: null,
  endScreen: false,
  unseenFills: 0,
  pulse: null,
  hotspot: null,
  lastPlaced: null,
}

const newStrategy = (p: Partial<Strategy> & { symbol: Sym | null }): Strategy => ({
  id: uid('st'),
  legs: [],
  units: 1,
  priceMode: 'mid',
  limit: null,
  quotedNet: null,
  tif: 'day',
  status: 'ready',
  onCanvas: true,
  collarAck: false,
  createdAt: Date.now(),
  ...p,
})

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const snap = (): Snapshot => ({ strategies: get().strategies, activeStrategyId: get().activeStrategyId })
      const commit = (fn: (s: State) => Partial<State>) =>
        set((s) => ({ past: [...s.past.slice(-99), snap()], future: [], ...fn(s) }))
      const patch = (id: string, p: Partial<Strategy>) => (s: State) => ({
        strategies: { ...s.strategies, [id]: { ...s.strategies[id], ...p } },
      })

      const afterLegChange = (id: string) => {
        const st = get().strategies[id]
        if (!st) return
        const r = recognize(st.legs)
        if (r.kind !== 'empty') track('strategy_recognized', { kind: r.kind })
        const spread = ['bull_call_spread', 'bear_put_spread', 'bull_put_spread', 'bear_call_spread', 'iron_condor', 'long_straddle', 'long_strangle', 'calendar', 'short_straddle', 'short_strangle'].includes(r.kind)
        if (spread) get().completeStep('buildSpread')
        // Legs changed → limit returns to following mid; a filled ticket becomes a new draft.
        set(patch(id, { priceMode: st.priceMode === 'custom' ? 'mid' : st.priceMode, quotedNet: null, collarAck: false, status: st.status === 'rejected' ? 'ready' : st.status, rejectReason: undefined, forcedRequote: false }))
      }

      return {
        tick: 0,
        spots: DEFAULT_SPOTS,
        feedPaused: false,
        feedStale: false,
        activeSymbol: 'SPY',
        level: 'explorer',
        profile: null,
        answers: {},
        addLater: [],
        onboarding: { status: 'active', step: 1, guide: null },
        help: initialHelp,
        ui: initialUi,
        strategies: {},
        activeStrategyId: null,
        positions: [],
        layout: [],
        past: [],
        future: [],
        forceRequoteOnce: DEMO.requote,

        set: (p) => set(p),
        setHelp: (p) => set((s) => ({ help: { ...s.help, ...p } })),
        setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
        setOnboarding: (p) => set((s) => ({ onboarding: { ...s.onboarding, ...p } })),
        completeStep: (k) => {
          if (get().help.firstSteps[k]) return
          set((s) => ({ help: { ...s.help, firstSteps: { ...s.help.firstSteps, [k]: true } } }))
        },
        setLevel: (l) => {
          set({ level: l })
          track('level_selected', { level: l })
        },
        setActiveSymbol: (sym, opts) => {
          const s = get()
          if (sym === s.activeSymbol) return
          const active = s.activeStrategyId ? s.strategies[s.activeStrategyId] : null
          if (!opts?.force && active && active.onCanvas && active.legs.length && active.symbol !== sym && active.status !== 'filled') {
            set((x) => ({ ui: { ...x.ui, symbolPrompt: sym } }))
            return
          }
          set({ activeSymbol: sym })
          track('ticker_linked_changed', { symbol: sym })
          get().completeStep('switchTicker')
        },
        toast: (t) => {
          const id = uid('t')
          set((s) => ({ ui: { ...s.ui, toasts: [...s.ui.toasts.slice(-3), { ...t, id }] } }))
          setTimeout(() => get().dismissToast(id), t.kind === 'fill' ? 6000 : 4200)
        },
        dismissToast: (id) => set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((t) => t.id !== id) } })),

        createStrategy: (p) => {
          const st = newStrategy({ ...p, legs: p.legs ? mergeLegs(p.legs) : [] })
          commit((s) => ({ strategies: { ...s.strategies, [st.id]: st }, activeStrategyId: st.id }))
          if (st.legs.length) afterLegChange(st.id)
          return st.id
        },
        addLeg: (id, contract, side) => {
          const st = get().strategies[id]
          if (!st) return { ok: false, reason: 'No strategy' }
          if (st.symbol && st.legs.length && st.symbol !== contract.symbol) {
            set((s) => ({ ui: { ...s.ui, rejectFlash: id } }))
            setTimeout(() => set((s) => ({ ui: { ...s.ui, rejectFlash: s.ui.rejectFlash === id ? null : s.ui.rejectFlash } })), 900)
            return { ok: false, reason: 'Legs must share an underlying' }
          }
          const fresh = st.status === 'filled'
          const base = fresh ? [] : st.legs
          const legs = mergeLegs([...base, { id: newLegId(), contract, side, qty: 1 }])
          commit(patch(id, { legs, symbol: contract.symbol, ...(fresh ? { status: 'ready', fill: undefined, positionId: undefined, closesPositionId: undefined, label: undefined } : {}) }))
          set({ activeStrategyId: id })
          track('leg_added', { symbol: contract.symbol, strike: contract.strike, type: contract.type, side })
          afterLegChange(id)
          return { ok: true }
        },
        removeLeg: (id, legId) => {
          const st = get().strategies[id]
          if (!st) return
          commit(patch(id, { legs: st.legs.filter((l) => l.id !== legId) }))
          afterLegChange(id)
        },
        flipLeg: (id, legId) => {
          const st = get().strategies[id]
          if (!st) return
          commit(patch(id, { legs: mergeLegs(st.legs.map((l) => (l.id === legId ? { ...l, side: (l.side * -1) as Side } : l))) }))
          afterLegChange(id)
        },
        setLegQty: (id, legId, qty) => {
          const st = get().strategies[id]
          if (!st || qty < 1 || qty > 20) return
          commit(patch(id, { legs: st.legs.map((l) => (l.id === legId ? { ...l, qty } : l)) }))
          afterLegChange(id)
        },
        patchStrategy: (id, p, opts) => {
          if (!get().strategies[id]) return
          if (opts?.history === false) set(patch(id, p))
          else commit(patch(id, p))
        },
        clearStrategy: (id) => {
          commit(patch(id, { legs: [], status: 'ready', fill: undefined, positionId: undefined, label: undefined, proposed: false, closesPositionId: undefined }))
        },
        dismissStrategy: (id) => {
          commit((s) => ({
            strategies: { ...s.strategies, [id]: { ...s.strategies[id], onCanvas: false } },
            activeStrategyId: s.activeStrategyId === id ? null : s.activeStrategyId,
          }))
        },
        setActiveStrategy: (id) => set({ activeStrategyId: id }),

        sendOrder: (id) => {
          const s = get()
          const st = s.strategies[id]
          if (!st || !st.symbol || !st.legs.length) return
          if (!s.help.ackSimulation) {
            set((x) => ({ ui: { ...x.ui, ackFor: id } }))
            return
          }
          if (s.forceRequoteOnce) {
            set({ forceRequoteOnce: false })
            set(patch(id, { forcedRequote: true }))
            track('requote_shown', { forced: true })
            return
          }
          const sum = summarize(st.legs, s.spots, new Date(), st.units)
          const limit = st.priceMode === 'mid' ? sum.mid : st.priceMode === 'natural' ? sum.natural : st.limit ?? sum.mid
          track('ticket_submitted', { kind: sum.recognition.kind, units: st.units, limit })
          set(patch(id, { status: 'sending', proposed: false }))
          const marketable = limit >= sum.natural - 1e-9
          const accept = ORDER_SIM.acceptMinMs + Math.random() * (ORDER_SIM.acceptMaxMs - ORDER_SIM.acceptMinMs)
          const fill = () => {
            const now = get()
            const cur = now.strategies[id]
            if (!cur || (cur.status !== 'sending' && cur.status !== 'working')) return
            const priced = summarize(cur.legs, now.spots, new Date(), cur.units)
            const fills: Record<string, number> = {}
            priced.legs.forEach((l) => (fills[l.id] = l.quote.mid))
            // Spread the difference between leg mids and the limit onto the first leg.
            const diff = limit - priced.mid
            const first = priced.legs[0]
            fills[first.id] = Math.max(0, Math.round((fills[first.id] + diff / (first.side * first.qty)) * 100) / 100)
            const name = cur.label ?? priced.recognition.name
            const positions = [...now.positions]
            let body = `${name} on ${cur.symbol}: ${cur.units} × ${Math.abs(limit).toFixed(2)} ${limit >= 0 ? 'debit' : 'credit'}.`
            let positionId: string | undefined
            if (cur.closesPositionId) {
              const i = positions.findIndex((p) => p.id === cur.closesPositionId)
              if (i >= 0) {
                const pnl = -(positions[i].net + limit) * 100 * positions[i].units
                positions[i] = { ...positions[i], closed: { at: Date.now(), net: limit, pnl } }
                body = `Closed ${positions[i].name}. Simulated P&L ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)}.`
              }
            } else {
              positionId = uid('pos')
              positions.push({ id: positionId, symbol: cur.symbol!, name: priced.recognition.name, legs: priced.legs.map(({ id: lid, contract, side, qty }) => ({ id: lid, contract, side, qty })), fills, units: cur.units, net: limit, openedAt: Date.now(), strategyId: id })
            }
            set((x) => ({
              positions,
              strategies: { ...x.strategies, [id]: { ...cur, status: 'filled', fill: { price: limit, time: Date.now() }, positionId, proposed: false } },
              ui: { ...x.ui, unseenFills: x.ui.unseenFills + 1 },
            }))
            get().toast({ kind: 'fill', title: 'Simulated fill', body })
            get().completeStep('sendOrder')
            trackFirstTrade()
          }
          setTimeout(() => {
            if (marketable) fill()
            else {
              set(patch(id, { status: 'working' }))
              setTimeout(fill, ORDER_SIM.workingMs)
            }
          }, accept)
        },

        undo: () => {
          const { past } = get()
          if (!past.length) return false
          const prev = past[past.length - 1]
          set((s) => ({ past: s.past.slice(0, -1), future: [snap(), ...s.future], ...prev }))
          return true
        },
        redo: () => {
          const { future } = get()
          if (!future.length) return false
          const next = future[0]
          set((s) => ({ future: s.future.slice(1), past: [...s.past, snap()], ...next }))
          return true
        },
        resetPractice: () => {
          safeStorage.removeItem(STORAGE_KEY)
          window.location.href = window.location.pathname + '?onboarding=reset'
        },
      }
    },
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({
        activeSymbol: s.activeSymbol,
        level: s.level,
        profile: s.profile,
        answers: s.answers,
        addLater: s.addLater,
        onboarding: s.onboarding,
        help: { ...s.help, glossaryOpen: false, shortcutsOpen: false },
        strategies: s.strategies,
        activeStrategyId: s.activeStrategyId,
        positions: s.positions,
        layout: s.layout,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const strategies = Object.fromEntries(
          Object.entries(p.strategies ?? {}).map(([k, v]) => [k, { ...v, status: v.status === 'sending' || v.status === 'working' ? 'ready' : v.status }]),
        ) as Record<string, Strategy>
        return { ...current, ...p, strategies, help: { ...current.help, ...(p.help ?? {}) }, ui: current.ui }
      },
    },
  ),
)

// ---- Market feed: 1 Hz random walk with mean reversion (PRD §8) ----

let feedTimer: number | undefined
export function startFeed() {
  if (feedTimer) return
  const r = DEMO.fixed ? rng(DEMO_SEED) : Math.random
  const started = Date.now()
  let timeoutDone = false
  feedTimer = window.setInterval(() => {
    const s = useStore.getState()
    if (DEMO.timeout && !timeoutDone) {
      const t = Date.now() - started
      if (t > FEED.timeoutAfterMs && t < FEED.timeoutAfterMs + FEED.timeoutForMs) {
        if (!s.feedStale) useStore.setState({ feedStale: true })
        return
      }
      if (t >= FEED.timeoutAfterMs + FEED.timeoutForMs) {
        timeoutDone = true
        useStore.setState({ feedStale: false })
      }
    }
    if (s.feedPaused || s.feedStale) return
    const vol = DEMO.fixed ? FEED.tickVol * 0.6 : FEED.tickVol
    const spots = { ...s.spots }
    for (const sym of SYMBOLS) {
      const anchor = SYMBOL_META[sym].spot
      const S = spots[sym]
      const next = S + S * vol * gauss(r) * Math.sqrt(SYMBOL_META[sym].baseIv / 0.15) - FEED.meanReversion * (S - anchor)
      spots[sym] = Math.round(next * 100) / 100
    }
    useStore.setState({ spots, tick: s.tick + 1 })
  }, FEED.tickMs)
}

export const sel = {
  activeStrategy: (s: Store) => (s.activeStrategyId ? s.strategies[s.activeStrategyId] ?? null : null),
}
