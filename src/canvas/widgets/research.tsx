import { useEffect, useMemo, useRef, useState } from 'react'
import { SYMBOLS, SYMBOL_META, type Sym } from '../../config'
import { quote, strikesFor } from '../../engine/chain'
import { expiriesFor, fmtShort } from '../../engine/dates'
import { hash, rng } from '../../engine/rng'
import {
  SAMPLE_OUTLET,
  dayStats,
  headlinesFor,
  ivTakeaway,
  keyStatsTakeaway,
  oiTakeaway,
  rangePosition,
  researchFor,
  sentimentTakeaway,
  socialFor,
  volumeTakeaway,
} from '../../engine/research'
import { summarize } from '../../engine/strategy'
import { Info } from '../../help/Info'
import { useStore, sel } from '../../store'
import { useNow, useSpot } from '../../ui/hooks'
import { Sparkline } from '../../ui/primitives'

const fmtVol = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v))
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}%`

function RangeBar({ lo, hi, value, labelLo, labelHi }: { lo: number; hi: number; value: number; labelLo: string; labelHi: string; term?: string }) {
  const p = rangePosition(value, lo, hi)
  return (
    <div className="rangebar">
      <div className="rangebar-track" role="img" aria-label={`${Math.round(p * 100)}% of the way from ${labelLo} to ${labelHi}`}>
        <div className="rangebar-fill" style={{ width: `${p * 100}%` }} />
        <div className="rangebar-dot" style={{ left: `${p * 100}%` }} />
      </div>
      <div className="rangebar-labels">
        <span>{labelLo} <b className="mono">{lo.toFixed(2)}</b></span>
        <span className="accent mono">{Math.round(p * 100)}%</span>
        <span><b className="mono">{hi.toFixed(2)}</b> {labelHi}</span>
      </div>
    </div>
  )
}

export function KeyStats({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const tick = useStore((s) => s.tick)
  const checklist = useStore((s) => s.profile?.checklist ?? [])
  const r = researchFor(sym)
  const d = dayStats(sym, spot, tick)
  const earn = SYMBOL_META[sym].earningsInDays
  return (
    <div className="pad stack-12">
      <div className="kv-head">
        <span className="big mono">{spot.toFixed(2)}</span>
        <span className={d.changePct >= 0 ? 'pos' : 'neg'}>{pct(d.changePct)}</span>
        <span className="muted small">{SYMBOL_META[sym].name}</span>
      </div>
      <div>
        <div className="label">52-week range <Info term="range52w" example={keyStatsTakeaway(sym, spot)} /></div>
        <RangeBar lo={r.low52} hi={r.high52} value={spot} labelLo="Low" labelHi="High" term="range52w" />
      </div>
      <div>
        <div className="label">Day range <Info term="dayRange" /></div>
        <RangeBar lo={d.dayLow} hi={d.dayHigh} value={spot} labelLo="Low" labelHi="High" term="dayRange" />
      </div>
      <div className="kv-grid">
        <div><span className="label">Prev close</span><b className="mono">{r.prevClose.toFixed(2)}</b></div>
        <div><span className="label">Volume</span><b className="mono">{fmtVol(d.volume)}</b></div>
        <div><span className="label">Avg vol (30d)</span><b className="mono">{fmtVol(r.avgVolume)}</b></div>
      </div>
      {(earn || checklist.includes('events')) && (
        <div className="event-chip">
          <span className="dot" /> {earn ? `Earnings in ${earn} days (simulated)` : 'No earnings for this ETF. Macro events drive it.'}
          <Info term="earnings" />
        </div>
      )}
      <p className="takeaway">{keyStatsTakeaway(sym, spot)}</p>
    </div>
  )
}

export function VolumeWidget({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const tick = useStore((s) => s.tick)
  const r = researchFor(sym)
  const d = dayStats(sym, spot, tick)
  const ratio = d.volume / r.avgVolume
  const bars = r.intraday
  const now = new Date()
  const minutes = Math.max(0, (now.getHours() - 9) * 60 + now.getMinutes() - 30)
  const shown = Math.max(6, Math.min(26, Math.ceil(minutes / 15)))
  const max = Math.max(...bars)
  return (
    <div className="pad stack-12">
      <div className="kv-head">
        <span className="big mono">{ratio.toFixed(1)}×</span>
        <span className="muted">vs 30-day average <Info term="volume" example={volumeTakeaway(sym)} /></span>
      </div>
      <div className="ratio-bar">
        <div className="ratio-fill" style={{ width: `${Math.min(100, (ratio / 2.5) * 100)}%` }} />
        <div className="ratio-avg" style={{ left: `${(1 / 2.5) * 100}%` }} title="30-day average" />
      </div>
      <div className="vol-bars" aria-label="Intraday volume, 15-minute bars">
        {bars.map((b, i) => (
          <div key={i} className={`vol-bar ${i < shown ? '' : 'future'}`} style={{ height: `${(b / max) * 100}%` }} />
        ))}
      </div>
      <div className="row-between small muted"><span>09:30</span><span>Today {fmtVol(d.volume)} · Avg {fmtVol(r.avgVolume)}</span><span>16:00</span></div>
      <p className="takeaway">{volumeTakeaway(sym)}</p>
    </div>
  )
}

export function SentimentWidget({ sym }: { sym: Sym }) {
  const r = researchFor(sym)
  const spot = useSpot(sym)
  const total = r.analyst.buy + r.analyst.hold + r.analyst.sell
  const w = (n: number) => `${(n / total) * 100}%`
  const tp = rangePosition(spot, r.target.low, r.target.high)
  return (
    <div className="pad stack-12">
      <div>
        <div className="label">Analyst ratings (sample) <Info term="sentiment" /></div>
        <div className="split-bar">
          <div className="seg-buy" style={{ width: w(r.analyst.buy) }}>Buy {r.analyst.buy}</div>
          <div className="seg-hold" style={{ width: w(r.analyst.hold) }}>Hold {r.analyst.hold}</div>
          {r.analyst.sell > 0 && <div className="seg-sell" style={{ width: w(r.analyst.sell) }}>{r.analyst.sell}</div>}
        </div>
      </div>
      <div>
        <div className="label">Target range (sample)</div>
        <div className="rangebar">
          <div className="rangebar-track"><div className="rangebar-dot now" style={{ left: `${tp * 100}%` }} title="Current price" /></div>
          <div className="rangebar-labels"><span className="mono">{r.target.low.toFixed(0)}</span><span className="muted">median <b className="mono">{r.target.median.toFixed(0)}</b></span><span className="mono">{r.target.high.toFixed(0)}</span></div>
        </div>
      </div>
      <div>
        <div className="label">Community votes (sample)</div>
        <div className="split-bar">
          <div className="seg-buy" style={{ width: `${r.community.bullish}%` }}>Bullish {r.community.bullish}%</div>
          <div className="seg-sell" style={{ width: `${100 - r.community.bullish}%` }}>Bearish {100 - r.community.bullish}%</div>
        </div>
      </div>
      <p className="takeaway">{sentimentTakeaway(sym)}</p>
    </div>
  )
}

export function NewsWidget({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const now = useNow()
  const items = useMemo(() => headlinesFor(sym, spot, now), [sym, Math.round(spot), now.getDate()]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="news">
      <div className="news-channel" aria-label="News channel placeholder">
        <span className="live-dot" /> News channel slot <span className="muted small">(placeholder embed)</span>
      </div>
      <ul className="feed">
        {items.map((h, i) => (
          <li key={i}>
            <span className="mono muted small">{h.time}</span>
            <span className={`tag tag-${h.tag.toLowerCase()}`}>{h.tag}</span>
            <span className="headline">{h.text}</span>
          </li>
        ))}
      </ul>
      <div className="feed-foot muted small">Templated sample headlines · {SAMPLE_OUTLET}</div>
    </div>
  )
}

export function SocialWidget({ sym }: { sym: Sym }) {
  const posts = useMemo(() => socialFor(sym), [sym])
  return (
    <ul className="social">
      {posts.map((p, i) => (
        <li key={i} className={`post mood-${p.mood}`}>
          <div className="post-head">
            <span className="avatar" aria-hidden>{p.handle[1].toUpperCase()}</span>
            <b>{p.handle}</b>
            <span className="muted small">{p.ago}</span>
            <span className={`mood mood-${p.mood}`}>{p.mood}</span>
          </div>
          <p>{p.text}</p>
          <div className="muted small">♡ {p.likes} · fictional account</div>
        </li>
      ))}
    </ul>
  )
}

export function IvRankWidget({ sym }: { sym: Sym }) {
  const r = researchFor(sym)
  const a = (r.ivRank / 100) * Math.PI
  const cx = 110, cy = 100, rad = 78
  const x = cx - Math.cos(a) * rad
  const y = cy - Math.sin(a) * rad
  return (
    <div className="pad stack-8 center">
      <svg width="220" height="118" viewBox="0 0 220 118" aria-label={`IV Rank ${r.ivRank}`}>
        <defs>
          <linearGradient id="ivg" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--accent-bright)" />
            <stop offset="55%" stopColor="#d6b545" />
            <stop offset="100%" stopColor="var(--negative)" />
          </linearGradient>
        </defs>
        <path d={`M${cx - rad},${cy} A${rad},${rad} 0 0 1 ${cx + rad},${cy}`} stroke="url(#ivg)" strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.9" />
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--fg)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--fg)" />
        <text x={cx} y={cy - 26} textAnchor="middle" className="gauge-num">{r.ivRank}</text>
      </svg>
      <div className="row-gap">
        <span>IV Rank <b className="mono">{r.ivRank}</b> <Info term="ivrank" /></span>
        <span className="muted">Percentile <b className="mono">{r.ivPercentile}</b></span>
      </div>
      <p className="takeaway">{ivTakeaway(sym)}</p>
    </div>
  )
}

export function OiWidget({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const now = useNow()
  const exp = expiriesFor(sym, now)[0]
  const data = useMemo(() => {
    const ks = strikesFor(sym).filter((k) => Math.abs(k / SYMBOL_META[sym].spot - 1) < 0.06)
    const step = Math.max(1, Math.round(ks.length / 36))
    return ks.filter((_, i) => i % step === 0).map((k) => ({
      k,
      c: quote({ symbol: sym, expiry: exp, strike: k, type: 'C' }, SYMBOL_META[sym].spot, now).oi,
      p: quote({ symbol: sym, expiry: exp, strike: k, type: 'P' }, SYMBOL_META[sym].spot, now).oi,
    }))
  }, [sym, exp]) // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(...data.map((d) => Math.max(d.c, d.p)))
  const spotIdx = data.findIndex((d) => d.k >= spot)
  return (
    <div className="pad stack-8">
      <div className="row-between small"><span className="label">Open interest by strike · {fmtShort(exp)} <Info term="oi" /></span><span className="legend"><i className="lg-call" /> Calls <i className="lg-put" /> Puts</span></div>
      <div className="oi-chart">
        {data.map((d, i) => (
          <div key={d.k} className={`oi-col ${i === spotIdx ? 'spot' : ''}`} title={`${d.k}: calls ${d.c.toLocaleString()}, puts ${d.p.toLocaleString()}`}>
            <div className="oi-c" style={{ height: `${(d.c / max) * 50}%` }} />
            <div className="oi-p" style={{ height: `${(d.p / max) * 50}%` }} />
          </div>
        ))}
      </div>
      <div className="row-between small muted mono"><span>{data[0]?.k}</span><span>spot {spot.toFixed(1)}</span><span>{data[data.length - 1]?.k}</span></div>
      <p className="takeaway">{oiTakeaway(sym, SYMBOL_META[sym].spot, now)}</p>
    </div>
  )
}

export function Watchlist() {
  const spots = useStore((s) => s.spots)
  const active = useStore((s) => s.activeSymbol)
  return (
    <ul className="watchlist">
      {SYMBOLS.map((s) => {
        const prev = researchFor(s).prevClose
        const ch = ((spots[s] - prev) / prev) * 100
        return (
          <li key={s}>
            <button type="button" className={s === active ? 'on' : ''} onClick={() => useStore.getState().setActiveSymbol(s)}>
              <span className="mono b">{s}</span>
              <span className="muted small ellipsis">{SYMBOL_META[s].name}</span>
              <span className="mono">{spots[s].toFixed(2)}</span>
              <span className={`mono small ${ch >= 0 ? 'pos' : 'neg'}`}>{pct(ch)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function Depth({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const tick = useStore((s) => s.tick)
  const r = rng(hash(sym + tick))
  const step = sym === 'SPY' || sym === 'QQQ' ? 0.01 : 0.01
  const levels = Array.from({ length: 9 }, (_, i) => ({
    bid: spot - step * (i + 1) - i * 0.01,
    ask: spot + step * (i + 1) + i * 0.01,
    bs: Math.round(200 + r() * 3000),
    as: Math.round(200 + r() * 3000),
  }))
  const max = Math.max(...levels.map((l) => Math.max(l.bs, l.as)))
  return (
    <table className="depth">
      <thead><tr><th>Size</th><th>Bid</th><th>Ask</th><th>Size</th></tr></thead>
      <tbody>
        {levels.map((l, i) => (
          <tr key={i}>
            <td className="mono depth-b" style={{ backgroundSize: `${(l.bs / max) * 100}% 100%` }}>{l.bs}</td>
            <td className="mono pos">{l.bid.toFixed(2)}</td>
            <td className="mono neg">{l.ask.toFixed(2)}</td>
            <td className="mono depth-a" style={{ backgroundSize: `${(l.as / max) * 100}% 100%` }}>{l.as}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TimeSales({ sym }: { sym: Sym }) {
  const spot = useSpot(sym)
  const tick = useStore((s) => s.tick)
  const [rows, setRows] = useState<{ t: string; p: number; s: number; side: 'buy' | 'sell' }[]>([])
  const last = useRef(spot)
  useEffect(() => {
    const r = rng(hash(sym + ':' + tick))
    const n = 1 + Math.floor(r() * 3)
    const now = new Date()
    const t = now.toTimeString().slice(0, 8)
    const add = Array.from({ length: n }, () => {
      const side: 'buy' | 'sell' = spot > last.current ? (r() < 0.7 ? 'buy' : 'sell') : spot < last.current ? (r() < 0.7 ? 'sell' : 'buy') : r() < 0.5 ? 'buy' : 'sell'
      return { t, p: spot + (side === 'buy' ? 0.01 : -0.01), s: Math.round(r() < 0.08 ? 2000 + r() * 8000 : 10 + r() * 600), side }
    })
    last.current = spot
    setRows((x) => [...add, ...x].slice(0, 40))
  }, [tick, sym]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <table className="tape">
      <thead><tr><th>Time</th><th>Price</th><th>Size</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`tape-${r.side} ${r.s > 1500 ? 'big' : ''}`}>
            <td className="mono muted">{r.t}</td>
            <td className="mono">{r.p.toFixed(2)}</td>
            <td className="mono">{r.s.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function GreeksPanel() {
  const st = useStore(sel.activeStrategy)
  const spots = useStore((s) => s.spots)
  const level = useStore((s) => s.level)
  const now = useNow()
  const hist = useRef<{ id: string | null; d: number[]; g: number[]; t: number[]; v: number[] }>({ id: null, d: [], g: [], t: [], v: [] })
  if (!st || !st.legs.length) return <div className="empty pad">Build a strategy to see its net Greeks here.</div>
  const s = summarize(st.legs, spots, now, st.units)
  const h = hist.current
  if (h.id !== st.id) Object.assign(h, { id: st.id, d: [], g: [], t: [], v: [] })
  h.d = [...h.d, s.greeks.delta].slice(-40)
  h.g = [...h.g, s.greeks.gamma].slice(-40)
  h.t = [...h.t, s.greeks.theta].slice(-40)
  h.v = [...h.v, s.greeks.vega].slice(-40)
  const rows: { k: string; label: string; v: number; d: number[]; digits: number; show: boolean }[] = [
    { k: 'delta', label: 'Net Delta', v: s.greeks.delta, d: h.d, digits: 1, show: true },
    { k: 'gamma', label: 'Net Gamma', v: s.greeks.gamma, d: h.g, digits: 2, show: level === 'pro' },
    { k: 'theta', label: 'Net Theta /day', v: s.greeks.theta, d: h.t, digits: 2, show: true },
    { k: 'vega', label: 'Net Vega /pt', v: s.greeks.vega, d: h.v, digits: 2, show: level === 'pro' },
  ]
  return (
    <div className="pad stack-8">
      <div className="muted small">{s.recognition.name} · {st.symbol} · {st.units}×</div>
      {rows.filter((r) => r.show).map((r) => (
        <div key={r.k} className="greek-row">
          <span>{r.label} <Info term={r.k} /></span>
          <Sparkline values={r.d} tone={r.v >= 0 ? 'accent' : 'neg'} />
          <b className={`mono ${r.v >= 0 ? 'pos' : 'neg'}`}>{r.v >= 0 ? '+' : ''}{r.v.toFixed(r.digits)}</b>
        </div>
      ))}
    </div>
  )
}
