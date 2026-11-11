import { useEffect, useState } from 'react'
import { useValue, type TLShapeId } from 'tldraw'
import { WIDGETS } from '../content/widgets'
import { chainTakeaway, chartTakeaway, ivTakeaway, keyStatsTakeaway, oiTakeaway, sentimentTakeaway, volumeTakeaway } from '../engine/research'
import { fmtNet } from '../engine/strategy'
import { Info } from '../help/Info'
import { track } from '../store/events'
import { useStore, type FirstStep } from '../store'
import { useEditorRef } from '../canvas/editorRef'
import { spawnStrategy } from '../canvas/ops'
import type { AriesWidgetShape } from '../canvas/WidgetShape'
import { closePosition } from '../canvas/widgets/strategy'
import { Icon } from './icons'

export function Toasts() {
  const toasts = useStore((s) => s.ui.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          {t.kind === 'fill' && <span className="fill-check"><Icon.check /></span>}
          <div>
            <b>{t.title}</b>
            {t.kind === 'fill' && <span className="sim-chip inline"><span className="sim-dot" /> Simulated</span>}
            {t.body && <div className="small">{t.body}</div>}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => useStore.getState().dismissToast(t.id)}><Icon.close /></button>
        </div>
      ))}
    </div>
  )
}

/** One-time acknowledgement before the very first practice order (PRD §10). */
export function AckModal() {
  const ackFor = useStore((s) => s.ui.ackFor)
  const [checked, setChecked] = useState(false)
  if (!ackFor) return null
  const go = () => {
    const s = useStore.getState()
    s.setHelp({ ackSimulation: true })
    s.setUi({ ackFor: null })
    s.sendOrder(ackFor)
  }
  return (
    <div className="modal-scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Practice mode acknowledgement">
        <h3>Before your first practice order</h3>
        <p>This is a simulation. Prices are generated in your browser, and no order goes to a broker. Options involve risk and aren't right for everyone.</p>
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} autoFocus />
          I understand this is a simulation
        </label>
        <div className="row-gap end">
          <button type="button" className="btn" onClick={() => useStore.getState().setUi({ ackFor: null })}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!checked} onClick={go}>Send practice order</button>
        </div>
      </div>
    </div>
  )
}

/** "Start a new strategy for NVDA?" when the linked ticker changes under a block with legs (PRD §6A). */
export function SymbolPrompt() {
  const sym = useStore((s) => s.ui.symbolPrompt)
  const active = useStore((s) => (s.activeStrategyId ? s.strategies[s.activeStrategyId] : null))
  if (!sym) return null
  const s = useStore.getState()
  const done = () => s.setUi({ symbolPrompt: null })
  return (
    <div className="modal-scrim light">
      <div className="modal sm" role="dialog" aria-label={`Switch to ${sym}`}>
        <h3>Start a new strategy for {sym}?</h3>
        <p className="muted">Your {active?.symbol} strategy stays on the canvas. Legs can't mix underlyings, so {sym} trades go in a new block.</p>
        <div className="row-gap end">
          <button type="button" className="btn" onClick={() => { done(); s.setActiveSymbol(sym, { force: true }); s.setActiveStrategy(null) }}>Just switch the widgets</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              done()
              s.setActiveSymbol(sym, { force: true })
              spawnStrategy(sym, [], { at: 'right', select: true })
            }}
          >
            New {sym} strategy
          </button>
        </div>
      </div>
    </div>
  )
}

export function PositionsDock() {
  const positions = useStore((s) => s.positions)
  const [open, setOpen] = useState(true)
  if (!positions.length) return null
  return (
    <div className="dock positions-dock">
      <button type="button" className="dock-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        Positions <span className="muted">({positions.filter((p) => !p.closed).length} open)</span>
        <span className="sim-chip inline"><span className="sim-dot" /> Simulated</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul>
          {[...positions].reverse().slice(0, 5).map((p) => (
            <li key={p.id}>
              <span className="mono b">{p.symbol}</span>
              <span className="ellipsis">{p.name} × {p.units}</span>
              <span className="mono small">{fmtNet(p.net)}</span>
              {p.closed ? (
                <span className={`mono small ${p.closed.pnl >= 0 ? 'pos' : 'neg'}`}>{p.closed.pnl >= 0 ? '+' : '−'}${Math.abs(p.closed.pnl).toFixed(0)}</span>
              ) : (
                <button type="button" className="link small" onClick={() => closePosition(p.symbol)}>Close</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STEPS: { k: FirstStep; label: string }[] = [
  { k: 'dashboard', label: 'Pick your dashboard' },
  { k: 'readWidget', label: 'Read a widget' },
  { k: 'switchTicker', label: 'Switch the ticker' },
  { k: 'buildSpread', label: 'Build a spread' },
  { k: 'sendOrder', label: 'Send a practice order' },
  { k: 'tryCommand', label: 'Try the Command Bar (⌘K)' },
]

/** First Steps checklist (PRD §7A.4). */
export function FirstSteps() {
  const help = useStore((s) => s.help)
  const onboarding = useStore((s) => s.onboarding.status)
  const [collapsed, setCollapsed] = useState(false)
  const allDone = STEPS.every((x) => help.firstSteps[x.k])
  useEffect(() => {
    if (!allDone || !help.firstStepsOpen || help.firstStepsDismissed) return
    const t = setTimeout(() => useStore.getState().setHelp({ firstStepsDismissed: true }), 5000)
    return () => clearTimeout(t)
  }, [allDone, help.firstStepsOpen, help.firstStepsDismissed])
  if (!help.firstStepsOpen || help.firstStepsDismissed || onboarding === 'active') return null
  const done = STEPS.filter((x) => help.firstSteps[x.k]).length
  return (
    <div className="dock first-steps" role="region" aria-label="First Steps">
      <div className="dock-head">
        <button type="button" className="plain" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          First Steps <span className="muted">{done}/{STEPS.length}</span>
        </button>
        <div className="progress"><span style={{ width: `${(done / STEPS.length) * 100}%` }} /></div>
        <button type="button" className="icon-btn" aria-label="Dismiss First Steps" onClick={() => useStore.getState().setHelp({ firstStepsDismissed: true })}><Icon.close /></button>
      </div>
      {!collapsed && (
        <ul>
          {STEPS.map((x) => (
            <li key={x.k} className={help.firstSteps[x.k] ? 'done' : ''}>
              <span className="tick">{help.firstSteps[x.k] ? <Icon.check /> : null}</span>
              {x.label}
              {x.k === 'tryCommand' && !help.firstSteps[x.k] && (
                <button type="button" className="link small" onClick={() => useStore.getState().setUi({ commandOpen: true })}>Open</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Shortcuts() {
  const open = useStore((s) => s.help.shortcutsOpen)
  if (!open) return null
  const close = () => useStore.getState().setHelp({ shortcutsOpen: false })
  const rows: [string, string][] = [
    ['⌘K', 'Command Bar: type a trade'],
    ['?', 'Glossary'],
    ['⌥W / ⌥C / ⌥O / ⌥L / ⌥T', 'Place Watchlist, Chart, Options Chain, Market Depth, Time & Sales'],
    ['⌘Z / ⇧⌘Z', 'Undo / redo strategy edits'],
    ['↵', 'Confirm a proposed trade (Command Bar)'],
    ['Space (empty input)', 'Dictate in the Command Bar, where supported'],
    ['Esc', 'Close a panel, cancel placing, dismiss a proposal'],
    ['Delete', 'Remove the selected widget'],
  ]
  return (
    <div className="modal-scrim light" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts">
        <div className="row-between"><h3>Keyboard shortcuts</h3><button type="button" className="icon-btn" aria-label="Close" onClick={close} autoFocus><Icon.close /></button></div>
        <table className="shortcuts">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">New shortcuts avoid the existing ⌥ widget shortcuts.</p>
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <div className="footer-note" role="note">
      Built for Aries by Arpit as an independent concept. Not an official Aries product. No real trading.
    </div>
  )
}

export function takeawayFor(shape: AriesWidgetShape, sym: Parameters<typeof keyStatsTakeaway>[0], spot: number): string {
  const now = new Date()
  switch (shape.props.kind) {
    case 'keystats': return keyStatsTakeaway(sym, spot)
    case 'volume': return volumeTakeaway(sym)
    case 'sentiment': return sentimentTakeaway(sym)
    case 'news': return 'Headlines are tagged Earnings, Product or Macro. These are templated samples, not real news.'
    case 'social': return 'Each post shows its mood (bullish, bearish, neutral). Fictional accounts, sample text.'
    case 'chart': return chartTakeaway(sym, spot)
    case 'chain': return chainTakeaway(sym, spot, now)
    case 'ivrank': return ivTakeaway(sym)
    case 'oi': return oiTakeaway(sym, spot, now)
    case 'strategy': return 'Drop contracts here. The block names the trade, draws what you could make or lose, and holds the order.'
    default: return WIDGETS[shape.props.kind].about
  }
}

/** "How to read this" hotspot anchored to a just-placed widget (PRD §5.3 Step 4). */
export function Hotspot() {
  const id = useStore((s) => s.ui.hotspot)
  const editor = useEditorRef()
  const sym = useStore((s) => s.activeSymbol)
  const spot = useStore((s) => s.spots[s.activeSymbol])
  const pos = useValue(
    'hotspot-pos',
    () => {
      if (!editor || !id) return null
      const b = editor.getShapePageBounds(id as TLShapeId)
      if (!b) return null
      const p = editor.pageToScreen({ x: b.maxX, y: b.minY })
      editor.getCamera()
      return { x: p.x, y: p.y }
    },
    [editor, id],
  )
  useEffect(() => {
    if (id) {
      track('hotspot_opened', { id })
      useStore.getState().completeStep('readWidget')
    }
  }, [id])
  if (!id || !editor || !pos) return null
  const shape = editor.getShape(id as TLShapeId) as AriesWidgetShape | undefined
  if (!shape) return null
  const close = () => useStore.getState().setUi({ hotspot: null })
  return (
    <div className="hotspot" style={{ left: Math.min(window.innerWidth - 300, pos.x + 12), top: Math.max(70, pos.y) }} role="dialog" aria-label="How to read this">
      <span className="hotspot-dot" aria-hidden />
      <div className="label">How to read this · {WIDGETS[shape.props.kind].title}</div>
      <p>{takeawayFor(shape, sym, spot)}</p>
      <div className="row-gap">
        <button type="button" className="btn btn-primary sm" onClick={close} autoFocus>Got it</button>
        <button type="button" className="link small" onClick={() => { close(); useStore.getState().setHelp({ hotspots: false }) }}>Skip tips</button>
        <Info term={WIDGETS[shape.props.kind].term} />
      </div>
    </div>
  )
}

export function MobileGate() {
  return (
    <div className="mobile-gate">
      <div>
        <h2>Best on desktop</h2>
        <p>This options canvas prototype is built for a desktop browser. Open it on a laptop or desktop, at least 1000px wide.</p>
        <p className="muted small">Practice mode. Simulated data. Not an official Aries product.</p>
      </div>
    </div>
  )
}
