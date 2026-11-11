import type { Level } from '../engine/types'

export type WidgetKind =
  | 'watchlist'
  | 'chart'
  | 'chain'
  | 'depth'
  | 'timesales'
  | 'keystats'
  | 'volume'
  | 'sentiment'
  | 'news'
  | 'social'
  | 'ivrank'
  | 'oi'
  | 'strategy'
  | 'greeks'

export interface WidgetDef {
  kind: WidgetKind
  title: string
  w: number
  h: number
  /** ⌥ shortcut letter (KeyX code), matching the Aries widget menu. */
  shortcut?: string
  group: 'aries' | 'research' | 'trade'
  minLevel?: Level
  /** "About this widget" (PRD §7A.4). */
  about: string
  /** Glossary term for the title ⓘ. */
  term: string
  /** Uses the linked ticker. */
  linked: boolean
  sample?: boolean
}

export const WIDGETS: Record<WidgetKind, WidgetDef> = {
  watchlist: { kind: 'watchlist', title: 'Watchlist', w: 300, h: 300, shortcut: 'KeyW', group: 'aries', about: 'A short list of symbols with live prices. Click one to switch every linked widget to it.', term: 'watchlist', linked: false },
  chart: { kind: 'chart', title: 'Chart', w: 620, h: 420, shortcut: 'KeyC', group: 'aries', about: 'Price history as candles. Traders use it to see trend, recent range and how far price has moved.', term: 'chart', linked: true },
  chain: { kind: 'chain', title: 'Options Chain', w: 600, h: 640, shortcut: 'KeyO', group: 'aries', about: 'Every call and put for one expiry, with prices. This is where you see what contracts cost and pick legs.', term: 'chain', linked: true },
  depth: { kind: 'depth', title: 'Market Depth', w: 320, h: 380, shortcut: 'KeyL', group: 'aries', about: 'Simulated bids and offers stacked by price. Shows how much is waiting to trade near the current price.', term: 'depth', linked: true },
  timesales: { kind: 'timesales', title: 'Time & Sales', w: 320, h: 380, shortcut: 'KeyT', group: 'aries', about: 'A tape of simulated trades as they print. Green prints traded at the ask (buyers), red at the bid (sellers).', term: 'timesales', linked: true },
  keystats: { kind: 'keystats', title: 'Key Stats', w: 380, h: 340, group: 'research', about: 'Where the price sits in its 52-week and day ranges, plus volume. Answers "is it high or low right now?"', term: 'range52w', linked: true },
  volume: { kind: 'volume', title: 'Volume', w: 360, h: 250, group: 'research', about: "How busy the stock is today compared with its 30-day average. Busy days often mean news or bigger moves.", term: 'volume', linked: true },
  sentiment: { kind: 'sentiment', title: 'Sentiment', w: 360, h: 290, group: 'research', about: 'A sample split of analyst ratings and community votes. Shows what others think, not what will happen.', term: 'sentiment', linked: true, sample: true },
  news: { kind: 'news', title: 'News', w: 380, h: 360, group: 'research', about: 'Templated sample headlines from a fictional outlet. In a real product this would be a licensed news feed.', term: 'news', linked: true, sample: true },
  social: { kind: 'social', title: 'Social', w: 360, h: 360, group: 'research', about: 'Sample posts from fictional accounts, showing the kind of chatter traders scan. Not real people or quotes.', term: 'social', linked: true, sample: true },
  ivrank: { kind: 'ivrank', title: 'IV Rank', w: 300, h: 250, group: 'research', minLevel: 'trader', about: "Where today's implied volatility sits versus the past year. High IV usually means pricier options.", term: 'ivrank', linked: true },
  oi: { kind: 'oi', title: 'OI by Strike', w: 420, h: 280, group: 'research', minLevel: 'pro', about: 'Open interest for calls and puts at each strike. Shows where positioning is concentrated.', term: 'oi', linked: true },
  strategy: { kind: 'strategy', title: 'Strategy Block', w: 540, h: 820, group: 'trade', about: 'Drop contracts here to build one trade. It names the strategy, draws the payoff and holds the order ticket.', term: 'strategy', linked: false },
  greeks: { kind: 'greeks', title: 'Greeks Panel', w: 340, h: 250, group: 'trade', minLevel: 'trader', about: 'Net Greeks of the active strategy: how its value tends to change with price, time and volatility.', term: 'greeks', linked: false },
}

export const WIDGET_MENU: WidgetKind[][] = [
  ['watchlist', 'chart', 'chain', 'depth', 'timesales'],
  ['keystats', 'volume', 'sentiment', 'news', 'social', 'ivrank', 'oi'],
  ['strategy', 'greeks'],
]
