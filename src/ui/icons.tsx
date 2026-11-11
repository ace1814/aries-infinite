// Icons: Phosphor (regular weight), matching the Aries toolbar and widget menu.
// Two Aries glyphs have no Phosphor equivalent (candlesticks, squares-plus); they are
// drawn here on Phosphor's 256 grid with its regular stroke so they sit in the same set.
import {
  ArrowsDownUp,
  ArrowsLeftRight,
  Bell,
  Broadcast,
  CaretDown,
  CaretUp,
  ChartBar,
  ChartBarHorizontal,
  ChatsCircle,
  Check,
  Clock,
  Cursor,
  DotsSixVertical,
  DotsThreeVertical,
  Eye,
  Gauge,
  Hand,
  Link,
  LinkBreak,
  ListNumbers,
  Lock,
  MathOperations,
  Microphone,
  Newspaper,
  Plus,
  PresentationChart,
  Question,
  Smiley,
  Sparkle,
  Stack,
  Strategy,
  User,
  X,
  type IconProps,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'
import type { WidgetKind } from '../content/widgets'

const S = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 16 }

/** Two candlesticks (Aries "widgets" button). */
function Candles({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" {...(rest as object)}>
      <g {...S}>
        <rect x="56" y="72" width="40" height="88" rx="8" />
        <path d="M76 40v32M76 160v40" />
        <rect x="160" y="96" width="40" height="88" rx="8" />
        <path d="M180 56v40M180 184v32" />
      </g>
    </svg>
  )
}

/** Three squares and a plus (Aries "apps" button). */
function SquaresPlus({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" {...(rest as object)}>
      <g {...S}>
        <rect x="48" y="48" width="64" height="64" rx="16" />
        <rect x="144" y="48" width="64" height="64" rx="16" />
        <rect x="48" y="144" width="64" height="64" rx="16" />
        <path d="M176 144v64M144 176h64" />
      </g>
    </svg>
  )
}

const i = (C: ComponentType<IconProps>, size = 18, extra: IconProps = {}) => () => <C size={size} {...extra} />

export const Icon = {
  candles: i(Candles, 20),
  orders: i(ArrowsDownUp, 20),
  live: i(Broadcast, 20),
  account: i(User, 20),
  apps: i(SquaresPlus, 20),
  pointer: i(Cursor),
  hand: i(Hand),
  sparkle: i(Sparkle),
  bell: i(Bell),
  help: i(Question),
  plus: i(Plus, 16),
  more: i(DotsThreeVertical, 16, { weight: 'bold' }),
  link: i(Link, 13),
  unlink: i(LinkBreak, 13),
  flip: i(ArrowsLeftRight, 14),
  close: i(X, 14),
  lock: i(Lock, 13),
  mic: i(Microphone, 16),
  up: i(CaretUp, 10, { weight: 'fill' }),
  down: i(CaretDown, 10, { weight: 'fill' }),
  check: i(Check, 14, { weight: 'bold' }),
  caret: i(CaretDown, 12, { weight: 'fill' }),
  grip: i(DotsSixVertical, 14, { weight: 'bold' }),
}

const WIDGET_ICONS: Record<WidgetKind, ComponentType<IconProps>> = {
  watchlist: Eye,
  chart: PresentationChart,
  chain: Link,
  depth: Stack,
  timesales: Clock,
  keystats: ListNumbers,
  volume: ChartBar,
  sentiment: Smiley,
  news: Newspaper,
  social: ChatsCircle,
  ivrank: Gauge,
  oi: ChartBarHorizontal,
  strategy: Strategy,
  greeks: MathOperations,
}

export function WidgetIcon({ kind, size = 16 }: { kind: WidgetKind; size?: number }) {
  const C = WIDGET_ICONS[kind]
  return <C size={size} aria-hidden />
}
