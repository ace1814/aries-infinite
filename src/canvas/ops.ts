import { createShapeId, type Box, type TLShapeId } from 'tldraw'
import type { Sym } from '../config'
import { WIDGETS, type WidgetKind } from '../content/widgets'
import type { Leg } from '../engine/types'
import { generateLayout, type PlacedWidget } from '../onboarding/layout'
import { track } from '../store/events'
import { useStore, type WidgetRecord } from '../store'
import { getEditor } from './editorRef'
import type { AriesWidgetShape } from './WidgetShape'

export const SHAPE_TYPE = 'aries-widget'

export const strategyShapeId = (strategyId: string) => createShapeId('st-' + strategyId)

export function widgetShapes(): AriesWidgetShape[] {
  const e = getEditor()
  if (!e) return []
  return e.getCurrentPageShapes().filter((s): s is AriesWidgetShape => s.type === SHAPE_TYPE)
}

export function shapesOfKind(kind: WidgetKind): AriesWidgetShape[] {
  return widgetShapes().filter((s) => s.props.kind === kind)
}

let syncing = false
export const isSyncing = () => syncing

function withSync<T>(fn: () => T): T {
  syncing = true
  try {
    return fn()
  } finally {
    syncing = false
  }
}

/** Create a widget with its top-left at (x, y) in page space. */
export function createWidget(kind: WidgetKind, x: number, y: number, opts: { w?: number; h?: number; refId?: string } = {}): TLShapeId | null {
  const e = getEditor()
  if (!e) return null
  const def = WIDGETS[kind]
  let refId = opts.refId ?? ''
  let id: TLShapeId = createShapeId()
  if (kind === 'strategy') {
    if (!refId) {
      const s = useStore.getState()
      refId = s.createStrategy({ symbol: null, pos: { x, y } })
    }
    id = strategyShapeId(refId)
    if (e.getShape(id)) return id
  }
  withSync(() =>
    e.createShape<AriesWidgetShape>({
      id,
      type: SHAPE_TYPE,
      x,
      y,
      props: { w: opts.w ?? def.w, h: opts.h ?? def.h, kind, refId, linked: true, symbol: '', expiry: '', filter: '', layout: '' },
    }),
  )
  track('widget_placed', { kind })
  return id
}

/** Center of the current viewport in page space. */
export function viewportCenter(): { x: number; y: number } {
  const e = getEditor()
  if (!e) return { x: 0, y: 0 }
  const b = e.getViewportPageBounds()
  return { x: b.center.x, y: b.center.y }
}

/** A free spot to the right of everything on the canvas. */
export function freeSpot(w: number, h: number): { x: number; y: number } {
  const e = getEditor()
  if (!e) return { x: 0, y: 0 }
  const shapes = widgetShapes()
  if (!shapes.length) {
    const c = viewportCenter()
    return { x: c.x - w / 2, y: c.y - h / 2 }
  }
  const bounds = shapes.map((s) => e.getShapePageBounds(s.id)!).filter(Boolean)
  const right = Math.max(...bounds.map((b) => b.maxX))
  const top = Math.min(...bounds.map((b) => b.minY))
  return { x: right + 48, y: top }
}

/** Spawn a Strategy Block, optionally prefilled. Returns the strategy id. */
export function spawnStrategy(
  symbol: Sym | null,
  legs: Leg[] = [],
  opts: { at?: 'viewport' | 'right' | { x: number; y: number }; proposed?: boolean; label?: string; units?: number; closesPositionId?: string; limit?: number; select?: boolean } = {},
): string {
  const w = WIDGETS.strategy.w
  const h = WIDGETS.strategy.h
  let pos: { x: number; y: number }
  if (opts.at === 'viewport') {
    // Centered horizontally, top edge just below the Command Bar.
    const c = viewportCenter()
    const e = getEditor()
    const top = e ? e.screenToPage({ x: window.innerWidth / 2, y: 250 }).y : c.y - h / 2
    pos = { x: c.x - w / 2, y: top }
  } else if (opts.at && typeof opts.at === 'object') pos = opts.at
  else pos = freeSpot(w, h)
  const s = useStore.getState()
  const id = s.createStrategy({
    symbol,
    legs,
    pos,
    proposed: opts.proposed,
    label: opts.label,
    units: opts.units ?? 1,
    closesPositionId: opts.closesPositionId,
    ...(typeof opts.limit === 'number' ? { priceMode: 'custom' as const, limit: opts.limit, quotedNet: null } : {}),
  })
  ensureStrategyShape(id)
  if (opts.select) selectStrategy(id)
  return id
}

export function ensureStrategyShape(id: string) {
  const e = getEditor()
  const st = useStore.getState().strategies[id]
  if (!e || !st || !st.onCanvas) return
  const sid = strategyShapeId(id)
  if (e.getShape(sid)) return
  const pos = st.pos ?? freeSpot(WIDGETS.strategy.w, WIDGETS.strategy.h)
  createWidget('strategy', pos.x, pos.y, { refId: id })
}

export function selectStrategy(id: string, zoom = false) {
  const e = getEditor()
  if (!e) return
  const sid = strategyShapeId(id)
  if (!e.getShape(sid)) return
  e.select(sid)
  useStore.getState().setActiveStrategy(id)
  if (zoom) {
    const b = e.getShapePageBounds(sid)
    if (b) e.zoomToBounds(b.clone().expandBy(80), { animation: { duration: 320 }, targetZoom: Math.min(1, e.getZoomLevel()) })
  }
}

/** Keep canvas shapes and the strategy store in step (undo, dismiss, restore). */
export function syncStrategiesToCanvas() {
  const e = getEditor()
  if (!e) return
  const { strategies } = useStore.getState()
  for (const st of Object.values(strategies)) if (st.onCanvas) ensureStrategyShape(st.id)
  const toDelete = shapesOfKind('strategy').filter((s) => !strategies[s.props.refId]?.onCanvas)
  if (toDelete.length) {
    // Remember where they were so undo can restore them in place.
    withSync(() => e.deleteShapes(toDelete.map((s) => s.id)))
  }
}

export function onUserDeletedShape(shape: AriesWidgetShape) {
  if (syncing || shape.props.kind !== 'strategy') return
  const s = useStore.getState()
  const st = s.strategies[shape.props.refId]
  if (st?.onCanvas) {
    s.patchStrategy(st.id, { onCanvas: false, pos: { x: shape.x, y: shape.y } })
    if (s.activeStrategyId === st.id) s.setActiveStrategy(null)
  }
}

/** Remember positions of strategy blocks so undo restores them in place. */
export function rememberStrategyPos(shape: AriesWidgetShape) {
  if (shape.props.kind !== 'strategy') return
  const s = useStore.getState()
  const st = s.strategies[shape.props.refId]
  if (st && (st.pos?.x !== shape.x || st.pos?.y !== shape.y)) s.patchStrategy(st.id, { pos: { x: shape.x, y: shape.y } }, { history: false })
}

/**
 * Apply a layout: move existing widgets of a kind into place, create the missing ones.
 */
export function applyLayout(placed: PlacedWidget[], opts: { animate?: boolean; zoom?: boolean } = {}) {
  const e = getEditor()
  if (!e) return
  const used = new Set<string>()
  e.run(() => {
    for (const p of placed) {
      const existing = shapesOfKind(p.kind).find((s) => !used.has(s.id))
      if (existing) {
        used.add(existing.id)
        if (opts.animate) {
          e.animateShape({ id: existing.id, type: SHAPE_TYPE, x: p.x, y: p.y, props: { w: p.w, h: p.h } } as AriesWidgetShape, { animation: { duration: 380 } })
        } else {
          e.updateShape<AriesWidgetShape>({ id: existing.id, type: SHAPE_TYPE, x: p.x, y: p.y, props: { w: p.w, h: p.h } })
        }
      } else {
        let refId: string | undefined
        if (p.kind === 'strategy') {
          const s = useStore.getState()
          const reuse = s.activeStrategyId && s.strategies[s.activeStrategyId] && !e.getShape(strategyShapeId(s.activeStrategyId)) ? s.activeStrategyId : undefined
          refId = reuse ?? s.createStrategy({ symbol: null, pos: { x: p.x, y: p.y } })
          s.patchStrategy(refId, { onCanvas: true, pos: { x: p.x, y: p.y } }, { history: false })
        }
        const id = createWidget(p.kind, p.x, p.y, { w: p.w, h: p.h, refId })
        if (id) used.add(id)
      }
    }
  })
  if (opts.zoom !== false) setTimeout(() => zoomToContent(), opts.animate ? 420 : 30)
}

/** Fit all widgets into the free part of the screen (leaves room for bars and the coach panel). */
export function zoomToContent(opts: { animate?: boolean; bounds?: Box } = {}) {
  const e = getEditor()
  if (!e) return
  if (!widgetShapes().length) return
  const b = opts.bounds ?? e.getCurrentPageBounds()
  if (!b) return
  const coach = document.querySelector('.coach')
  const left = coach ? coach.getBoundingClientRect().right + 24 : 40
  const top = 78
  const right = 24
  const bottom = 44
  const vw = window.innerWidth
  const vh = window.innerHeight
  const availW = Math.max(200, vw - left - right)
  const availH = Math.max(200, vh - top - bottom)
  const z = Math.max(0.3, Math.min(1, availW / b.w, availH / b.h))
  const sx = left + (availW - b.w * z) / 2
  const sy = top + Math.max(0, (availH - b.h * z) / 2)
  e.setCamera({ x: sx / z - b.minX, y: sy / z - b.minY, z }, opts.animate === false ? undefined : { animation: { duration: 380 } })
}

/** Tidy up: arrange current widgets into the generated zones (PRD §5.3 Step 4). */
export function tidyUp() {
  const kinds = widgetShapes()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((s) => s.props.kind)
  const ordered = orderForLayout(kinds)
  const placed = generateLayout(ordered)
  // Several strategy blocks: stack the extra ones to the right.
  const extraBlocks = shapesOfKind('strategy').slice(1)
  const main = placed.find((p) => p.kind === 'strategy')
  extraBlocks.forEach((_, i) => {
    if (main) placed.push({ kind: 'strategy', x: main.x + (main.w + 40) * (i + 1), y: 0, w: main.w, h: main.h })
  })
  applyLayout(placed, { animate: true })
}

function orderForLayout(kinds: WidgetKind[]): WidgetKind[] {
  const profileOrder = useStore.getState().layout.map((l) => l.kind)
  const uniq: WidgetKind[] = []
  for (const k of [...profileOrder, ...kinds]) if (kinds.includes(k) && !uniq.includes(k)) uniq.push(k)
  // Keep only one of each for layout purposes (extra strategy blocks handled separately).
  return uniq
}

export function layoutSnapshot(): WidgetRecord[] {
  return widgetShapes().map((s) => ({
    id: s.id,
    kind: s.props.kind,
    x: s.x,
    y: s.y,
    w: s.props.w,
    h: s.props.h,
    refId: s.props.refId || undefined,
    linked: s.props.linked,
    symbol: (s.props.symbol || undefined) as Sym | undefined,
  }))
}

export function restoreLayout(records: WidgetRecord[]) {
  const e = getEditor()
  if (!e) return
  const strategies = useStore.getState().strategies
  withSync(() => {
    for (const r of records) {
      if (e.getShape(r.id as TLShapeId)) continue
      if (r.kind === 'strategy' && (!r.refId || !strategies[r.refId]?.onCanvas)) continue
      e.createShape<AriesWidgetShape>({
        id: r.id as TLShapeId,
        type: SHAPE_TYPE,
        x: r.x,
        y: r.y,
        props: { w: r.w, h: r.h, kind: r.kind, refId: r.refId ?? '', linked: r.linked ?? true, symbol: r.symbol ?? '', expiry: '', filter: '', layout: '' },
      })
    }
  })
}

export function removeAllWidgets() {
  const e = getEditor()
  if (!e) return
  withSync(() => e.deleteShapes(widgetShapes().map((s) => s.id)))
}

export function pulseShape(id: TLShapeId) {
  const el = document.querySelector(`[data-shape-id="${id}"] .widget`)
  if (!el) return
  el.classList.remove('pulse-ring')
  void (el as HTMLElement).offsetWidth
  el.classList.add('pulse-ring')
}
