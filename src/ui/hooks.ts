import { useMemo } from 'react'
import { SYMBOLS, type Sym } from '../config'
import { expiriesFor } from '../engine/dates'
import { useStore } from '../store'

/** "Now", refreshed on every market tick so time-dependent values breathe. */
export function useNow(): Date {
  const tick = useStore((s) => s.tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Date(), [tick])
}

export function useSpot(sym: Sym): number {
  return useStore((s) => s.spots[sym])
}

export function asSym(x: string | undefined | null): Sym | null {
  return x && (SYMBOLS as readonly string[]).includes(x) ? (x as Sym) : null
}

/** Linked widgets follow the canvas symbol; unlinked ones hold their own (PRD §6A). */
export function useWidgetSymbol(linked: boolean, own: string): Sym {
  const active = useStore((s) => s.activeSymbol)
  return linked ? active : asSym(own) ?? active
}

/** Default expiry from the research profile's horizon (PRD §5.5). */
export function useDefaultExpiry(sym: Sym, now: Date): string {
  const horizon = useStore((s) => s.profile?.horizon)
  const list = expiriesFor(sym, now)
  if (horizon === 'quarter') return list[list.length - 1]
  if (horizon === 'month') {
    const target = now.getTime() + 14 * 86_400_000
    return list.find((e) => new Date(e).getTime() >= target) ?? list[0]
  }
  return list[0]
}
