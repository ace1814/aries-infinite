import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useEditor } from 'tldraw'
import type { Sym } from '../../config'
import { atmStrike, chainFor, type Contract, type Quote } from '../../engine/chain'
import { expiriesFor, fmtExpiry } from '../../engine/dates'
import type { Level, Side } from '../../engine/types'
import { Info } from '../../help/Info'
import { useStore } from '../../store'
import { useDefaultExpiry, useNow, useSpot } from '../../ui/hooks'
import { Segmented, stop } from '../../ui/primitives'
import type { AriesWidgetShape } from '../WidgetShape'
import { addLegFromChain } from './legActions'

export const LEG_MIME = 'application/x-aries-leg'
export const symMime = (s: string) => `x-aries-sym-${s.toLowerCase()}`

export function startLegDrag(e: DragEvent, contract: Contract, side: Side) {
  e.stopPropagation()
  e.dataTransfer.setData(LEG_MIME, JSON.stringify({ contract, side }))
  e.dataTransfer.setData(symMime(contract.symbol), '1')
  e.dataTransfer.effectAllowed = 'copyMove'
}

type Col = 'bid' | 'ask' | 'mid' | 'iv' | 'delta' | 'vol' | 'oi' | 'dist' | 'chance' | 'buysell'

function columnsFor(level: Level, checklist: string[], strikeStyle: string | undefined, classic: boolean): Col[] {
  const dist = strikeStyle === 'distance' || strikeStyle === 'support'
  if (level === 'explorer') return ['mid', 'chance', 'buysell']
  if (level === 'trader') {
    const c: Col[] = classic ? ['bid', 'ask', 'delta'] : ['bid', 'ask', 'mid', 'iv', 'delta']
    if (!classic && checklist.includes('volume')) c.push('vol')
    if (checklist.includes('oi')) c.push('oi')
    if (!classic && dist) c.push('dist')
    return c
  }
  const c: Col[] = classic ? ['bid', 'ask', 'iv', 'delta', 'oi'] : ['bid', 'ask', 'mid', 'iv', 'delta', 'vol', 'oi']
  if (!classic && dist) c.push('dist')
  return c
}

const HEAD: Record<Col, { label: string; term: string }> = {
  bid: { label: 'Bid', term: 'bid' },
  ask: { label: 'Ask', term: 'ask' },
  mid: { label: 'Mid', term: 'mid' },
  iv: { label: 'IV', term: 'iv' },
  delta: { label: 'Δ', term: 'delta' },
  vol: { label: 'Vol', term: 'volume' },
  oi: { label: 'OI', term: 'oi' },
  dist: { label: '% from', term: 'moneyness' },
  chance: { label: '≈ Chance ITM', term: 'chanceItm' },
  buysell: { label: 'Add', term: 'side' },
}

export function ChainWidget({ shape, sym }: { shape: AriesWidgetShape; sym: Sym }) {
  const editor = useEditor()
  const level = useStore((s) => s.level)
  const profile = useStore((s) => s.profile)
  const guide = useStore((s) => s.onboarding.guide)
  const spot = useSpot(sym)
  const now = useNow()
  const expiries = expiriesFor(sym, now)
  const defExp = useDefaultExpiry(sym, now)
  const expiry = expiries.includes(shape.props.expiry) ? shape.props.expiry : defExp
  const layout = (shape.props.layout || (level === 'pro' ? 'classic' : 'list')) as 'list' | 'classic'
  const filter = (shape.props.filter || 'calls') as 'calls' | 'puts'
  const [radius, setRadius] = useState(level === 'explorer' ? 8 : 12)
  const listRef = useRef<HTMLDivElement>(null)
  const set = (p: Partial<AriesWidgetShape['props']>) => editor.updateShape<AriesWidgetShape>({ id: shape.id, type: 'aries-widget', props: p })

  const rows = chainFor(sym, expiry, spot, now)
  const atm = atmStrike(sym, spot)
  const atmIdx = rows.findIndex((r) => r.strike === atm)
  const shown = rows.slice(Math.max(0, atmIdx - radius), atmIdx + radius + 1)
  const classic = layout === 'classic'
  const cols = columnsFor(level, profile?.checklist ?? [], profile?.strikeStyle, classic)
  const hl: Col | null = profile?.strikeStyle === 'delta' ? 'delta' : profile?.strikeStyle === 'premium' || profile?.premiumFocus ? 'mid' : null

  // Premium heat: tint mid by its rank in view.
  const maxMid = useMemo(() => Math.max(...shown.map((r) => Math.max(r.call.mid, r.put.mid))), [shown])

  useEffect(() => {
    const el = listRef.current?.querySelector('.atm')
    el?.scrollIntoView({ block: 'center' })
  }, [sym, expiry, layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const guideHas = (q: Quote, side: Side) => !!guide && guide.split(',').includes(`${q.type}${q.strike}${side > 0 ? 'buy' : 'sell'}`)

  const cell = (q: Quote, c: Col) => {
    switch (c) {
      case 'bid':
        return (
          <td key={c} className="cell-btn">
            <button type="button" draggable onDragStart={(e) => startLegDrag(e, q, -1)} onClick={() => addLegFromChain(q, -1)} className={`px bid ${guideHas(q, -1) ? 'guide-target' : ''}`} aria-label={`Sell ${q.strike} ${q.type === 'C' ? 'call' : 'put'} at bid ${q.bid.toFixed(2)}`} title="Click or drag: sell at the bid">
              {q.bid.toFixed(2)}
            </button>
          </td>
        )
      case 'ask':
        return (
          <td key={c} className="cell-btn">
            <button type="button" draggable onDragStart={(e) => startLegDrag(e, q, 1)} onClick={() => addLegFromChain(q, 1)} className={`px ask ${guideHas(q, 1) ? 'guide-target' : ''}`} aria-label={`Buy ${q.strike} ${q.type === 'C' ? 'call' : 'put'} at ask ${q.ask.toFixed(2)}`} title="Click or drag: buy at the ask">
              {q.ask.toFixed(2)}
            </button>
          </td>
        )
      case 'mid':
        return (
          <td key={c} className={`mono heat ${hl === 'mid' ? 'hl' : ''}`} style={{ ['--heat' as string]: String(Math.min(1, q.mid / maxMid)) }}>
            {q.mid.toFixed(2)}
          </td>
        )
      case 'iv':
        return <td key={c} className="mono muted">{(q.iv * 100).toFixed(1)}</td>
      case 'delta':
        return <td key={c} className={`mono ${hl === 'delta' ? 'hl' : ''}`}>{q.delta.toFixed(2)}</td>
      case 'vol':
        return <td key={c} className="mono muted">{q.volume.toLocaleString()}</td>
      case 'oi':
        return <td key={c} className="mono muted">{q.oi.toLocaleString()}</td>
      case 'dist':
        return <td key={c} className="mono muted">{(((q.strike - spot) / spot) * 100).toFixed(1)}%</td>
      case 'chance':
        return (
          <td key={c} className="mono">
            <span className="chance"><span style={{ width: `${Math.abs(q.delta) * 100}%` }} /></span>
            {Math.round(Math.abs(q.delta) * 100)}%
          </td>
        )
      case 'buysell':
        return (
          <td key={c} className="cell-btn buysell">
            <button type="button" draggable onDragStart={(e) => startLegDrag(e, q, 1)} onClick={() => addLegFromChain(q, 1)} className={`chip-buy ${guideHas(q, 1) ? 'guide-target' : ''}`} aria-label={`Buy ${q.strike} ${q.type === 'C' ? 'call' : 'put'} for about ${q.ask.toFixed(2)}`}>
              Buy
            </button>
            <button type="button" draggable onDragStart={(e) => startLegDrag(e, q, -1)} onClick={() => addLegFromChain(q, -1)} className={`chip-sell ${guideHas(q, -1) ? 'guide-target' : ''}`} aria-label={`Sell ${q.strike} ${q.type === 'C' ? 'call' : 'put'} for about ${q.bid.toFixed(2)}`}>
              Sell
            </button>
          </td>
        )
    }
  }

  const headCell = (c: Col, k?: string) => (
    <th key={k ?? c} className={hl === c ? 'hl' : ''}>
      {c === 'mid' && level === 'explorer' ? 'Premium' : HEAD[c].label}
      <Info term={c === 'mid' && level === 'explorer' ? 'premium' : HEAD[c].term} />
    </th>
  )

  return (
    <div className="chain">
      <div className="chain-bar" onPointerDown={stop}>
        <label className="field">
          <span className="sr-only">Expiry</span>
          <select value={expiry} onChange={(e) => set({ expiry: e.target.value })} aria-label="Expiry">
            {expiries.map((x) => (
              <option key={x} value={x}>{fmtExpiry(x)}</option>
            ))}
          </select>
          <Info term="expiration" />
        </label>
        {!classic && (
          <span className="term">
            <Segmented value={filter} onChange={(v) => set({ filter: v })} label="Calls or puts" options={[{ value: 'calls', label: 'Calls' }, { value: 'puts', label: 'Puts' }]} />
            <Info term="callsPuts" />
          </span>
        )}
        <span className="w-spacer" />
        <span className="term">
          <Segmented value={layout} onChange={(v) => set({ layout: v })} label="Chain layout" options={[{ value: 'list', label: 'List' }, { value: 'classic', label: 'Classic' }]} />
          <Info term="listClassic" />
        </span>
      </div>
      <div className="chain-scroll" ref={listRef} onPointerDown={stop}>
        <table className={`chain-table ${classic ? 'classic' : 'list'} lvl-${level}`}>
          <thead>
            {classic ? (
              <>
                <tr className="side-head">
                  <th colSpan={cols.length}>Calls</th>
                  <th />
                  <th colSpan={cols.length}>Puts</th>
                </tr>
                <tr>
                  {[...cols].reverse().map((c) => headCell(c, 'c' + c))}
                  <th className="strike-h">Strike <Info term="strike" /></th>
                  {cols.map((c) => headCell(c, 'p' + c))}
                </tr>
              </>
            ) : (
              <tr>
                <th className="strike-h">Strike <Info term="strike" /></th>
                {cols.map((c) => headCell(c))}
              </tr>
            )}
          </thead>
          <tbody>
            {shown.map((r) => {
              const isAtm = r.strike === atm
              const q = filter === 'calls' ? r.call : r.put
              const itmCall = r.strike < spot
              if (classic) {
                return (
                  <tr key={r.strike} className={isAtm ? 'atm' : ''}>
                    {[...cols].reverse().map((c) => <ChainCellWrap key={'c' + c} itm={itmCall}>{cell(r.call, c)}</ChainCellWrap>)}
                    <td className="strike mono" draggable onDragStart={(e) => startLegDrag(e, r.call, 1)}>{r.strike}</td>
                    {cols.map((c) => <ChainCellWrap key={'p' + c} itm={!itmCall}>{cell(r.put, c)}</ChainCellWrap>)}
                  </tr>
                )
              }
              const itm = q.type === 'C' ? r.strike < spot : r.strike > spot
              return (
                <tr
                  key={r.strike}
                  className={`${isAtm ? 'atm' : ''} ${itm ? 'itm' : ''} draggable-row`}
                  draggable
                  onDragStart={(e) => startLegDrag(e, q, 1)}
                  title="Drag to a Strategy Block to buy, or use the buttons"
                >
                  <td className="strike mono">
                    {r.strike}
                    {isAtm && <span className="atm-tag">ATM</span>}
                  </td>
                  {cols.map((c) => cell(q, c))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="chain-more">
          <button type="button" className="link" onClick={() => setRadius((x) => x + 10)}>Show more strikes</button>
          <span className="muted small">Spot {spot.toFixed(2)} · {sym}</span>
        </div>
      </div>
    </div>
  )
}

function ChainCellWrap({ children }: { children: React.ReactNode; itm: boolean }) {
  return <>{children}</>
}
