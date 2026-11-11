import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/** Stop tldraw from treating this pointer as a canvas gesture (select / drag shape). */
export const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** Native wheel listener so scroll areas inside shapes scroll instead of panning the canvas. */
export function useWheelStop<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // pinch-zoom still zooms the canvas
      const canScroll = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
      if (canScroll) e.stopPropagation()
    }
    el.addEventListener('wheel', h, { passive: true })
    return () => el.removeEventListener('wheel', h)
  }, [ref])
}

export interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function rectOf(el: Element | null): AnchorRect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

/**
 * Fixed-size floating layer above the canvas (not scaled with zoom, PRD §7A.1).
 */
export function Floating({
  anchor,
  children,
  onClose,
  placement = 'bottom',
  className = '',
  width,
  closeOnOutside = true,
}: {
  anchor: AnchorRect
  children: ReactNode
  onClose?: () => void
  placement?: 'bottom' | 'top' | 'right' | 'left'
  className?: string
  width?: number
  closeOnOutside?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchor.left + anchor.width / 2 - w / 2
    let top = anchor.bottom + 8
    if (placement === 'top' || (placement === 'bottom' && top + h > vh - 8)) top = anchor.top - h - 8
    if (placement === 'right') { left = anchor.right + 10; top = anchor.top + anchor.height / 2 - h / 2 }
    if (placement === 'left') { left = anchor.left - w - 10; top = anchor.top + anchor.height / 2 - h / 2 }
    left = Math.max(8, Math.min(vw - w - 8, left))
    top = Math.max(8, Math.min(vh - h - 8, top))
    setPos({ left, top })
  }, [anchor.left, anchor.top, anchor.width, anchor.height, anchor.right, anchor.bottom, placement])
  useEffect(() => {
    if (!onClose) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const down = (e: PointerEvent) => {
      if (closeOnOutside && ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', key, true)
    const t = setTimeout(() => window.addEventListener('pointerdown', down, true), 0)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', down, true)
      clearTimeout(t)
    }
  }, [onClose, closeOnOutside])
  return createPortal(
    <div ref={ref} className={`floating ${className}`} style={{ left: pos.left, top: pos.top, width }} onPointerDown={stop} onWheel={stop}>
      {children}
    </div>,
    document.body,
  )
}

export function Badge({ children, tone = 'muted', title }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warn' | 'neg' | 'sample'; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  label?: string
}) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label} onPointerDown={stop}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" onPointerDown={stop}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="num" aria-label={label}>{value}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

export function Sparkline({ values, width = 64, height = 18, tone = 'accent' }: { values: number[]; width?: number; height?: number; tone?: 'accent' | 'neg' | 'muted' }) {
  if (values.length < 2) return <svg width={width} height={height} />
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} className={`spark spark-${tone}`} aria-hidden>
      <path d={d} fill="none" strokeWidth={1.4} />
    </svg>
  )
}
