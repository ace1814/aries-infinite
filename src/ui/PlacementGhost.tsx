import { useEffect, useState } from 'react'
import { WIDGETS } from '../content/widgets'
import { createWidget, freeSpot } from '../canvas/ops'
import { getEditor } from '../canvas/editorRef'
import { useStore } from '../store'

/** Aries-style placement: a dashed green ghost follows the cursor; click to place (PRD §2.1). */
export function PlacementGhost() {
  const placing = useStore((s) => s.ui.placing)
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!placing) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useStore.getState().setUi({ placing: null })
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [placing])
  if (!placing) return null
  const def = WIDGETS[placing.kind]
  const w = placing.size?.w ?? def.w
  const h = placing.size?.h ?? def.h
  const zoom = getEditor()?.getZoomLevel() ?? 1

  const place = (clientX?: number, clientY?: number) => {
    const e = getEditor()
    if (!e) return
    let x: number, y: number
    if (clientX === undefined || clientY === undefined) {
      const p = freeSpot(w, h)
      x = p.x
      y = p.y
    } else {
      const p = e.screenToPage({ x: clientX, y: clientY })
      x = p.x - w / 2
      y = p.y - 40
    }
    const id = createWidget(placing.kind, x, y, { w, h })
    const s = useStore.getState()
    s.setUi({ placing: null, lastPlaced: id ?? null, hotspot: s.onboarding.status === 'active' && s.help.hotspots && id ? id : s.ui.hotspot })
  }

  return (
    <div
      className="ghost-layer"
      onPointerMove={(e) => setPt({ x: e.clientX, y: e.clientY })}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.ghost-bar')) return
        e.preventDefault()
        place(e.clientX, e.clientY)
      }}
    >
      {pt && (
        <div className="place-ghost" style={{ left: pt.x - (w * zoom) / 2, top: pt.y - 40 * zoom, width: w * zoom, height: h * zoom }}>
          <span>{placing.label ?? def.title}</span>
        </div>
      )}
      <div className="ghost-bar" role="dialog" aria-label={`Place ${def.title}`}>
        <span>Click anywhere to place <b>{def.title}</b></span>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => place()}>
          Place here
        </button>
        <button type="button" className="btn" onClick={() => useStore.getState().setUi({ placing: null })}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
