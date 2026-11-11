import { SYMBOL_META, type Sym } from '../config'
import { buildProfile, DEFAULT_ANSWERS, researchWidgets, type Answers } from '../content/questions'
import type { WidgetKind } from '../content/widgets'
import { nearestStrike, offsetStrike } from '../engine/chain'
import { expiriesFor } from '../engine/dates'
import type { Level, Side, StrategyKind } from '../engine/types'
import { track } from '../store/events'
import { useStore, type OnboardingStep } from '../store'
import { applyLayout, shapesOfKind, strategyShapeId, widgetShapes, zoomToContent } from '../canvas/ops'
import { getEditor } from '../canvas/editorRef'
import type { AriesWidgetShape } from '../canvas/WidgetShape'
import { generateLayout, planDashboard } from './layout'

export function goStep(step: OnboardingStep) {
  useStore.getState().setOnboarding({ step })
  track('onboarding_step_viewed', { step })
}

/** Answers → profile → help settings → plan. Returns the plan. */
export function applyAnswers(level: Level, answers: Answers) {
  const s = useStore.getState()
  const profile = buildProfile(level, answers)
  const research = researchWidgets(level, answers)
  const plan = planDashboard(level, research.length ? research : researchWidgets(level, DEFAULT_ANSWERS[level]))
  s.set({ profile, answers, addLater: plan.later })
  s.setHelp({ explainMode: profile.help.explainMode, hotspots: profile.help.hotspots })
  track('widgets_selected', { widgets: plan.place, later: plan.later })
  s.completeStep('dashboard')
  return plan
}

export function currentPlan(): { place: WidgetKind[]; later: WidgetKind[] } {
  const s = useStore.getState()
  const answers = Object.keys(s.answers).length ? s.answers : DEFAULT_ANSWERS[s.level]
  const research = researchWidgets(s.level, answers)
  return planDashboard(s.level, research.length ? research : researchWidgets(s.level, DEFAULT_ANSWERS[s.level]))
}

/** Place every planned widget in the generated layout (also the skip path). */
export function placeAll(kinds?: WidgetKind[]) {
  const plan = kinds ?? currentPlan().place
  const existing = widgetShapes().map((w) => w.props.kind)
  const union = [...new Set([...plan, ...existing])]
  applyLayout(generateLayout(union), { animate: existing.length > 0 })
}

export function skipOnboarding() {
  const s = useStore.getState()
  const step = s.onboarding.step
  if (step <= 2) s.setLevel('explorer')
  const level = useStore.getState().level
  if (!s.profile || step <= 3) applyAnswers(level, Object.keys(s.answers).length && step > 3 ? s.answers : DEFAULT_ANSWERS[level])
  if (!widgetShapes().length) placeAll()
  finishOnboarding(false)
}

export function finishOnboarding(endScreen: boolean) {
  const s = useStore.getState()
  s.setOnboarding({ status: 'done', guide: null })
  s.setUi({ endScreen, hotspot: null, placing: null })
  s.setHelp({ firstStepsOpen: true, firstStepsDismissed: false })
}

// ---- Step 5: the guided first strategy ----

export type Direction = 'up' | 'down' | 'sideways' | 'unsure'

export interface GuidedTrade {
  kind: StrategyKind
  legs: { type: 'C' | 'P'; strike: number; side: Side }[]
  expiry: string
  symbol: Sym
  note?: string
}

export function guidedTrade(level: Level, dir: Direction, symbol: Sym): GuidedTrade {
  const s = useStore.getState()
  const spot = s.spots[symbol]
  const w = SYMBOL_META[symbol].width
  const expiry = expiriesFor(symbol, new Date())[0]
  const atm5 = nearestStrike(symbol, Math.round(spot / w) * w)
  if (level === 'explorer') {
    if (dir === 'down') return { kind: 'bear_put_spread', symbol, expiry, legs: [{ type: 'P', strike: atm5, side: 1 }, { type: 'P', strike: offsetStrike(symbol, atm5, -w), side: -1 }] }
    const note = dir === 'sideways' ? 'Sideways structures (like an iron condor) unlock at Pro. For practice, here is a Bull Call Spread.' : undefined
    return { kind: 'bull_call_spread', symbol, expiry, note, legs: [{ type: 'C', strike: atm5, side: 1 }, { type: 'C', strike: offsetStrike(symbol, atm5, w), side: -1 }] }
  }
  // Trader (and Pro building by hand): credit spreads.
  if (dir === 'down') {
    const k = offsetStrike(symbol, atm5, w)
    return { kind: 'bear_call_spread', symbol, expiry, legs: [{ type: 'C', strike: k, side: -1 }, { type: 'C', strike: offsetStrike(symbol, k, w), side: 1 }] }
  }
  const k = offsetStrike(symbol, atm5, -w)
  return {
    kind: 'bull_put_spread',
    symbol,
    expiry,
    note: dir === 'sideways' ? 'A Bull Put Spread profits if the stock stays above the sold strike, including sideways.' : undefined,
    legs: [{ type: 'P', strike: k, side: -1 }, { type: 'P', strike: offsetStrike(symbol, k, -w), side: 1 }],
  }
}

/** Make sure the chain and a block exist, point the chain at the trade, and highlight targets. */
export function prepareGuided(t: GuidedTrade): string | null {
  const s = useStore.getState()
  s.setActiveSymbol(t.symbol, { force: true })
  if (!shapesOfKind('chain').length || !shapesOfKind('strategy').length) placeAll(['chain', 'strategy'])
  const e = getEditor()
  const chain = shapesOfKind('chain')[0]
  if (e && chain) {
    e.updateShape<AriesWidgetShape>({ id: chain.id, type: 'aries-widget', props: { expiry: t.expiry, filter: t.legs[0].type === 'C' ? 'calls' : 'puts', layout: 'list' } })
  }
  const block = shapesOfKind('strategy').map((b) => useStore.getState().strategies[b.props.refId]).find((st) => st && (!st.legs.length || st.symbol === t.symbol))
  const id = block?.id ?? shapesOfKind('strategy')[0]?.props.refId ?? null
  if (id) {
    const st = useStore.getState().strategies[id]
    if (st && st.status === 'filled') s.clearStrategy(id)
    s.setActiveStrategy(id)
  }
  s.setOnboarding({ guide: t.legs.map((l) => `${l.type}${l.strike}${l.side > 0 ? 'buy' : 'sell'}`).join(',') })
  if (e && chain && id) {
    const ids = [chain.id, strategyShapeId(id)]
    const bounds = ids.map((i) => e.getShapePageBounds(i)).filter(Boolean)
    if (bounds.length) {
      const b = bounds.reduce((a, c) => a!.clone().union(c!))!
      zoomToContent({ bounds: b })
    }
  } else zoomToContent()
  return id
}

export function doItForMe(t: GuidedTrade, strategyId: string) {
  const s = useStore.getState()
  const st = s.strategies[strategyId]
  for (const l of t.legs) {
    const has = st?.legs.some((x) => x.contract.strike === l.strike && x.contract.type === l.type && x.side === l.side && x.contract.expiry === t.expiry)
    if (!has) s.addLeg(strategyId, { symbol: t.symbol, expiry: t.expiry, strike: l.strike, type: l.type }, l.side)
  }
}
