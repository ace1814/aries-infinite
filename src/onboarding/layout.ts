import { EXPLORER_MAX_WIDGETS } from '../config'
import { WIDGETS, type WidgetKind } from '../content/widgets'
import type { Level } from '../engine/types'

export interface PlacedWidget {
  kind: WidgetKind
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardPlan {
  /** Widgets placed now, in placement order: research → chain → strategy (PRD §5.3 Step 4). */
  place: WidgetKind[]
  /** Chosen but held back so the first canvas is not overwhelming (PRD §5.5). */
  later: WidgetKind[]
}

export function planDashboard(level: Level, research: WidgetKind[]): DashboardPlan {
  const extras: WidgetKind[] = []
  const r = research.filter((k) => k !== 'greeks' && k !== 'strategy' && k !== 'chain')
  if (research.includes('greeks')) extras.push('greeks')
  if (level === 'explorer') {
    const slots = Math.max(0, EXPLORER_MAX_WIDGETS - 2)
    return { place: [...r.slice(0, slots), 'chain', 'strategy'], later: r.slice(slots) }
  }
  return { place: [...r, 'chain', 'strategy', ...extras], later: [] }
}

const GAP = 28

/**
 * Left zone "Research", center "Premiums", right "Trade" (PRD §5.5).
 * The first thing the user said they check sits nearest the top-left.
 */
export function generateLayout(kinds: WidgetKind[]): PlacedWidget[] {
  const research = kinds.filter((k) => WIDGETS[k].group !== 'trade' && k !== 'chain')
  const trade = kinds.filter((k) => WIDGETS[k].group === 'trade')
  const out: PlacedWidget[] = []
  // Research: one column up to 3, two columns beyond.
  const cols = research.length > 3 ? 2 : 1
  const colX = [0, 0]
  const colY = [0, 0]
  const colW = 380
  research.forEach((k, i) => {
    const c = cols === 2 ? i % 2 : 0
    const def = WIDGETS[k]
    const w = k === 'chart' ? (cols === 2 ? colW : 520) : colW
    const h = k === 'chart' ? 340 : def.h
    colX[c] = c * (colW + GAP)
    out.push({ kind: k, x: colX[c], y: colY[c], w, h })
    colY[c] += h + GAP
  })
  const researchRight = research.length ? Math.max(...out.map((o) => o.x + o.w)) + GAP * 2 : 0
  let x = researchRight
  if (kinds.includes('chain')) {
    out.push({ kind: 'chain', x, y: 0, w: WIDGETS.chain.w, h: WIDGETS.chain.h })
    x += WIDGETS.chain.w + GAP * 2
  }
  let ty = 0
  for (const k of trade) {
    if (k === 'strategy') {
      out.push({ kind: k, x, y: 0, w: WIDGETS.strategy.w, h: WIDGETS.strategy.h })
    } else {
      out.push({ kind: k, x: x + WIDGETS.strategy.w + GAP, y: ty, w: WIDGETS[k].w, h: WIDGETS[k].h })
      ty += WIDGETS[k].h + GAP
    }
  }
  return out
}
