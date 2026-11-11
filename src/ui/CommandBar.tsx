import { useEffect, useMemo, useRef, useState } from 'react'
import { PARSER, type Sym } from '../config'
import { STRATEGY_NAMES } from '../engine/recognize'
import { Info } from '../help/Info'
import { parseCommand, type CommandIntent } from '../parser/parse'
import { EXAMPLES, resolveIntent, type Resolution } from '../parser/resolve'
import { track } from '../store/events'
import { useStore } from '../store'
import { selectStrategy, spawnStrategy } from '../canvas/ops'
import { getEditor } from '../canvas/editorRef'
import { Icon } from './icons'
import { applyShow } from './commandShow'

type Phase = 'idle' | 'parsing' | 'result'

/** Tier 2 (optional): only when Tier 1 confidence is low. Silent fallback (PRD §7.5). */
async function tier2(text: string): Promise<CommandIntent | null> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 2500)
    const r = await fetch(PARSER.tier2Endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: ctl.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const j = (await r.json()) as CommandIntent
    return j && typeof j === 'object' && 'action' in j ? j : null
  } catch {
    return null
  }
}

export function CommandBar() {
  const open = useStore((s) => s.ui.commandOpen)
  if (!open) return null
  return <CommandBarInner />
}

function CommandBarInner() {
  const s = useStore()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [intent, setIntent] = useState<CommandIntent | null>(null)
  const [res, setRes] = useState<Resolution | null>(null)
  const [proposedId, setProposedId] = useState<string | null>(null)
  const [ex, setEx] = useState(0)
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<{ stop: () => void } | null>(null)
  const proposed = proposedId ? s.strategies[proposedId] : null

  useEffect(() => {
    track('command_opened')
    useStore.getState().completeStep('tryCommand')
    inputRef.current?.focus()
    const t = setInterval(() => setEx((x) => (x + 1) % EXAMPLES.length), 2600)
    return () => clearInterval(t)
  }, [])

  const ctx = () => {
    const st = useStore.getState()
    const selected = st.activeStrategyId ? st.strategies[st.activeStrategyId] : null
    return {
      now: new Date(),
      level: st.level,
      spots: st.spots,
      positions: st.positions.filter((p) => !p.closed).map((p) => ({ id: p.id, symbol: p.symbol, name: p.name, legs: p.legs, units: p.units })),
      selected: selected && selected.onCanvas ? { id: selected.id, symbol: selected.symbol, legs: selected.legs, name: selected.label ?? STRATEGY_NAMES.custom, positionId: selected.positionId } : undefined,
    }
  }

  const dropProposal = () => {
    if (proposedId && useStore.getState().strategies[proposedId]?.proposed) useStore.getState().dismissStrategy(proposedId)
    setProposedId(null)
  }

  const close = () => {
    dropProposal()
    useStore.getState().setUi({ commandOpen: false })
  }

  const apply = (i: CommandIntent) => {
    const r = resolveIntent(i, ctx())
    setIntent(i)
    setRes(r)
    setPhase('result')
    track('command_parsed', { kind: r.kind, confidence: i.confidence })
    dropProposal()
    if (r.kind === 'propose') {
      const id = spawnStrategy(r.symbol, r.legs, { at: 'viewport', proposed: true, label: r.label, units: r.units, closesPositionId: r.closesPositionId, limit: typeof r.limit === 'number' ? r.limit * (summSign(r)) : undefined })
      setProposedId(id)
      setTimeout(() => {
        selectStrategy(id)
        getEditor()?.setSelectedShapes([])
      }, 30)
    } else if (r.kind === 'show') {
      applyShow(r.symbol)
    } else if (r.kind === 'locked' && !useStore.getState().help.seenNudges.includes('locked')) {
      useStore.getState().setHelp({ seenNudges: [...useStore.getState().help.seenNudges, 'locked'] })
    }
  }

  const submit = async (t = text) => {
    if (!t.trim()) return
    setPhase('parsing')
    const st = useStore.getState()
    let i = parseCommand(t, { now: new Date(), defaultSymbol: st.activeSymbol })
    // Deterministic path is near-instant; keep a short shimmer so the state reads.
    await new Promise((r) => setTimeout(r, 160))
    if (i.confidence < PARSER.tier2ConfidenceThreshold) {
      const t2 = await tier2(t)
      if (t2) i = { ...t2, confidence: Math.max(t2.confidence ?? 0.6, i.confidence) }
    }
    apply(i)
  }

  const confirm = () => {
    if (!proposedId) return
    track('command_confirmed')
    useStore.getState().sendOrder(proposedId)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (res?.kind === 'propose' && proposed && proposed.status === 'ready' && (text === lastSubmitted.current || !text.trim())) confirm()
      else {
        lastSubmitted.current = text
        submit()
      }
    } else if (e.key === ' ' && !text && voiceSupported) {
      e.preventDefault()
      startVoice()
    }
  }
  const lastSubmitted = useRef('')

  // ---- Voice [STRETCH] ----
  const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition
  const voiceSupported = !!SR
  const startVoice = () => {
    if (!SR || listening) return
    try {
      const rec = new SR()
      rec.lang = 'en-US'
      rec.interimResults = true
      rec.continuous = false
      rec.onresult = (ev: SpeechEvent) => {
        const said = Array.from(ev.results).map((r) => r[0].transcript).join(' ')
        setText(said)
        if (ev.results[ev.results.length - 1].isFinal) {
          setListening(false)
          if (/^\s*confirm\.?\s*$/i.test(said) && proposedId) confirm()
          else {
            lastSubmitted.current = said
            submit(said)
          }
        }
      }
      rec.onerror = () => {
        setListening(false)
        useStore.getState().toast({ kind: 'info', title: 'Microphone unavailable', body: 'Type your trade instead.' })
      }
      rec.onend = () => setListening(false)
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const status = proposed?.status
  const level = s.level
  const chips = useMemo(() => {
    const pro = ['Spawn a low-risk iron condor for SPY expiring Friday', 'Bull put spread SPY Friday', 'Straddle on NVDA before earnings']
    const base = ['Buy a bull call spread on SPY 600/605 next Friday', 'Bear put spread QQQ Friday', 'Close my SPY spread']
    return level === 'pro' ? [...pro, ...base].slice(0, 4) : base
  }, [level])

  return (
    <div className="cmd-scrim">
      <div className="cmd" role="dialog" aria-label="Command Bar">
        <div className={`cmd-input ${phase === 'parsing' ? 'shimmer' : ''}`}>
          <Icon.sparkle />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Try: ${EXAMPLES[ex]}`}
            aria-label="Describe a trade"
          />
          {voiceSupported && (
            <button type="button" className={`icon-btn mic ${listening ? 'on' : ''}`} onClick={startVoice} aria-label={listening ? 'Listening' : 'Dictate (or hold Space)'} title="Dictate (Space when empty)">
              <Icon.mic />
            </button>
          )}
          <kbd>Esc</kbd>
        </div>
        {listening && <div className="cmd-listen"><span className="live-dot" /> Listening… say the trade, then "confirm".</div>}
        {phase === 'idle' && (
          <div className="cmd-body">
            <div className="label">Examples</div>
            <div className="chips">
              {chips.map((c) => (
                <button type="button" key={c} className="chip" onClick={() => { setText(c); lastSubmitted.current = c; submit(c) }}>
                  {c}
                </button>
              ))}
            </div>
            <p className="muted small">The Command Bar builds a proposed trade on the canvas. Nothing is sent until you confirm. <Info term="commandBar" /></p>
          </div>
        )}
        {phase === 'parsing' && <div className="cmd-body muted">Reading your sentence…</div>}
        {phase === 'result' && res && (
          <div className="cmd-body">
            {res.kind === 'propose' && (
              <>
                <div className="understood">
                  <span className="label">I understood <Info term="understood" /></span>
                  <p>{res.sentence}</p>
                  {res.assumptions.length > 0 && <ul className="assumptions">{res.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
                </div>
                <div className="cmd-actions">
                  {status === 'filled' ? (
                    <span className="pos"><Icon.check /> Simulated fill. See the block on the canvas.</span>
                  ) : status === 'sending' || status === 'working' ? (
                    <span className="muted">Sending practice order…</span>
                  ) : (
                    <>
                      <button type="button" className="btn btn-primary" onClick={confirm} data-guide="confirm">
                        Confirm <kbd>↵</kbd>
                      </button>
                      <Info term="confirm" />
                      <button type="button" className="btn" onClick={() => { if (proposedId) selectStrategy(proposedId, true); useStore.getState().setUi({ commandOpen: false }) }}>
                        Edit
                      </button>
                      <button type="button" className="btn ghost" onClick={() => { dropProposal(); setPhase('idle'); setRes(null) }}>
                        Dismiss
                      </button>
                    </>
                  )}
                  {status === 'filled' && <button type="button" className="btn" onClick={close}>Done</button>}
                </div>
              </>
            )}
            {res.kind === 'clarify' && (
              <>
                <p>{res.message} <Info term="clarify" /></p>
                <div className="chips">
                  {res.options.map((o) => (
                    <button
                      type="button"
                      key={o.value}
                      className="chip"
                      onClick={() => {
                        if (!intent) return
                        const next: CommandIntent = { ...intent }
                        if (res.field === 'expiry') { next.expiry = o.value; next.earnings = false }
                        if (res.field === 'underlying') { next.underlying = o.value as Sym; next.unknownTicker = undefined }
                        if (res.field === 'quantity') next.quantity = Number(o.value)
                        apply(next)
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {res.kind === 'locked' && (
              <>
                <p><Icon.lock /> {res.message} <Info term="locked" /></p>
                <div className="chips">
                  <button type="button" className="chip" onClick={() => { useStore.getState().setLevel(res.needs); if (intent) apply(intent) }}>
                    Switch to {res.needs[0].toUpperCase() + res.needs.slice(1)} (practice mode)
                  </button>
                  {res.alternative && intent && (
                    <button type="button" className="chip" onClick={() => apply({ ...intent, strategy: res.alternative!, strikes: undefined })}>
                      Try a {STRATEGY_NAMES[res.alternative]}
                    </button>
                  )}
                </div>
              </>
            )}
            {res.kind === 'show' && <p>{res.message}</p>}
            {res.kind === 'error' && (
              <>
                <p>{res.message}</p>
                <div className="chips">
                  {res.chips.map((c) => (
                    <button type="button" key={c} className="chip" onClick={() => { setText(c); lastSubmitted.current = c; submit(c) }}>{c}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function summSign(r: Extract<Resolution, { kind: 'propose' }>): number {
  // Limit given as a positive number; credit structures are negative nets.
  const credit = ['bull_put_spread', 'bear_call_spread', 'iron_condor', 'short_straddle', 'short_strangle', 'short_call', 'short_put'].includes(r.strategyKind)
  return credit ? -1 : 1
}

interface SpeechEvent { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> & Iterable<{ 0: { transcript: string }; isFinal: boolean }> }
interface SpeechRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: (e: SpeechEvent) => void
  onerror: () => void
  onend: () => void
  start: () => void
  stop: () => void
}
