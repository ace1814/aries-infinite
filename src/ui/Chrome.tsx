import { useRef, useState, type ReactNode } from 'react'
import { ACCOUNT_BUYING_POWER, ACCOUNT_CASH, SHELL_ONLY } from '../config'
import { WIDGETS, WIDGET_MENU, type WidgetKind } from '../content/widgets'
import { fmtNet } from '../engine/strategy'
import { Info } from '../help/Info'
import { track } from '../store/events'
import { useStore } from '../store'
import { tidyUp } from '../canvas/ops'
import { getEditor } from '../canvas/editorRef'
import type { Level } from '../engine/types'
import { Icon, WidgetIcon } from './icons'
import { Logo } from './Logo'
import { Floating, rectOf, type AnchorRect } from './primitives'

function usePop() {
  const [a, setA] = useState<AnchorRect | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  return { a, ref, toggle: () => setA(a ? null : rectOf(ref.current)), close: () => setA(null) }
}

function ToolBtn({ label, children, pop, badge, active, brand, onClick }: { label: string; children: ReactNode; pop?: ReturnType<typeof usePop>; badge?: number; active?: boolean; brand?: boolean; onClick?: () => void }) {
  return (
    <button ref={pop?.ref} type="button" className={`tool ${active ? 'on' : ''} ${brand ? 'brand' : ''}`} aria-label={label} title={label} onClick={onClick ?? pop?.toggle}>
      {children}
      {!!badge && <span className="tool-badge">{badge}</span>}
    </button>
  )
}

export function startPlacing(kind: WidgetKind) {
  const s = useStore.getState()
  s.setUi({ placing: { kind } })
}

export function Chrome() {
  return (
    <>
      <LeftPill />
      <CenterBar />
      <RightPill />
    </>
  )
}

function LeftPill() {
  const menu = usePop()
  const s = useStore()
  const levels: Level[] = ['explorer', 'trader', 'pro']
  return (
    <div className="pill pill-left">
      <span className="pill-logo"><Logo /></span>
      <button type="button" className="canvas-tab">Canvas</button>
      <span className="tool-sep" aria-hidden />
      <button type="button" className="tool sm" aria-label="New canvas" title="New canvas" onClick={() => s.toast({ kind: 'info', title: 'One canvas in this prototype', body: 'Aries supports several canvases; this demo keeps one.' })}>
        <Icon.plus />
      </button>
      <span className="tool-sep" aria-hidden />
      <ToolBtn label="Canvas menu" pop={menu}><Icon.more /></ToolBtn>
      {menu.a && (
        <Floating anchor={menu.a} onClose={menu.close} className="menu" width={280}>
          <button type="button" className="menu-item" onClick={() => { menu.close(); s.setOnboarding({ status: 'active', step: 1, guide: null }) }}>Replay options intro</button>
          <button type="button" className="menu-item" onClick={() => { menu.close(); s.setUi({ customizeOpen: true }) }}>Customize dashboard</button>
          <button type="button" className="menu-item" onClick={() => { menu.close(); tidyUp() }}>Tidy up <Info term="tidy" /></button>
          <div className="menu-sep" />
          <div className="menu-label">Practice level <Info term="level" /></div>
          <div className="menu-row">
            {levels.map((l) => (
              <button type="button" key={l} className={`chip ${s.level === l ? 'on' : ''}`} onClick={() => s.setLevel(l)}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <label className="menu-item toggle">
            <input type="checkbox" checked={s.help.explainMode} onChange={(e) => s.setHelp({ explainMode: e.target.checked })} />
            Explain everything <Info term="explain" />
          </label>
          <label className="menu-item toggle">
            <input type="checkbox" checked={s.feedPaused} onChange={(e) => s.set({ feedPaused: e.target.checked })} />
            Pause simulated prices
          </label>
          <button type="button" className="menu-item" onClick={() => { menu.close(); s.setHelp({ firstStepsOpen: true, firstStepsDismissed: false }) }}>First Steps checklist</button>
          <button type="button" className="menu-item" onClick={() => { menu.close(); s.setHelp({ glossaryOpen: true }); track('glossary_opened', { from: 'menu' }) }}>Glossary <kbd>?</kbd></button>
          <button type="button" className="menu-item" onClick={() => { menu.close(); s.setHelp({ shortcutsOpen: true }) }}>Keyboard shortcuts</button>
          <div className="menu-sep" />
          <button type="button" className="menu-item danger" onClick={() => s.resetPractice()}>Reset practice data</button>
        </Floating>
      )}
    </div>
  )
}

function CenterBar() {
  const widgets = usePop()
  const orders = usePop()
  const live = usePop()
  const acct = usePop()
  const apps = usePop()
  const s = useStore()
  const open = s.positions.filter((p) => !p.closed)
  const level = s.level
  const lockedFor = (k: WidgetKind) => {
    const m = WIDGETS[k].minLevel
    return m && (['explorer', 'trader', 'pro'].indexOf(m) > ['explorer', 'trader', 'pro'].indexOf(level))
  }
  return (
    <div className="center-wrap">
      <div className="pill pill-center" role="toolbar" aria-label="Canvas tools">
        <ToolBtn label="Add widget" pop={widgets}><Icon.candles /></ToolBtn>
        <ToolBtn label="Orders and positions" pop={orders} badge={open.length}><Icon.orders /></ToolBtn>
        <ToolBtn label="Live data" pop={live}><span className={`live-ind ${s.feedPaused || s.feedStale ? 'off' : ''}`}><Icon.live /></span></ToolBtn>
        <ToolBtn label="Account" pop={acct}><Icon.account /></ToolBtn>
        <span className="tool-sep" aria-hidden />
        <ToolBtn label="Apps" pop={apps}><Icon.apps /></ToolBtn>
      </div>
      {!SHELL_ONLY && s.addLater.length > 0 && s.onboarding.status !== 'active' && (
        <div className="add-later">
          <span className="muted small">Add later:</span>
          {s.addLater.map((k) => (
            <button type="button" key={k} className="chip" onClick={() => { s.set({ addLater: s.addLater.filter((x) => x !== k) }); startPlacing(k) }}>
              + {WIDGETS[k].title}
            </button>
          ))}
        </div>
      )}
      {widgets.a && (
        <Floating anchor={widgets.a} onClose={widgets.close} className="menu widget-menu" width={290}>
          {WIDGET_MENU.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="menu-sep" />}
              <div className="menu-label">{gi === 0 ? 'Widgets' : gi === 1 ? 'Research' : 'Trade'}</div>
              {group.map((k) => {
                const d = WIDGETS[k]
                const locked = lockedFor(k)
                return (
                  <button
                    type="button"
                    key={k}
                    className={`menu-item ${locked ? 'locked' : ''}`}
                    onClick={() => {
                      widgets.close()
                      if (locked) {
                        s.toast({ kind: 'info', title: `${d.title} starts at ${d.minLevel} level`, body: 'Switch level in the ⋮ menu (practice mode).' })
                        return
                      }
                      startPlacing(k)
                    }}
                  >
                    <span className="mi-icon" aria-hidden><WidgetIcon kind={k} size={20} /></span>
                    {d.title}
                    {locked && <Icon.lock />}
                    {d.shortcut && <span className="mi-keys"><kbd>⌥</kbd><kbd>{d.shortcut.slice(3)}</kbd></span>}
                  </button>
                )
              })}
            </div>
          ))}
        </Floating>
      )}
      {orders.a && (
        <Floating anchor={orders.a} onClose={orders.close} className="menu" width={330}>
          <div className="menu-label">Positions (simulated)</div>
          {!s.positions.length && <div className="pad-sm muted small">No practice orders yet.</div>}
          {[...s.positions].reverse().map((p) => (
            <div key={p.id} className="pos-row">
              <div>
                <b>{p.symbol}</b> {p.name} <span className="muted small">× {p.units}</span>
              </div>
              <div className="small mono">{p.closed ? <span className={p.closed.pnl >= 0 ? 'pos' : 'neg'}>Closed {p.closed.pnl >= 0 ? '+' : '−'}${Math.abs(p.closed.pnl).toFixed(0)}</span> : <span className="muted">Open · {fmtNet(p.net)}</span>}</div>
            </div>
          ))}
        </Floating>
      )}
      {live.a && (
        <Floating anchor={live.a} onClose={live.close} className="menu" width={260}>
          <div className="pad-sm">
            <b>Simulated feed</b>
            <p className="muted small">Prices are generated in your browser: a 1-second random walk. No live market data.</p>
            <label className="menu-item toggle">
              <input type="checkbox" checked={s.feedPaused} onChange={(e) => s.set({ feedPaused: e.target.checked })} /> Pause prices
            </label>
          </div>
        </Floating>
      )}
      {acct.a && (
        <Floating anchor={acct.a} onClose={acct.close} className="menu" width={260}>
          <div className="pad-sm stack-8">
            <b>Practice account</b>
            <div className="row-between small"><span className="muted">Cash</span><span className="mono">${ACCOUNT_CASH.toLocaleString()}</span></div>
            <div className="row-between small"><span className="muted">Buying power <Info term="buyingPower" /></span><span className="mono">${ACCOUNT_BUYING_POWER.toLocaleString()}</span></div>
            <div className="row-between small"><span className="muted">Level</span><span>{level[0].toUpperCase() + level.slice(1)} (simulated)</span></div>
            <p className="muted small">No real account, login or money is connected.</p>
          </div>
        </Floating>
      )}
      {apps.a && (
        <Floating anchor={apps.a} onClose={apps.close} className="menu" width={240}>
          <button type="button" className="menu-item" onClick={() => { apps.close(); s.setHelp({ glossaryOpen: true }) }}>Glossary</button>
          <button type="button" className="menu-item" onClick={() => { apps.close(); s.setUi({ commandOpen: true }) }}>Command Bar <kbd>⌘K</kbd></button>
          <button type="button" className="menu-item" onClick={() => { apps.close(); s.setHelp({ shortcutsOpen: true }) }}>Shortcuts</button>
        </Floating>
      )}
    </div>
  )
}

function RightPill() {
  const s = useStore()
  const bell = usePop()
  const acct = usePop()
  const tool = useRef<'select' | 'hand'>('select')
  const [t, setT] = useState<'select' | 'hand'>('select')
  return (
    <div className="pill pill-right">
      <ToolBtn
        label={t === 'select' ? 'Select tool (click for hand tool)' : 'Hand tool (click for select)'}
        active
        onClick={() => {
          const next = tool.current === 'select' ? 'hand' : 'select'
          tool.current = next
          setT(next)
          getEditor()?.setCurrentTool(next)
        }}
      >
        {t === 'select' ? <Icon.pointer /> : <Icon.hand />}
      </ToolBtn>
      <ToolBtn label="Command Bar (⌘K)" onClick={() => s.setUi({ commandOpen: true })}><Icon.sparkle /></ToolBtn>
      <ToolBtn label="Notifications" pop={bell} badge={s.ui.unseenFills} onClick={() => { bell.toggle(); s.setUi({ unseenFills: 0 }) }}><Icon.bell /></ToolBtn>
      <button ref={acct.ref} type="button" className="avatar-pill" onClick={acct.toggle} aria-label="Account" title="Account">
        <span className="avatar-circle" aria-hidden>A</span>
        <Icon.caret />
      </button>
      {acct.a && (
        <Floating anchor={acct.a} onClose={acct.close} className="menu" width={260}>
          <div className="pad-sm stack-8">
            <b>Practice account</b>
            <div className="row-between small"><span className="muted">Cash</span><span className="mono">${ACCOUNT_CASH.toLocaleString()}</span></div>
            <div className="row-between small"><span className="muted">Buying power <Info term="buyingPower" /></span><span className="mono">${ACCOUNT_BUYING_POWER.toLocaleString()}</span></div>
            <p className="muted small">No real account, login or money is connected.</p>
          </div>
          <div className="menu-sep" />
          <label className="menu-item toggle">
            <input type="checkbox" checked={s.help.explainMode} onChange={(e) => s.setHelp({ explainMode: e.target.checked })} />
            Explain everything <Info term="explain" />
          </label>
          <button type="button" className="menu-item" onClick={() => { acct.close(); s.setHelp({ glossaryOpen: true }); track('glossary_opened', { from: 'account' }) }}>Glossary <kbd>?</kbd></button>
        </Floating>
      )}
      {bell.a && (
        <Floating anchor={bell.a} onClose={bell.close} className="menu" width={300}>
          <div className="menu-label">Notifications</div>
          {!s.positions.length && <div className="pad-sm muted small">Fills from practice orders show up here.</div>}
          {[...s.positions].reverse().slice(0, 6).map((p) => (
            <div key={p.id} className="pos-row small">
              <span>Simulated fill · {p.symbol} {p.name}</span>
              <span className="muted">{new Date(p.openedAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </Floating>
      )}
    </div>
  )
}
