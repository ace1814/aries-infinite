import { useMemo, useState } from 'react'
import type { Sym } from '../../config'
import { chartTakeaway, researchFor } from '../../engine/research'
import { useSpot } from '../../ui/hooks'
import { stop } from '../../ui/primitives'

const RANGES = [
  { id: '5y', days: 1260, agg: 5 },
  { id: '1y', days: 252, agg: 1 },
  { id: '6m', days: 126, agg: 1 },
  { id: '3m', days: 63, agg: 1 },
  { id: '1m', days: 21, agg: 1 },
  { id: '5d', days: 5, agg: 1 },
  { id: '1d', days: 1, agg: 1 },
] as const

type Bar = { o: number; h: number; l: number; c: number }

/** A TradingView-style mock: candles, left drawing rail, range bar, bottom tab strip (PRD §2.1). */
export function ChartWidget({ sym, w, h }: { sym: Sym; w: number; h: number }) {
  const spot = useSpot(sym)
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('6m')
  const [tab, setTab] = useState<'acct' | 'trade'>('trade')
  const r = researchFor(sym)
  const def = RANGES.find((x) => x.id === range)!

  const bars: Bar[] = useMemo(() => {
    if (def.days <= 5) {
      // Intraday: synthesize 5-minute bars ending at spot.
      const n = def.days === 1 ? 78 : 5 * 26
      const out: Bar[] = []
      let p = r.prevClose
      const vol = 0.0012
      let seed = sym.charCodeAt(0) * 97
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      for (let i = 0; i < n; i++) {
        const o = p
        const c = p * (1 + (rnd() - 0.5) * vol * 2)
        out.push({ o, c, h: Math.max(o, c) * (1 + rnd() * vol * 0.6), l: Math.min(o, c) * (1 - rnd() * vol * 0.6) })
        p = c
      }
      const k = spot / out[out.length - 1].c
      return out.map((b, i) => {
        const f = 1 + (k - 1) * (i / (out.length - 1))
        return { o: b.o * f, h: b.h * f, l: b.l * f, c: b.c * f }
      })
    }
    const src = r.history.slice(-def.days)
    const agg: Bar[] = []
    for (let i = 0; i < src.length; i += def.agg) {
      const g = src.slice(i, i + def.agg)
      agg.push({ o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)) })
    }
    agg.push({ o: r.prevClose, c: spot, h: Math.max(r.prevClose, spot) * 1.001, l: Math.min(r.prevClose, spot) * 0.999 })
    return agg
  }, [range, sym, def.days <= 5 ? Math.round(spot * 10) : Math.round(spot)]) // eslint-disable-line react-hooks/exhaustive-deps

  const cw = Math.max(200, w - 44 - 56)
  const chH = Math.max(120, h - 36 - 34 - 30 - 28)
  const lo = Math.min(...bars.map((b) => b.l))
  const hi = Math.max(...bars.map((b) => b.h))
  const pad = (hi - lo) * 0.08
  const y = (v: number) => chH - ((v - (lo - pad)) / (hi - lo + pad * 2)) * chH
  const step = cw / bars.length
  const bw = Math.max(1, step * 0.62)
  const ticks = 4
  return (
    <div className="chart">
      <div className="chart-main">
        <div className="chart-rail" aria-hidden>
          {['✛', '╱', '═', '⌇', 'T', '◯', '⌫'].map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        <svg width={cw + 56} height={chH} className="chart-svg" role="img" aria-label={`${sym} candles, ${range}`}>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = lo - pad + ((hi - lo + pad * 2) * i) / ticks
            return (
              <g key={i}>
                <line x1={0} x2={cw} y1={y(v)} y2={y(v)} className="grid" />
                <text x={cw + 6} y={y(v) + 4} className="axis">{v.toFixed(v > 100 ? 0 : 2)}</text>
              </g>
            )
          })}
          {bars.map((b, i) => {
            const up = b.c >= b.o
            const x = i * step + step / 2
            return (
              <g key={i} className={up ? 'up' : 'dn'}>
                <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
                <rect x={x - bw / 2} y={y(Math.max(b.o, b.c))} width={bw} height={Math.max(1, Math.abs(y(b.o) - y(b.c)))} />
              </g>
            )
          })}
          <line x1={0} x2={cw} y1={y(spot)} y2={y(spot)} className="last-line" />
          <rect x={cw + 2} y={y(spot) - 9} width={52} height={18} rx={4} className="last-tag" />
          <text x={cw + 28} y={y(spot) + 4} textAnchor="middle" className="last-text">{spot.toFixed(2)}</text>
        </svg>
      </div>
      <div className="chart-ranges" onPointerDown={stop}>
        {RANGES.map((x) => (
          <button key={x.id} type="button" className={x.id === range ? 'on' : ''} onClick={() => setRange(x.id)}>
            {x.id}
          </button>
        ))}
        <span className="w-spacer" />
        <span className="muted small takeaway-inline">{chartTakeaway(sym, spot)}</span>
      </div>
      <div className="chart-tabs" onPointerDown={stop}>
        <button type="button" className={tab === 'acct' ? 'on' : ''} onClick={() => setTab('acct')}>Account Manager</button>
        <button type="button" className={tab === 'trade' ? 'on' : ''} onClick={() => setTab('trade')}>Trade</button>
      </div>
    </div>
  )
}
