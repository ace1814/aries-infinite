import { useEffect, useMemo, useRef, useState } from 'react'
import { SYMBOLS, type Sym } from '../config'
import { DEFAULT_ANSWERS, QUESTIONS, type Answers } from '../content/questions'
import { WIDGETS } from '../content/widgets'
import { recognize, STRATEGY_NAMES } from '../engine/recognize'
import { fmtExpiry } from '../engine/dates'
import type { Level } from '../engine/types'
import { Info } from '../help/Info'
import { track } from '../store/events'
import { useStore } from '../store'
import { tidyUp, widgetShapes } from '../canvas/ops'
import { startPlacing } from '../ui/Chrome'
import { Icon } from '../ui/icons'
import { Logo } from '../ui/Logo'
import { applyAnswers, currentPlan, doItForMe, finishOnboarding, goStep, guidedTrade, placeAll, prepareGuided, skipOnboarding, type Direction, type GuidedTrade } from './actions'
import { AllQuestions, DashboardPreview, QuestionView } from './Questionnaire'

export function Onboarding() {
  const ob = useStore((s) => s.onboarding)
  const endScreen = useStore((s) => s.ui.endScreen)
  useEffect(() => {
    if (ob.status === 'active') track('onboarding_step_viewed', { step: ob.step })
  }, [ob.status, ob.step])
  return (
    <>
      {ob.status === 'active' && (
        <>
          <Progress step={ob.step} />
          {ob.step === 1 && <Welcome />}
          {ob.step === 2 && <LevelStep />}
          {ob.step === 3 && <ChecklistStep />}
          {ob.step === 4 && <DashboardStep />}
          {ob.step === 5 && <FirstStrategyStep />}
        </>
      )}
      {endScreen && <EndScreen />}
      <CustomizePanel />
    </>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="ob-progress" aria-label={`Step ${step} of 5`}>
      <div className="dots">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`dot ${i === step ? 'on' : i < step ? 'done' : ''}`} />
        ))}
      </div>
      <button type="button" className="link small" onClick={skipOnboarding}>Skip</button>
    </div>
  )
}

function Welcome() {
  return (
    <div className="ob-full">
      <div className="ob-welcome">
        <div className="ob-logo"><Logo size={24} /></div>
        <h1>Trade options by building them.</h1>
        <p className="lede">Snap contracts together, see your risk before you commit.</p>
        <div className="snap-anim" aria-hidden>
          <div className="sa-block">
            <svg className="sa-tent" viewBox="0 0 220 70" preserveAspectRatio="none">
              <line x1="0" x2="220" y1="44" y2="44" className="sa-zero" />
              <path d="M0,60 L80,60 L140,14 L220,14" className="sa-path" />
            </svg>
            <div className="sa-name">Bull Call Spread</div>
          </div>
          <div className="sa-card sa-buy"><Icon.up /> Buy 600 Call</div>
          <div className="sa-card sa-sell"><Icon.down /> Sell 605 Call</div>
        </div>
        <div className="row-gap center">
          <button type="button" className="btn btn-primary lg" autoFocus onClick={() => goStep(2)}>Get started</button>
          <button type="button" className="btn ghost lg" onClick={skipOnboarding}>Skip</button>
        </div>
        <p className="disclaimer">Practice mode. Simulated data. Options involve risk and aren't right for everyone.</p>
      </div>
    </div>
  )
}

const LEVEL_CARDS: { level: Level; title: string; sub: string; changes: string[]; sample: string }[] = [
  {
    level: 'explorer',
    title: 'Explorer',
    sub: 'New to options',
    changes: ['Plain-English explanations everywhere', 'Key Stats, Chart, News, a simple chain', 'Defined-risk spreads only'],
    sample: 'You pay about $210. You can lose at most $210. You make the most if SPY is above $605 at expiry.',
  },
  {
    level: 'trader',
    title: 'Trader',
    sub: 'I buy calls and puts',
    changes: ['Short definitions with tooltips', 'Adds Volume, Sentiment, Social, IV Rank', 'Credit spreads, straddles, strangles'],
    sample: 'Max loss $210 · max profit $290 · breakeven 602.10 · Δ +0.31 · Θ −2.40/day',
  },
  {
    level: 'pro',
    title: 'Pro',
    sub: 'I trade spreads and condors',
    changes: ['Full Greeks and IV, terse notes', 'OI by strike, Greeks Panel, Time & Sales', 'Iron condors, calendars, custom legs, ⌘K'],
    sample: 'BCS 600/605 2.10 db · net Δ +31 Γ +1.8 Θ −2.4 V +3.1 · IV 15.4 · BE 602.10',
  },
]

function LevelStep() {
  const level = useStore((s) => s.level)
  const [picked, setPicked] = useState<Level>(level)
  const card = LEVEL_CARDS.find((c) => c.level === picked)!
  return (
    <div className="ob-full">
      <div className="ob-panel wide">
        <h2>How much have you traded options?</h2>
        <p className="muted">This changes the words, the widgets you start with and which strategies are unlocked. It's practice only, and you can switch anytime. <Info term="level" /></p>
        <div className="level-cards" role="radiogroup" aria-label="Experience level">
          {LEVEL_CARDS.map((c) => (
            <button
              type="button"
              key={c.level}
              role="radio"
              aria-checked={picked === c.level}
              className={`level-card ${picked === c.level ? 'on' : ''}`}
              onClick={() => {
                setPicked(c.level)
                useStore.getState().setLevel(c.level)
              }}
            >
              <span className="lc-title">{c.title}</span>
              <span className="lc-sub">{c.sub}</span>
              <ul>
                {c.changes.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </button>
          ))}
        </div>
        <div className="lang-preview" aria-live="polite">
          <span className="label">How a trade reads at {card.title} level</span>
          <p key={picked} className="fade-in">{card.sample}</p>
        </div>
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={() => goStep(1)}>Back</button>
          <button type="button" className="btn btn-primary" onClick={() => { useStore.getState().setLevel(picked); useStore.getState().set({ answers: {} }); goStep(3) }}>Continue</button>
        </div>
      </div>
    </div>
  )
}

function ChecklistStep() {
  const level = useStore((s) => s.level)
  const stored = useStore((s) => s.answers)
  const [answers, setAnswers] = useState<Answers>(Object.keys(stored).length ? stored : {})
  const [i, setI] = useState(0)
  const qs = QUESTIONS[level]
  const q = qs[i]
  const last = i === qs.length - 1
  const next = () => {
    const a = { ...answers }
    if (!a[q.id]?.length) a[q.id] = q.notSure
    setAnswers(a)
    if (!last) return setI(i + 1)
    for (const qq of qs) if (!a[qq.id]?.length) a[qq.id] = qq.notSure
    applyAnswers(level, a)
    goStep(4)
  }
  return (
    <div className="ob-full">
      <div className="ob-panel split">
        <div className="ob-left">
          <div className="label">Your pre-trade checklist · {i + 1} of {qs.length}</div>
          <h2 className="q-intro">{i === 0 ? 'Tell us how you already research. We will build your dashboard from it.' : ' '}</h2>
          <QuestionView q={q} answers={answers} onChange={(a) => { setAnswers(a); track('dashboard_preview_toggled') }} />
          <div className="row-gap end">
            <button type="button" className="btn ghost" onClick={() => (i ? setI(i - 1) : goStep(2))}>Back</button>
            <button type="button" className="btn btn-primary" onClick={next}>{last ? 'Build my dashboard' : 'Next'}</button>
          </div>
        </div>
        <DashboardPreview level={level} answers={{ ...DEFAULT_EMPTY, ...answers }} />
      </div>
    </div>
  )
}
const DEFAULT_EMPTY: Answers = {}

function DashboardStep() {
  const level = useStore((s) => s.level)
  const sym = useStore((s) => s.activeSymbol)
  const placing = useStore((s) => s.ui.placing)
  const hotspots = useStore((s) => s.help.hotspots)
  useStore((s) => s.layout) // re-render as widgets land
  useStore((s) => s.ui.lastPlaced)
  const plan = useMemo(() => currentPlan(), [])
  const [query, setQuery] = useState('')
  const [switched, setSwitched] = useState(false)
  const placedKinds = new Set(widgetShapes().map((w) => w.props.kind))
  const remaining = plan.place.filter((k) => !placedKinds.has(k))
  const nextKind = remaining[0]
  const allPlaced = remaining.length === 0
  const pulseOnce = useRef(false)
  useEffect(() => {
    if (level === 'explorer' && !pulseOnce.current) {
      pulseOnce.current = true
      document.body.classList.add('info-pulse')
      setTimeout(() => document.body.classList.remove('info-pulse'), 4200)
    }
  }, [level])
  const choose = (s: Sym) => {
    useStore.getState().setActiveSymbol(s, { force: true })
    setQuery('')
  }
  const matches = query ? SYMBOLS.filter((s) => s.toLowerCase().startsWith(query.toLowerCase())) : []
  const placedCount = plan.place.length - remaining.length
  if (placing) return null
  return (
    <aside className="coach" aria-label="Build your dashboard">
      <div className="label">Step 4 · Build your dashboard</div>
      <h3>Pick a stock, then place your widgets</h3>
      <div className="stock-pick">
        <input placeholder="Search a symbol…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) choose(matches[0]) }} aria-label="Search a symbol" />
        <div className="chips">
          {(matches.length ? matches : SYMBOLS).map((s) => (
            <button type="button" key={s} className={`chip ${s === sym ? 'on' : ''}`} onClick={() => choose(s)}>{s}</button>
          ))}
        </div>
        <div className="muted small">All research widgets share this symbol (linked ticker). <Info term="linkedTicker" /></div>
      </div>
      <ol className="place-list">
        {plan.place.map((k) => {
          const done = placedKinds.has(k)
          return (
            <li key={k} className={done ? 'done' : k === nextKind ? 'next' : ''}>
              <span className="tick">{done ? <Icon.check /> : null}</span>
              <span>{WIDGETS[k].title}</span>
              {!done && (
                <button type="button" className={`btn sm ${k === nextKind ? 'btn-primary' : ''}`} onClick={() => startPlacing(k)}>Place</button>
              )}
            </li>
          )
        })}
      </ol>
      {!allPlaced && (
        <div className="row-gap">
          <button type="button" className="link small" onClick={() => placeAll()}>Place all for me</button>
          <span className="muted small">Click Place, then click the canvas.</span>
        </div>
      )}
      {placedCount >= 2 && (
        <div className={`try-link ${switched ? 'done' : ''}`}>
          {switched ? <Icon.check /> : <span aria-hidden>↻</span>}
          {sym !== 'NVDA' ? (
            <>Switch to NVDA and watch everything update. <button type="button" className="chip" onClick={() => { choose('NVDA'); setSwitched(true) }}>Switch to NVDA</button></>
          ) : (
            <>Every linked widget now shows NVDA. <button type="button" className="chip" onClick={() => choose('SPY')}>Back to SPY</button></>
          )}
        </div>
      )}
      <div className="row-gap coach-foot">
        <button type="button" className="btn sm" onClick={tidyUp} disabled={!placedCount}>Tidy up</button>
        <Info term="tidy" />
        {hotspots && <button type="button" className="link small" onClick={() => useStore.getState().setHelp({ hotspots: false })}>Skip tips</button>}
        <span className="w-spacer" />
        <button type="button" className={`btn ${allPlaced ? 'btn-primary' : ''}`} onClick={() => { if (!allPlaced) placeAll(); goStep(5) }}>Continue</button>
      </div>
    </aside>
  )
}

function FirstStrategyStep() {
  const level = useStore((s) => s.level)
  const sym = useStore((s) => s.activeSymbol)
  const profile = useStore((s) => s.profile)
  const positions = useStore((s) => s.positions.length)
  const strategies = useStore((s) => s.strategies)
  const activeId = useStore((s) => s.activeStrategyId)
  const startPositions = useRef(positions)
  const [dir, setDir] = useState<Direction | null>(null)
  const [trade, setTrade] = useState<GuidedTrade | null>(null)
  const [blockId, setBlockId] = useState<string | null>(null)
  const [mode, setMode] = useState<'helper' | 'build' | 'command'>(level === 'pro' && (profile?.commandBarIntro ?? true) ? 'command' : 'helper')
  const target: Sym = sym === 'SPY' || level === 'explorer' ? 'SPY' : sym

  useEffect(() => {
    if (positions > startPositions.current) {
      setTimeout(() => finishOnboarding(true), 900)
    }
  }, [positions])

  const start = (d: Direction) => {
    setDir(d)
    track('helper_direction_selected', { direction: d })
    const t = guidedTrade(level, d, target)
    setTrade(t)
    setMode('build')
    setTimeout(() => setBlockId(prepareGuided(t)), 50)
  }

  const st = blockId ? strategies[blockId] : activeId ? strategies[activeId] : null
  const rec = st ? recognize(st.legs) : null
  const has = (l: GuidedTrade['legs'][number]) => !!st?.legs.some((x) => x.contract.strike === l.strike && x.contract.type === l.type && x.side === l.side)
  const built = trade && rec?.kind === trade.kind
  useEffect(() => {
    useStore.getState().setOnboarding({ guide: built ? 'send' : trade ? trade.legs.map((l) => `${l.type}${l.strike}${l.side > 0 ? 'buy' : 'sell'}`).join(',') : null })
    document.body.classList.toggle('guide-send', !!built)
    return () => document.body.classList.remove('guide-send')
  }, [built, trade])

  if (mode === 'command') {
    return (
      <aside className="coach" aria-label="First strategy">
        <div className="label">Step 5 · Your first strategy</div>
        <h3>Place a trade with a sentence</h3>
        <p>Press <kbd>⌘K</kbd> and type:</p>
        <p className="quote mono">spawn a low-risk iron condor for SPY expiring Friday</p>
        <p className="muted small">A proposed block appears on the canvas. Check the "I understood" sentence, then press <kbd>↵</kbd> to confirm. Nothing is sent before you confirm.</p>
        <div className="row-gap coach-foot">
          <button type="button" className="btn btn-primary" onClick={() => useStore.getState().setUi({ commandOpen: true })}>Open Command Bar</button>
          <button type="button" className="link small" onClick={() => setMode('helper')}>Build by hand instead</button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="coach" aria-label="First strategy">
      <div className="label">Step 5 · Your first strategy</div>
      {level === 'explorer' && !trade && <p className="bridge">You've checked the price, the news and the premiums. Now combine contracts into one trade.</p>}
      {!trade ? (
        <>
          <h3>What do you expect {target} to do?</h3>
          <p className="muted small">This suggests a starter structure for practice. It isn't advice.</p>
          <div className="dir-grid">
            {([['up', 'Up'], ['down', 'Down'], ['sideways', 'Sideways'], ['unsure', 'Not sure']] as [Direction, string][]).map(([d, l]) => (
              <button type="button" key={d} className={`answer sm ${dir === d ? 'on' : ''}`} onClick={() => start(d)}>{l}</button>
            ))}
          </div>
          <button type="button" className="link small" onClick={() => start('unsure')}>Skip the question</button>
        </>
      ) : (
        <>
          <h3>Build a {STRATEGY_NAMES[trade.kind]}</h3>
          {trade.note && <p className="muted small">{trade.note}</p>}
          <ol className="guide-steps">
            {trade.legs.map((l, i) => (
              <li key={i} className={has(l) ? 'done' : ''}>
                <span className="tick">{has(l) ? <Icon.check /> : i + 1}</span>
                <span>
                  Drag the <b>{l.strike} {l.type === 'C' ? 'call' : 'put'}</b>'s <b className={l.side > 0 ? 'pos' : 'neg'}>{l.side > 0 ? (level === 'explorer' ? 'Buy' : 'Ask (buy)') : level === 'explorer' ? 'Sell' : 'Bid (sell)'}</b> into the Strategy Block
                  <span className="muted small"> · {fmtExpiry(trade.expiry)} · or click it</span>
                </span>
              </li>
            ))}
            <li className={built ? 'next' : ''}>
              <span className="tick">{trade.legs.length + 1}</span>
              <span>Read the plain-English sentence, then click <b>Send practice order</b>.</span>
            </li>
          </ol>
          {!built && blockId && (
            <button type="button" className="link small" onClick={() => doItForMe(trade, blockId)}>Do it for me</button>
          )}
          {built && <p className="pos small"><Icon.check /> The block recognised a {STRATEGY_NAMES[trade.kind]}. Look at the payoff and the max loss before sending.</p>}
        </>
      )}
      <div className="row-gap coach-foot">
        {level !== 'explorer' && <button type="button" className="link small" onClick={() => setMode('command')}>Use the Command Bar</button>}
        <span className="w-spacer" />
        <button type="button" className="link small" onClick={() => finishOnboarding(false)}>Finish later</button>
      </div>
    </aside>
  )
}

function EndScreen() {
  const close = () => useStore.getState().setUi({ endScreen: false })
  return (
    <div className="modal-scrim">
      <div className="modal end" role="dialog" aria-label="You're set">
        <div className="end-check"><Icon.check /></div>
        <h2>You're set.</h2>
        <p>You built a dashboard from how you research, read your risk before committing, and sent a practice order.</p>
        <div className="teaser">Press <kbd>⌘K</kbd> to place trades with a sentence.</div>
        <div className="row-gap center">
          <button type="button" className="btn btn-primary" autoFocus onClick={close}>Explore the canvas</button>
          <button type="button" className="btn" onClick={() => { close(); useStore.getState().setUi({ commandOpen: true }) }}>Try ⌘K now</button>
        </div>
        <p className="disclaimer">Practice mode. Simulated data.</p>
      </div>
    </div>
  )
}

/** "Customize dashboard" reopens Step 3 as a panel (PRD §5.7). */
function CustomizePanel() {
  const open = useStore((s) => s.ui.customizeOpen)
  const level = useStore((s) => s.level)
  const stored = useStore((s) => s.answers)
  const [answers, setAnswers] = useState<Answers>(stored)
  useEffect(() => {
    if (open) setAnswers(Object.keys(stored).length && QUESTIONS[level].some((q) => stored[q.id]) ? stored : DEFAULT_ANSWERS[level])
  }, [open, level]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  const close = () => useStore.getState().setUi({ customizeOpen: false })
  return (
    <aside className="drawer customize" aria-label="Customize dashboard">
      <header className="drawer-head">
        <strong>Customize dashboard</strong>
        <span className="muted small">{level[0].toUpperCase() + level.slice(1)}</span>
        <button type="button" className="icon-btn" aria-label="Close" onClick={close}><Icon.close /></button>
      </header>
      <div className="drawer-body">
        <AllQuestions level={level} answers={answers} onChange={setAnswers} />
        <DashboardPreview level={level} answers={answers} />
      </div>
      <footer className="drawer-foot">
        <button type="button" className="btn" onClick={close}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const plan = applyAnswers(level, answers)
            placeAll(plan.place)
            close()
          }}
        >
          Apply
        </button>
      </footer>
    </aside>
  )
}
