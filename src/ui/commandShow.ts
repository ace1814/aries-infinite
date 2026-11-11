import type { Sym } from '../config'
import { useStore } from '../store'
import { createWidget, freeSpot, shapesOfKind } from '../canvas/ops'
import { WIDGETS } from '../content/widgets'

/** "show NVDA chain": switch the linked symbol and make sure a chain exists. */
export function applyShow(sym: Sym) {
  useStore.getState().setActiveSymbol(sym, { force: true })
  if (!shapesOfKind('chain').length) {
    const p = freeSpot(WIDGETS.chain.w, WIDGETS.chain.h)
    createWidget('chain', p.x, p.y)
  }
}
