import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { entry, textFor } from '../content/glossary'
import { track } from '../store/events'
import { useStore } from '../store'
import { Floating, rectOf, stop, type AnchorRect } from '../ui/primitives'

let closeOthers: (() => void) | null = null

/**
 * ⓘ button with three layers (PRD §7A.1): hover tooltip, click popover, glossary.
 * Real <button>, focusable, labelled; never starts a drag.
 */
export function Info({ term, example, label, onOpen }: { term: string; example?: string; label?: string; onOpen?: () => void }) {
  const level = useStore((s) => s.level)
  const explain = useStore((s) => s.help.explainMode)
  const ref = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState<AnchorRect | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const e = entry(term)

  const close = useCallback(() => setOpen(null), [])
  const show = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTip(rectOf(ref.current)), explain ? 0 : 380)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setTip(null)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = () => {
    hide()
    if (open) return setOpen(null)
    closeOthers?.()
    closeOthers = () => setOpen(null)
    setOpen(rectOf(ref.current))
    track('info_opened', { term })
    onOpen?.()
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="info-btn"
        data-term={term}
        aria-label={`What is ${label ?? e.term}?`}
        aria-expanded={!!open}
        onPointerDown={stop}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(ev) => {
          ev.stopPropagation()
          toggle()
        }}
      >
        i
      </button>
      {tip && !open &&
        createPortal(
          <div className="tooltip" role="tooltip" style={{ left: Math.min(window.innerWidth - 250, Math.max(8, tip.left + tip.width / 2 - 120)), top: tip.top - 8 }}>
            {e.short}
          </div>,
          document.body,
        )}
      {open && (
        <Floating anchor={open} onClose={close} width={300} className="info-pop">
          <div className="info-pop-head">
            <strong>{e.term}</strong>
            <span className="muted small">{e.group}</span>
          </div>
          <p>{textFor(term, level)}</p>
          {e.why && (
            <p className="muted">
              <strong>Why it matters: </strong>
              {e.why}
            </p>
          )}
          {example && <p className="info-example">{example}</p>}
          <button
            type="button"
            className="link"
            onClick={() => {
              setOpen(null)
              useStore.getState().setHelp({ glossaryOpen: true, glossaryTerm: term })
              track('glossary_opened', { from: 'info', term })
            }}
          >
            Open in glossary →
          </button>
        </Floating>
      )}
    </>
  )
}

/** Label + ⓘ convenience. */
export function Term({ children, term, example }: { children: React.ReactNode; term: string; example?: string }) {
  return (
    <span className="term">
      {children}
      <Info term={term} example={example} />
    </span>
  )
}
