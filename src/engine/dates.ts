import { SYMBOL_META, type Sym } from '../config'

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Expiry moment: 16:00 local on the expiry date. */
export function expiryMoment(iso: string): Date {
  const d = fromIso(iso)
  d.setHours(16, 0, 0, 0)
  return d
}

/** Years until expiry, never below one hour. */
export function yearsTo(iso: string, now: Date): number {
  const ms = expiryMoment(iso).getTime() - now.getTime()
  return Math.max(ms, 3_600_000) / (365 * DAY)
}

export function daysTo(iso: string, now: Date): number {
  return Math.max(0, (expiryMoment(iso).getTime() - now.getTime()) / DAY)
}

/** "Fri 13 Nov" */
export function fmtExpiry(iso: string): string {
  const d = fromIso(iso)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "13 Nov" */
export function fmtShort(iso: string): string {
  const d = fromIso(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Upcoming Fridays, including today if it is Friday and before the close. */
export function upcomingFridays(now: Date, count: number): Date[] {
  const out: Date[] = []
  let d = startOfDay(now)
  const isFriBeforeClose = d.getDay() === 5 && now.getHours() < 16
  if (!isFriBeforeClose) d = addDays(d, ((5 - d.getDay() + 7) % 7) || 7)
  while (out.length < count) {
    out.push(d)
    d = addDays(d, 7)
  }
  return out
}

/** Third Friday of a month. */
export function thirdFriday(year: number, month: number): Date {
  const first = new Date(year, month, 1)
  const offset = (5 - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + 14)
}

export function upcomingMonthlies(now: Date, count: number): Date[] {
  const out: Date[] = []
  let y = now.getFullYear()
  let m = now.getMonth()
  const today = startOfDay(now)
  while (out.length < count) {
    const tf = thirdFriday(y, m)
    if (tf.getTime() > today.getTime() || (tf.getTime() === today.getTime() && now.getHours() < 16)) out.push(tf)
    m++
    if (m > 11) { m = 0; y++ }
  }
  return out
}

const cache = new Map<string, string[]>()

/**
 * Next four Fridays plus the next monthly for weekly symbols; next three monthlies otherwise (PRD §8).
 */
export function expiriesFor(sym: Sym, now: Date): string[] {
  const key = `${sym}:${toIso(now)}:${now.getHours() < 16}`
  const hit = cache.get(key)
  if (hit) return hit
  let list: string[]
  if (SYMBOL_META[sym].weekly) {
    const fridays = upcomingFridays(now, 4).map(toIso)
    const monthly = upcomingMonthlies(now, 3).map(toIso).find((m) => !fridays.includes(m) && m > fridays[fridays.length - 1])
    list = monthly ? [...fridays, monthly] : fridays
  } else {
    list = upcomingMonthlies(now, 3).map(toIso)
  }
  cache.set(key, list)
  return list
}

export function isMonthly(iso: string): boolean {
  const d = fromIso(iso)
  return toIso(thirdFriday(d.getFullYear(), d.getMonth())) === iso
}
