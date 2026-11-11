import { useEffect, useMemo, useRef, useState } from 'react'
import { GLOSSARY, GROUP_ORDER, type GlossaryEntry } from '../content/glossary'
import type { Level } from '../engine/types'
import { useStore } from '../store'
import { Icon } from '../ui/icons'

/** Right-side glossary drawer, opened with `?` (PRD §7A.3). */
export function GlossaryDrawer() {
  const open = useStore((s) => s.help.glossaryOpen)
  const focusTerm = useStore((s) => s.help.glossaryTerm)
  const level = useStore((s) => s.level)
  const [q, setQ] = useState('')
  const [view, setView] = useState<Level>(level)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => setView(level), [level])
  useEffect(() => {
    if (!open) return
    if (focusTerm) {
      setQ('')
      setTimeout(() => document.getElementById('gl-' + focusTerm)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
    } else setTimeout(() => inputRef.current?.focus(), 30)
  }, [open, focusTerm])
  const entries = useMemo(() => {
    const t = q.trim().toLowerCase()
    return Object.entries(GLOSSARY).filter(([, e]) => !t || e.term.toLowerCase().includes(t) || e.short.toLowerCase().includes(t) || e.explorer.toLowerCase().includes(t))
  }, [q])
  if (!open) return null
  const close = () => useStore.getState().setHelp({ glossaryOpen: false, glossaryTerm: null })
  const showOnCanvas = (term: string) => {
    const els = document.querySelectorAll(`[data-term="${term}"]`)
    if (!els.length) {
      useStore.getState().toast({ kind: 'info', title: 'Not on screen right now', body: 'Add a widget that uses this term, then try again.' })
      return
    }
    els.forEach((el) => {
      el.classList.remove('pulse')
      void (el as HTMLElement).offsetWidth
      el.classList.add('pulse')
    })
    els[0].scrollIntoView({ block: 'nearest' })
  }
  const text = (e: GlossaryEntry) => (view === 'explorer' ? e.explorer : view === 'trader' ? e.trader : e.pro)
  return (
    <aside className="drawer glossary" aria-label="Glossary" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <header className="drawer-head">
        <strong>Glossary</strong>
        <div className="seg seg-sm" role="radiogroup" aria-label="Explanation level">
          {(['explorer', 'trader', 'pro'] as Level[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={view === l} className={view === l ? 'on' : ''} onClick={() => setView(l)}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Close glossary" onClick={close}><Icon.close /></button>
      </header>
      <input ref={inputRef} className="search" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search glossary" />
      <div className="drawer-body">
        {GROUP_ORDER.map((g) => {
          const items = entries.filter(([, e]) => e.group === g)
          if (!items.length) return null
          return (
            <section key={g}>
              <h4>{g}</h4>
              {items.map(([k, e]) => (
                <div key={k} id={'gl-' + k} className={`gl-entry ${focusTerm === k ? 'focus' : ''}`}>
                  <div className="row-between">
                    <b>{e.term}</b>
                    <button type="button" className="link small" onClick={() => showOnCanvas(k)}>Show on canvas</button>
                  </div>
                  <p>{text(e)}</p>
                  {e.why && <p className="muted small">Why it matters: {e.why}</p>}
                </div>
              ))}
            </section>
          )
        })}
        <p className="muted small pad-sm">Explanations describe; they never advise. Practice mode, simulated data.</p>
      </div>
    </aside>
  )
}
