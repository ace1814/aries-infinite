import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ACCOUNT_BUYING_POWER,
  CONTRACT_MULTIPLIER,
  PRACTICE_QTY_CAP,
  PRICE_COLLAR,
  REQUOTE_THRESHOLD,
  SYMBOL_META,
  type Sym,
} from '../../config'
import { offsetStrike } from '../../engine/chain'
import { daysTo, expiriesFor, fmtExpiry } from '../../engine/dates'
import { isUnlocked, levelFor, LEVEL_STRATEGIES, mergeLegs, STRATEGY_NAMES, undefinedRisk } from '../../engine/recognize'
import {
  estimatedFees,
  fmtNet,
  fmtPrice,
  legsSummary,
  money,
  plainEnglish,
  signedMoney,
  summarize,
  type LivePricedLeg,
  type StrategySummary,
} from '../../engine/strategy'
import type { Level, StrategyKind } from '../../engine/types'
import { Info } from '../../help/Info'
import { parseCommand } from '../../parser/parse'
import { resolveIntent } from '../../parser/resolve'
import { useStore, type Strategy } from '../../store'
import { useNow } from '../../ui/hooks'
import { Icon } from '../../ui/icons'
import { Badge, Segmented, Stepper, stop, useWheelStop } from '../../ui/primitives'
import { spawnStrategy } from '../ops'
import type { AriesWidgetShape } from '../WidgetShape'
import { WidgetMenu } from '../WidgetShape'
import { LEG_MIME, symMime } from './chain'
import { PayoffChart, payoffRange } from './payoff'
import { pnlAtExpiry } from '../../engine/payoff'

export const LEGCARD_MIME = 'application/x-aries-legcard'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export interface TicketIssue {
  kind: 'block' | 'warn'
  text: string
  term?: string
  action?: { label: string; run: () => void }
}

export function ticketIssues(st: Strategy, s: StrategySummary, level: Level, stale: boolean): TicketIssue[] {
  const out: TicketIssue[] = []
  const r = s.recognition
  if (stale) out.push({ kind: 'block', text: 'Prices are paused (data timeout). Showing cached values; sending is off until quotes refresh.' })
  if (r.zeroWidth) out.push({ kind: 'block', text: 'No spread width: both legs use the same strike.', term: 'spread' })
  if (r.kind !== 'empty' && !isUnlocked(r.kind, level)) {
    const need = levelFor(r.kind)
    out.push({
      kind: 'block',
      text: `${r.name.replace(/ \(.+\)$/, '')} is not available at ${cap(level)} level.`,
      term: 'locked',
      action: { label: `Switch to ${cap(need)} (practice mode)`, run: () => switchLevel(need) },
    })
  } else if (s.undefinedRisk && level !== 'pro') {
    out.push({
      kind: 'block',
      text: 'Undefined risk. Not available at your level.',
      term: 'undefinedRisk',
      action: { label: 'Add a protective leg (cap the risk)', run: () => capRisk(st) },
    })
  } else if (s.undefinedRisk) {
    out.push({ kind: 'warn', text: 'Undefined risk: the most you could lose has no fixed limit.', term: 'undefinedRisk' })
  }
  if (r.mismatchedExpiry && r.kind !== 'calendar') out.push({ kind: 'warn', text: 'Legs have different expiries, so this is a custom trade. The chart shows the first expiry.', term: 'calendar' })
  if (r.unbalanced) out.push({ kind: 'warn', text: 'Unbalanced: the put and call wings have different widths.', term: 'ironCondor' })
  if (st.units <= 0) out.push({ kind: 'block', text: 'Quantity must be at least 1.' })
  if (st.units * Math.max(...mergeLegs(st.legs).map((l) => l.qty), 1) > PRACTICE_QTY_CAP) out.push({ kind: 'block', text: `Practice mode caps orders at ${PRACTICE_QTY_CAP} contracts per leg.` })
  return out
}

function switchLevel(l: Level) {
  const s = useStore.getState()
  s.setLevel(l)
  s.toast({ kind: 'info', title: `Practice level: ${cap(l)}`, body: 'More strategies are unlocked. Nothing real changes.' })
}

/** Add the missing wing so a naked short becomes a defined-risk spread. */
function capRisk(st: Strategy) {
  const s = useStore.getState()
  const legs = mergeLegs(st.legs)
  const u = undefinedRisk(legs)
  const sym = st.symbol as Sym
  const w = SYMBOL_META[sym].width
  if (u.calls) {
    const short = legs.filter((l) => l.contract.type === 'C' && l.side < 0).sort((a, b) => b.contract.strike - a.contract.strike)[0]
    if (short) s.addLeg(st.id, { ...short.contract, strike: offsetStrike(sym, short.contract.strike, w) }, 1)
  }
  if (u.puts) {
    const short = legs.filter((l) => l.contract.type === 'P' && l.side < 0).sort((a, b) => a.contract.strike - b.contract.strike)[0]
    if (short) s.addLeg(st.id, { ...short.contract, strike: offsetStrike(sym, short.contract.strike, -w) }, 1)
  }
}

export function effectiveLimit(st: Strategy, s: StrategySummary): number {
  return st.priceMode === 'mid' ? s.mid : st.priceMode === 'natural' ? s.natural : st.limit ?? s.mid
}

export function needsRequote(st: Strategy, s: StrategySummary): boolean {
  if (st.forcedRequote) return true
  if (st.priceMode !== 'custom' || st.quotedNet === null) return false
  const base = Math.max(Math.abs(st.quotedNet), 0.05)
  return Math.abs(s.mid - st.quotedNet) / base > REQUOTE_THRESHOLD
}

export function StrategyBlock({ shape }: { shape: AriesWidgetShape }) {
  const st = useStore((s) => s.strategies[shape.props.refId])
  const spots = useStore((s) => s.spots)
  const level = useStore((s) => s.level)
  const stale = useStore((s) => s.feedStale)
  const emphasizeRisk = useStore((s) => s.profile?.emphasizeRisk ?? false)
  const isActive = useStore((s) => s.activeStrategyId === shape.props.refId)
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)
  useWheelStop(scrollRef)
  const [scrubPrice, setScrubPrice] = useState<number | null>(null)
  const [scrubDays, setScrubDays] = useState(0)
  const [explainOpen, setExplainOpen] = useState(level === 'explorer')

  const summary = useMemo(() => (st ? summarize(st.legs, spots, now, st.units) : null), [st, spots, now])
  useEffect(() => setScrubPrice(null), [st?.symbol])

  if (!st || !summary) return <div className="pad muted">This strategy was removed.</div>
  const sym = st.symbol
  const spot = sym ? spots[sym] : 0
  const r = summary.recognition
  const name = st.label ?? r.name
  const hasLegs = summary.legs.length > 0
  const firstExp = hasLegs ? summary.legs.map((l) => l.contract.expiry).sort()[0] : null
  const dte = firstExp ? Math.floor(daysTo(firstExp, now)) : 0
  const [lo, hi] = hasLegs ? payoffRange(summary.legs, spot) : [0, 0]
  const sentence = hasLegs && sym ? plainEnglish(summary, st.units, sym) : []
  const width = shape.props.w - 32

  const explainer = hasLegs && sym && (
    <section className={`explainer ${emphasizeRisk ? 'emph' : ''}`} aria-live="polite">
      <button type="button" className="explainer-toggle" onClick={() => setExplainOpen((x) => !x)} aria-expanded={explainOpen}>
        <span>In plain English</span>
        <span aria-hidden>{explainOpen ? '▾' : '▸'}</span>
      </button>
      {(explainOpen || level === 'explorer') && (
        <>
          <p className="sentence">{sentence.join(' ')}</p>
          <div className="scenarios">
            {scenarios(summary.legs, spot, SYMBOL_META[sym].strikeStep).map((p) => {
              const v = summary.legs.length ? pnlAtExpiryUnits(summary, p, st.units) : 0
              return (
                <button type="button" key={p} className={`scenario ${v >= 0 ? 'pos' : 'neg'}`} onClick={() => setScrubPrice(p)}>
                  If {sym} ends at ${fmtPrice(p).replace(/\.00$/, '')}: <b>{signedMoney(v)}</b>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )

  return (
    <>
      <header className="w-head sb-head">
        <span className="w-icon" aria-hidden>◈</span>
        <span className="w-title" title={name}>{name}</span>
        <Info term={r.kind === 'empty' ? 'strategy' : glossaryFor(r.kind)} label={name} />
        {sym && <span className="sym-chip static">{sym}</span>}
        {r.flavor && hasLegs && <Badge tone={r.flavor === 'credit' ? 'accent' : 'muted'}>{r.flavor}</Badge>}
        {st.proposed && <Badge tone="accent">Proposed by command</Badge>}
        {isActive && <span className="active-dot" title="Active strategy: chain clicks add here" />}
        <span className="w-spacer" />
        <WidgetMenu shape={shape}>
          {hasLegs && (
            <button type="button" className="menu-item" onClick={() => useStore.getState().clearStrategy(st.id)}>
              Clear legs
            </button>
          )}
          {hasLegs && (
            <button type="button" className="menu-item" onClick={() => spawnStrategy(st.symbol, st.legs.map((l) => ({ ...l, id: l.id + 'd' })), { at: { x: shape.x + shape.props.w + 40, y: shape.y } })}>
              Duplicate strategy
            </button>
          )}
        </WidgetMenu>
      </header>
      <div className="sb-scroll" ref={scrollRef} onPointerDown={(e) => { stop(e); useStore.getState().setActiveStrategy(st.id) }}>
        {!hasLegs ? (
          <EmptyBlock st={st} level={level} />
        ) : (
          <>
            {emphasizeRisk && explainer}
            <section className="payoff-wrap">
              <div className="row-between small">
                <span className="label">Payoff <Info term="payoff" /></span>
                <span className="legend">
                  <i className="lg-exp" /> At expiry ({firstExp ? fmtExpiry(firstExp) : ''}) <i className="lg-t0" /> {scrubDays === 0 ? 'Today' : `In ${scrubDays}d`} <Info term="t0" />
                </span>
              </div>
              <PayoffChart legs={summary.legs} units={st.units} spot={spot} now={now} width={width} breakevens={summary.analysis.breakevens} scrubPrice={scrubPrice} scrubDays={scrubDays} symbol={sym ?? ''} />
              <div className="scrubbers">
                <label>
                  <span className="label">Price at expiry <Info term="priceScrubber" /></span>
                  <input type="range" min={lo} max={hi} step={(hi - lo) / 200} value={scrubPrice ?? spot} onChange={(e) => setScrubPrice(Number(e.target.value))} aria-label="Price at expiry" />
                  <span className="mono small">
                    ${fmtPrice(scrubPrice ?? spot)} → <b className={pnlAtExpiryUnits(summary, scrubPrice ?? spot, st.units) >= 0 ? 'pos' : 'neg'}>{signedMoney(pnlAtExpiryUnits(summary, scrubPrice ?? spot, st.units))}</b>
                  </span>
                </label>
                <label>
                  <span className="label">Days to expiry <Info term="dayScrubber" /></span>
                  <input type="range" min={0} max={Math.max(dte, 0)} step={1} value={scrubDays} onChange={(e) => setScrubDays(Number(e.target.value))} aria-label="Days from today" disabled={dte < 1} />
                  <span className="mono small">{scrubDays === 0 ? 'Today' : `+${scrubDays}d`} · {Math.max(0, dte - scrubDays)}d left</span>
                </label>
              </div>
            </section>
            <SummaryRow s={summary} units={st.units} />
            {!emphasizeRisk && explainer}
            {level !== 'explorer' && <GreeksRow s={summary} level={level} />}
            <IssuesList issues={ticketIssues(st, summary, level, stale)} />
            <section className="legs">
              <div className="row-between">
                <span className="label">Legs ({summary.legs.length})</span>
                <span className="muted small">Drag a card out to remove it</span>
              </div>
              {summary.legs.map((l) => (
                <LegCard key={l.id} leg={l} st={st} level={level} mismatched={!!firstExp && l.contract.expiry !== firstExp} />
              ))}
              <div className="drop-hint">+ Drop more contracts here</div>
            </section>
          </>
        )}
      </div>
      <Ticket st={st} s={summary} level={level} stale={stale} />
    </>
  )
}

function glossaryFor(kind: StrategyKind): string {
  const m: Partial<Record<StrategyKind, string>> = {
    bull_call_spread: 'bullCall',
    bear_put_spread: 'bearPut',
    bull_put_spread: 'bullPut',
    bear_call_spread: 'bearCall',
    long_straddle: 'straddle',
    short_straddle: 'straddle',
    long_strangle: 'strangle',
    short_strangle: 'strangle',
    iron_condor: 'ironCondor',
    calendar: 'calendar',
    long_call: 'call',
    short_call: 'call',
    long_put: 'put',
    short_put: 'put',
  }
  return m[kind] ?? 'strategyName'
}

function pnlAtExpiryUnits(s: StrategySummary, S: number, units: number): number {
  return pnlAtExpiry(s.legs, S) * units
}

function scenarios(legs: LivePricedLeg[], spot: number, step: number): number[] {
  const ks = legs.map((l) => l.contract.strike)
  const minK = Math.min(...ks)
  const maxK = Math.max(...ks)
  const span = Math.max(maxK - minK, spot * 0.015)
  const rnd = (x: number) => Math.round(x / Math.max(step, 1)) * Math.max(step, 1)
  const pts = [rnd(minK - span * 0.6), rnd(spot), rnd(maxK + span * 0.6)]
  return [...new Set(pts)]
}

function SummaryRow({ s, units }: { s: StrategySummary; units: number }) {
  const a = s.analysis
  const mp = a.maxProfit === 'unlimited' ? 'No limit' : money(a.maxProfit * units)
  const ml = a.maxLoss === 'unlimited' ? 'No limit' : money(a.maxLoss * units)
  const be = a.breakevens.length ? a.breakevens.map((b) => fmtPrice(b)).join(' / ') : '—'
  return (
    <div className="summary">
      <div><span className="label">Max profit <Info term="maxProfit" /></span><b className="pos mono">{mp}</b></div>
      <div><span className="label">Max loss <Info term="maxLoss" example={a.maxLoss === 'unlimited' ? undefined : `Here: ${ml}. That is the worst case at expiry.`} /></span><b className="neg mono">{ml}</b></div>
      <div><span className="label">Breakeven <Info term="breakeven" /></span><b className="mono">{be}</b></div>
      <div><span className="label">Net <Info term="netDebitCredit" /></span><b className="mono">{fmtNet(s.mid)}</b></div>
    </div>
  )
}

function GreeksRow({ s, level }: { s: StrategySummary; level: Level }) {
  const g = s.greeks
  const items = level === 'pro'
    ? [['Δ', 'delta', g.delta, 1], ['Γ', 'gamma', g.gamma, 2], ['Θ', 'theta', g.theta, 2], ['V', 'vega', g.vega, 2]] as const
    : [['Δ', 'delta', g.delta, 1], ['Θ /day', 'theta', g.theta, 2]] as const
  return (
    <div className="greeks-row">
      <span className="label">Net Greeks <Info term="greeks" /></span>
      {items.map(([sym, term, v, d]) => (
        <span key={term} className="greek">
          {sym} <b className={`mono ${v >= 0 ? 'pos' : 'neg'}`}>{v >= 0 ? '+' : ''}{v.toFixed(d)}</b>
          <Info term={term} />
        </span>
      ))}
    </div>
  )
}

function IssuesList({ issues }: { issues: TicketIssue[] }) {
  if (!issues.length) return null
  return (
    <div className="issues">
      {issues.map((i, k) => (
        <div key={k} className={`issue issue-${i.kind}`}>
          {i.kind === 'block' ? <Icon.lock /> : <span aria-hidden>!</span>}
          <span>{i.text}</span>
          {i.term && <Info term={i.term} />}
          {i.action && (
            <button type="button" className="link" onClick={i.action.run}>
              {i.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function LegCard({ leg, st, level, mismatched }: { leg: LivePricedLeg; st: Strategy; level: Level; mismatched: boolean }) {
  const s = useStore.getState()
  const buy = leg.side > 0
  const q = leg.quote
  const onDragStart = (e: DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.setData(LEGCARD_MIME, JSON.stringify({ strategyId: st.id, legId: leg.id }))
    e.dataTransfer.setData(symMime(leg.contract.symbol), '1')
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div className={`leg-card ${buy ? 'buy' : 'sell'} ${mismatched ? 'mismatch' : ''}`} draggable onDragStart={onDragStart}>
      <span className="grip" aria-hidden><Icon.grip /></span>
      <div className="leg-side">
        <span className={`side-tag ${buy ? 'buy' : 'sell'}`}>{buy ? <Icon.up /> : <Icon.down />} {buy ? 'Buy' : 'Sell'}</span>
        <Info term={buy ? 'buy' : 'sell'} />
      </div>
      <div className="leg-main">
        <div className="leg-title">
          <b className="mono">{fmtPrice(leg.contract.strike).replace(/\.00$/, '')}</b> {leg.contract.type === 'C' ? 'Call' : 'Put'}
          <span className="muted small"> · {fmtExpiry(leg.contract.expiry)}</span>
          {mismatched && <Badge tone="warn">different expiry</Badge>}
          {leg.qty > 1 && <Badge tone="accent">Qty {leg.qty}</Badge>}
        </div>
        <div className="leg-meta small">
          <span>
            Premium <b className="mono">{q.mid.toFixed(2)}</b>
            {level !== 'explorer' && <span className="muted mono"> ({q.bid.toFixed(2)} / {q.ask.toFixed(2)})</span>}
            <Info term="premium" example={`This one: ${q.mid.toFixed(2)} × 100 = about $${Math.round(q.mid * 100)} per contract.`} />
          </span>
          {level === 'explorer' ? (
            <span>≈ {Math.round(Math.abs(q.delta) * 100)}% chance ITM <Info term="chanceItm" /></span>
          ) : (
            <span className="mono">
              Δ {q.delta.toFixed(2)} <Info term="delta" /> {level === 'pro' && <>Γ {q.gamma.toFixed(3)} </>}Θ {q.theta.toFixed(2)} <Info term="theta" />
              {level === 'pro' && <> V {q.vega.toFixed(2)} IV {(q.iv * 100).toFixed(1)}</>}
            </span>
          )}
        </div>
      </div>
      <div className="leg-actions" onPointerDown={stop}>
        <Stepper value={leg.qty} label="leg quantity" onChange={(n) => s.setLegQty(st.id, leg.id, n)} />
        <button type="button" className="icon-btn" title={buy ? 'Flip to sell' : 'Flip to buy'} aria-label={`Flip ${leg.contract.strike} ${leg.contract.type} to ${buy ? 'sell' : 'buy'}`} onClick={() => s.flipLeg(st.id, leg.id)}>
          <Icon.flip />
        </button>
        <button type="button" className="icon-btn" aria-label={`Remove ${leg.contract.strike} ${leg.contract.type} leg`} onClick={() => s.removeLeg(st.id, leg.id)}>
          <Icon.close />
        </button>
      </div>
    </div>
  )
}

const TEMPLATE_KINDS: StrategyKind[] = ['bull_call_spread', 'bear_put_spread', 'bull_put_spread', 'bear_call_spread', 'long_straddle', 'long_strangle', 'iron_condor', 'calendar']

function EmptyBlock({ st, level }: { st: Strategy; level: Level }) {
  const structures = useStore((s) => s.profile?.structures)
  const active = useStore((s) => s.activeSymbol)
  const allowed = LEVEL_STRATEGIES[level]
  const pinned = TEMPLATE_KINDS.filter((k) => allowed.includes(k))
  pinned.sort((a, b) => Number(!!structures?.includes(b)) - Number(!!structures?.includes(a)))
  const build = (k: StrategyKind) => {
    const s = useStore.getState()
    const sym = (st.symbol ?? active) as Sym
    const expiry = expiriesFor(sym, new Date())[0]
    const res = resolveIntent({ action: 'open', strategy: k, underlying: sym, expiry, confidence: 1, risk: 'medium' }, { now: new Date(), level, spots: s.spots, positions: [] })
    if (res.kind === 'propose') s.patchStrategy(st.id, { legs: res.legs, symbol: sym, status: 'ready' })
  }
  return (
    <div className="empty-block">
      <div className="drop-zone">
        <div className="drop-icon" aria-hidden>⤓</div>
        <strong>Drag contracts here</strong>
        <span className="muted">from the Options Chain, or click Buy / Sell (bid / ask) on any row.</span>
      </div>
      <div className="templates">
        <span className="label">Or start from a template ({st.symbol ?? active}, nearest expiry)</span>
        <div className="chips">
          {pinned.slice(0, 6).map((k) => (
            <button type="button" key={k} className={`chip ${structures?.includes(k) ? 'pinned' : ''}`} onClick={() => build(k)}>
              {STRATEGY_NAMES[k]}
            </button>
          ))}
        </div>
      </div>
      {level !== 'explorer' && <div className="muted small">Tip: press <kbd>⌘K</kbd> and type a trade.</div>}
    </div>
  )
}

function Ticket({ st, s, level, stale }: { st: Strategy; s: StrategySummary; level: Level; stale: boolean }) {
  const store = useStore.getState()
  const hasLegs = s.legs.length > 0
  const limit = effectiveLimit(st, s)
  const requote = hasLegs && needsRequote(st, s)
  const issues = hasLegs ? ticketIssues(st, s, level, stale) : []
  const blocked = issues.find((i) => i.kind === 'block')
  const collarOff = hasLegs && st.priceMode === 'custom' && Math.abs(limit - s.mid) / Math.max(Math.abs(s.mid), 0.05) > PRICE_COLLAR
  const fees = estimatedFees(st.legs, st.units)
  const cost = Math.abs(limit) * CONTRACT_MULTIPLIER * st.units
  const a = s.analysis
  const bp = s.undefinedRisk ? null : limit > 0 ? cost + fees : (a.maxLoss === 'unlimited' ? 0 : a.maxLoss * st.units) + fees
  const multi = mergeLegs(st.legs).length > 1
  const [draft, setDraft] = useState<string | null>(null)
  const status = st.status
  const lastReq = useRef(false)
  const lockIssue = issues.find((i) => i.term === 'locked' || i.term === 'undefinedRisk')
  useEffect(() => {
    if (!lockIssue || !lockIssue.term) return
    const key = 'nudge-' + lockIssue.term
    if (store.help.seenNudges.includes(key)) return
    store.setHelp({ seenNudges: [...store.help.seenNudges, key] })
    store.toast({ kind: 'info', title: lockIssue.term === 'locked' ? 'This strategy is locked at your level' : 'Undefined risk is blocked at your level', body: 'Open the ⓘ next to the warning to see why, or use the fix it offers.' })
  }, [lockIssue?.term]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (requote && !lastReq.current) {
      const seen = store.help.seenNudges.includes('requote')
      if (!seen) {
        store.setHelp({ seenNudges: [...store.help.seenNudges, 'requote'] })
        store.toast({ kind: 'info', title: 'Prices moved', body: 'Re-Quote refreshes your limit so nothing fills at an old price. See the ⓘ next to the button.' })
      }
    }
    lastReq.current = requote
  }, [requote]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLimit = (v: number) => {
    if (!Number.isFinite(v)) return
    const signed = Math.round(Math.abs(v) * 100) / 100 * (s.mid >= 0 ? 1 : -1)
    store.patchStrategy(st.id, { priceMode: 'custom', limit: signed, quotedNet: s.mid, collarAck: false, forcedRequote: false })
  }
  const nudge = (d: number) => setLimit(Math.abs(limit) + d)
  const doRequote = () => store.patchStrategy(st.id, { priceMode: 'mid', limit: null, quotedNet: null, forcedRequote: false })

  if (status === 'filled' && st.fill) {
    const pos = store.positions.find((p) => p.id === st.positionId)
    return (
      <footer className="ticket filled" onPointerDown={stop}>
        <div className="filled-line">
          <span className="fill-check"><Icon.check /></span>
          <div>
            <b>{st.closesPositionId ? 'Position closed' : 'Filled'} at {fmtNet(st.fill.price)}</b>
            <div className="muted small">{st.units} × {st.label ?? s.recognition.name} · {st.symbol} · {new Date(st.fill.time).toLocaleTimeString()}</div>
          </div>
          <Badge tone="sample">Simulated</Badge>
        </div>
        <div className="row-gap">
          {pos && !pos.closed && (
            <button type="button" className="btn" onClick={() => closePosition(pos.symbol)}>Close position…</button>
          )}
          <button type="button" className="btn" onClick={() => store.clearStrategy(st.id)}>New strategy</button>
        </div>
      </footer>
    )
  }

  const busy = status === 'sending' || status === 'working'
  const disabled = !hasLegs || !!blocked || busy || (collarOff && !st.collarAck)
  const reason = !hasLegs ? 'Add legs to build a trade' : blocked ? blocked.text : collarOff && !st.collarAck ? 'Confirm the price warning first' : ''

  return (
    <footer className="ticket" onPointerDown={stop}>
      <div className="ticket-line">
        <b>{st.label ?? s.recognition.name}</b>
        <span className="muted mono small ellipsis">{hasLegs ? `${st.symbol} ${legsSummary(st.legs)}` : 'No legs yet'}</span>
      </div>
      <div className="ticket-grid">
        <div className="field-col">
          <span className="label">Quantity <Info term="quantity" /></span>
          <Stepper value={st.units} min={1} max={PRACTICE_QTY_CAP} label="number of spreads" onChange={(n) => store.patchStrategy(st.id, { units: n })} />
        </div>
        <div className="field-col">
          <span className="label">Order type <Info term="limit" /></span>
          <Segmented
            value="limit"
            label="Order type"
            onChange={() => undefined}
            options={[
              { value: 'limit', label: 'Limit' },
              { value: 'market', label: 'Market', disabled: multi, title: multi ? 'Multi-leg orders use limit prices' : 'Market orders are not used in this prototype' },
            ]}
          />
        </div>
        <div className="field-col">
          <span className="label">Time in force <Info term="tif" /></span>
          <Segmented value={st.tif} label="Time in force" onChange={(v) => store.patchStrategy(st.id, { tif: v })} options={[{ value: 'day', label: 'Day' }, { value: 'gtc', label: 'GTC' }]} />
        </div>
      </div>
      <div className="ticket-grid">
        <div className="field-col grow">
          <span className="label">Limit price <Info term="limitPrice" /></span>
          <div className="limit-row">
            <button type="button" className="nudge" aria-label="Lower limit by 0.01" onClick={() => nudge(-0.01)} disabled={!hasLegs}>−</button>
            <input
              className="limit-input mono"
              inputMode="decimal"
              aria-label="Limit price"
              disabled={!hasLegs}
              value={draft ?? Math.abs(limit).toFixed(2)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (draft !== null) setLimit(Number(draft)); setDraft(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <button type="button" className="nudge" aria-label="Raise limit by 0.01" onClick={() => nudge(0.01)} disabled={!hasLegs}>+</button>
            <span className="muted small">{limit > 0 ? 'debit' : limit < 0 ? 'credit' : ''}</span>
          </div>
        </div>
        <div className="field-col">
          <span className="label">Prefill <Info term="midNatural" /></span>
          <Segmented
            value={st.priceMode === 'natural' ? 'natural' : 'mid'}
            label="Mid or natural"
            onChange={(v) => store.patchStrategy(st.id, { priceMode: v, limit: null, quotedNet: null, forcedRequote: false })}
            options={[{ value: 'mid', label: 'Mid' }, { value: 'natural', label: 'Natural' }]}
          />
        </div>
      </div>
      <div className="ticket-figs small">
        <span>Est. {limit >= 0 ? 'debit' : 'credit'} <b className="mono">{hasLegs ? money(cost) : '—'}</b> <Info term="netDebitCredit" /></span>
        <span>Max loss <b className="mono neg">{!hasLegs ? '—' : a.maxLoss === 'unlimited' ? 'No limit' : money(a.maxLoss * st.units)}</b></span>
        <span>Fees <b className="mono">{hasLegs ? money(fees, 2) : '—'}</b> <Info term="fees" /></span>
        <span>Buying power <b className="mono">{!hasLegs ? '—' : bp === null ? 'n/a (undefined risk)' : `${money(bp)} of ${money(ACCOUNT_BUYING_POWER)}`}</b> <Info term="buyingPower" /></span>
      </div>
      {collarOff && (
        <label className="collar">
          <input type="checkbox" checked={st.collarAck} onChange={(e) => store.patchStrategy(st.id, { collarAck: e.target.checked }, { history: false })} />
          Your limit is more than {Math.round(PRICE_COLLAR * 100)}% away from mid ({fmtNet(s.mid)}). Send anyway.
        </label>
      )}
      {status === 'rejected' && st.rejectReason && <div className="issue issue-block">Rejected: {st.rejectReason}</div>}
      <div className="send-row">
        <span className="sim-chip" title="Practice mode: nothing is sent to a broker">
          <span className="sim-dot" /> Simulated <Info term="simulated" />
        </span>
        {requote && !busy ? (
          <button type="button" className="btn-send requote" onClick={doRequote}>
            Re-Quote <span className="muted small">mid now {fmtNet(s.mid)}</span>
          </button>
        ) : (
          <button type="button" className={`btn-send ${busy ? 'busy' : ''}`} disabled={disabled} title={reason} onClick={() => store.sendOrder(st.id)} data-guide="send">
            {status === 'sending' ? 'Sending…' : status === 'working' ? `Working at ${Math.abs(limit).toFixed(2)}…` : 'Send practice order'}
          </button>
        )}
        {requote && !busy && <Info term="requote" />}
      </div>
      {reason && !busy && <div className="muted small reason">{reason}</div>}
    </footer>
  )
}

export function closePosition(symbol: Sym) {
  const s = useStore.getState()
  const intent = parseCommand(`close my ${symbol} spread`, { now: new Date() })
  const res = resolveIntent(intent, {
    now: new Date(),
    level: s.level,
    spots: s.spots,
    positions: s.positions.filter((p) => !p.closed).map((p) => ({ id: p.id, symbol: p.symbol, name: p.name, legs: p.legs, units: p.units })),
  })
  if (res.kind !== 'propose') {
    s.toast({ kind: 'error', title: 'Nothing to close', body: res.kind === 'error' ? res.message : undefined })
    return
  }
  spawnStrategy(res.symbol, res.legs, { at: 'viewport', proposed: true, label: res.label, units: res.units, closesPositionId: res.closesPositionId, select: true })
}

/** Handle drops onto a block or the canvas (called from the canvas wrapper). */
export function handleLegDrop(e: DragEvent | globalThis.DragEvent, targetStrategyId: string | null, pagePoint: { x: number; y: number } | null): boolean {
  const dt = e.dataTransfer
  if (!dt) return false
  const s = useStore.getState()
  const legRaw = dt.getData(LEG_MIME)
  const cardRaw = dt.getData(LEGCARD_MIME)
  if (legRaw) {
    const { contract, side } = JSON.parse(legRaw)
    if (targetStrategyId) {
      const r = s.addLeg(targetStrategyId, contract, side)
      if (!r.ok && r.reason) s.toast({ kind: 'error', title: r.reason })
    } else if (pagePoint) {
      spawnStrategy(contract.symbol, [{ id: 'drop' + Date.now(), contract, side, qty: 1 }], { at: { x: pagePoint.x - 40, y: pagePoint.y - 40 } })
    }
    return true
  }
  if (cardRaw) {
    const { strategyId, legId } = JSON.parse(cardRaw)
    if (targetStrategyId === strategyId) return true
    const from = s.strategies[strategyId]
    const leg = from?.legs.find((l) => l.id === legId)
    s.removeLeg(strategyId, legId)
    if (leg && targetStrategyId) {
      const r = s.addLeg(targetStrategyId, leg.contract, leg.side)
      if (!r.ok) {
        s.addLeg(strategyId, leg.contract, leg.side)
        s.toast({ kind: 'error', title: r.reason ?? 'Could not move leg' })
      }
    }
    return true
  }
  return false
}
