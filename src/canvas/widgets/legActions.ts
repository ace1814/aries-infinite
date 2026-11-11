import type { Contract } from '../../engine/chain'
import type { Side } from '../../engine/types'
import { newLegId } from '../../parser/resolve'
import { useStore } from '../../store'
import { getEditor } from '../editorRef'
import { ensureStrategyShape, shapesOfKind, spawnStrategy, strategyShapeId } from '../ops'

const pick = (c: Contract): Contract => ({ symbol: c.symbol, expiry: c.expiry, strike: c.strike, type: c.type })

/** Target for click-to-add: the active block if it fits, else any empty block, else a new one. */
function targetStrategy(symbol: string): string | null {
  const s = useStore.getState()
  const e = getEditor()
  const onCanvas = (id: string) => !!e?.getShape(strategyShapeId(id))
  const active = s.activeStrategyId ? s.strategies[s.activeStrategyId] : null
  if (active && active.onCanvas && onCanvas(active.id)) return active.id
  const blocks = shapesOfKind('strategy').map((sh) => s.strategies[sh.props.refId]).filter(Boolean)
  const fit = blocks.find((b) => !b.legs.length || b.symbol === symbol)
  return fit?.id ?? null
}

export function addLegFromChain(contract: Contract, side: Side, strategyId?: string) {
  const s = useStore.getState()
  const c = pick(contract)
  const id = strategyId ?? targetStrategy(c.symbol)
  if (!id) {
    spawnStrategy(c.symbol, [{ id: newLegId(), contract: c, side, qty: 1 }], { at: 'right', select: false })
    return
  }
  ensureStrategyShape(id)
  const r = s.addLeg(id, c, side)
  if (!r.ok && r.reason) s.toast({ kind: 'error', title: r.reason, body: 'Start a new Strategy Block for a different stock.' })
}
