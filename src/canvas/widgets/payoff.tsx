import { useMemo, useState } from 'react'
import { firstExpiry, pnlAt } from '../../engine/payoff'
import type { LivePricedLeg } from '../../engine/strategy'
import { fmtPrice, signedMoney } from '../../engine/strategy'

const DAY = 86_400_000

export interface PayoffProps {
  legs: LivePricedLeg[]
  units: number
  spot: number
  now: Date
  width: number
  height?: number
  breakevens: number[]
  scrubPrice: number | null
  scrubDays: number
  symbol: string
}

export function payoffRange(legs: LivePricedLeg[], spot: number): [number, number] {
  const ks = legs.map((l) => l.contract.strike)
  const minK = Math.min(...ks, spot)
  const maxK = Math.max(...ks, spot)
  const span = Math.max(maxK - minK, spot * 0.02)
  return [Math.max(0.01, minK - span * 0.9), maxK + span * 0.9]
}

/** SVG tent diagram with expiry and T+0 curves (PRD §6.1). */
export function PayoffChart({ legs, units, spot, now, width, height = 190, breakevens, scrubPrice, scrubDays, symbol }: PayoffProps) {
  const [hover, setHover] = useState<number | null>(null)
  const W = width
  const H = height
  const padL = 46
  const padR = 10
  const padT = 12
  const padB = 22
  const [lo, hi] = payoffRange(legs, spot)
  const fe = firstExpiry(legs) ?? now
  const at = new Date(Math.min(fe.getTime(), now.getTime() + scrubDays * DAY))
  const N = 140
  const xs = useMemo(() => Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N), [lo, hi])
  const exp = xs.map((S) => pnlAt(legs, S, fe) * units)
  const t0 = xs.map((S) => pnlAt(legs, S, at) * units)
  const all = [...exp, ...t0, 0]
  let yMin = Math.min(...all)
  let yMax = Math.max(...all)
  const pad = Math.max((yMax - yMin) * 0.12, 10)
  yMin -= pad
  yMax += pad
  const X = (S: number) => padL + ((S - lo) / (hi - lo)) * (W - padL - padR)
  const Y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB)
  const y0 = Y(0)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const expPath = path(exp)
  const area = `${expPath} L${X(hi).toFixed(1)},${y0.toFixed(1)} L${X(lo).toFixed(1)},${y0.toFixed(1)} Z`
  const gid = useMemo(() => 'pg' + Math.random().toString(36).slice(2, 8), [])
  const ticks = niceTicks(yMin, yMax, 4)
  const hoverS = hover
  const hoverExp = hoverS !== null ? pnlAt(legs, hoverS, fe) * units : 0
  const hoverT0 = hoverS !== null ? pnlAt(legs, hoverS, at) * units : 0
  const scrubS = scrubPrice
  const scrubV = scrubS !== null ? pnlAt(legs, scrubS, fe) * units : 0

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    if (px < padL || px > W - padR) return setHover(null)
    setHover(lo + ((px - padL) / (W - padL - padR)) * (hi - lo))
  }

  return (
    <svg
      className="payoff"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`Payoff chart for ${symbol}. Breakevens ${breakevens.map((b) => b.toFixed(2)).join(', ') || 'none'}.`}
    >
      <defs>
        <clipPath id={`${gid}-up`}><rect x={0} y={0} width={W} height={Math.max(0, y0)} /></clipPath>
        <clipPath id={`${gid}-dn`}><rect x={0} y={y0} width={W} height={Math.max(0, H - y0)} /></clipPath>
        <linearGradient id={`${gid}-gu`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent-bright)" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={`${gid}-gd`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--negative)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--negative)" stopOpacity="0.42" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'zero' : 'grid'} />
          <text x={padL - 6} y={Y(t) + 3.5} textAnchor="end" className="axis">{fmtAxis(t)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid}-gu)`} clipPath={`url(#${gid}-up)`} />
      <path d={area} fill={`url(#${gid}-gd)`} clipPath={`url(#${gid}-dn)`} />
      <path d={expPath} className="exp-line up" clipPath={`url(#${gid}-up)`} />
      <path d={expPath} className="exp-line dn" clipPath={`url(#${gid}-dn)`} />
      <path d={path(t0)} className="t0-line" />
      {/* spot */}
      <line x1={X(spot)} x2={X(spot)} y1={padT} y2={H - padB} className="spot-line" />
      <text x={X(spot)} y={H - 6} textAnchor="middle" className="axis spot-label">now {fmtPrice(spot)}</text>
      {/* breakevens */}
      {breakevens.filter((b) => b > lo && b < hi).map((b) => (
        <g key={b}>
          <circle cx={X(b)} cy={y0} r={3.5} className="be-dot" />
          <text x={X(b)} y={y0 - 7} textAnchor="middle" className="axis be-label">{fmtPrice(b)}</text>
        </g>
      ))}
      {scrubS !== null && (
        <g>
          <line x1={X(scrubS)} x2={X(scrubS)} y1={padT} y2={H - padB} className="scrub-line" />
          <circle cx={X(scrubS)} cy={Y(scrubV)} r={4} className={scrubV >= 0 ? 'dot-up' : 'dot-dn'} />
        </g>
      )}
      {hoverS !== null && (
        <g className="hover">
          <line x1={X(hoverS)} x2={X(hoverS)} y1={padT} y2={H - padB} />
          <circle cx={X(hoverS)} cy={Y(hoverExp)} r={3.5} className={hoverExp >= 0 ? 'dot-up' : 'dot-dn'} />
          <g transform={`translate(${Math.min(W - 150, Math.max(padL, X(hoverS) + 8))},${padT + 2})`}>
            <rect width={140} height={44} rx={6} className="tip-bg" />
            <text x={8} y={15} className="tip-t">{symbol} at ${fmtPrice(hoverS)}</text>
            <text x={8} y={29} className={hoverExp >= 0 ? 'tip-up' : 'tip-dn'}>Expiry {signedMoney(hoverExp)}</text>
            <text x={8} y={40} className="tip-m">Today {signedMoney(hoverT0)}</text>
          </g>
        </g>
      )}
    </svg>
  )
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v * 100) / 100)
  if (!out.includes(0) && lo < 0 && hi > 0) out.push(0)
  return out
}

function fmtAxis(v: number) {
  const a = Math.abs(v)
  const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a.toFixed(0)
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}$${s}`
}
