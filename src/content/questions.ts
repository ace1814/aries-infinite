import type { Level, StrategyKind } from '../engine/types'
import type { WidgetKind } from './widgets'

export type ChecklistItem =
  | 'range52w'
  | 'dayRange'
  | 'volume'
  | 'news'
  | 'sentiment'
  | 'social'
  | 'chart'
  | 'iv'
  | 'oi'
  | 'events'
  | 'unusual'
  | 'skew'
  | 'pcr'
  | 'greeks'

export interface ResearchProfile {
  level: Level
  checklist: ChecklistItem[]
  strikeStyle?: 'price' | 'delta' | 'premium' | 'distance' | 'support'
  structures?: StrategyKind[]
  horizon?: 'week' | 'month' | 'quarter'
  help: { explainMode: boolean; hotspots: boolean }
  commandBarIntro: boolean
  /** Explorer Q2 "Seeing how much I could lose". */
  emphasizeRisk?: boolean
  /** Explorer Q2 "Seeing what a contract costs". */
  premiumFocus?: boolean
}

export interface AnswerCard {
  id: string
  label: string
  line: string
  term?: string
  widgets?: WidgetKind[]
  checklist?: ChecklistItem[]
  comingSoon?: boolean
}

export interface Question {
  id: string
  title: string
  multi: boolean
  cards: AnswerCard[]
  /** What "Not sure" selects. */
  notSure: string[]
}

export const QUESTIONS: Record<Level, Question[]> = {
  explorer: [
    {
      id: 'look',
      title: "When you're thinking about a stock, what do you usually look at?",
      multi: true,
      notSure: ['range52w', 'chart', 'news'],
      cards: [
        { id: 'range52w', label: 'Is the price high or low compared with the last year?', line: 'Adds Key Stats with the 52-week range.', term: 'range52w', widgets: ['keystats'], checklist: ['range52w'] },
        { id: 'dayRange', label: 'How much it moved today', line: 'Adds the day range and a price chart.', term: 'dayRange', widgets: ['keystats', 'chart'], checklist: ['dayRange', 'chart'] },
        { id: 'volume', label: 'How busy it is (how much has traded)', line: 'Adds Volume, compared with a normal day.', term: 'volume', widgets: ['volume'], checklist: ['volume'] },
        { id: 'news', label: 'What the news is saying', line: 'Adds a News feed (sample headlines).', term: 'news', widgets: ['news'], checklist: ['news'] },
        { id: 'crowd', label: 'What other people think', line: 'Adds Sentiment and Social (sample data).', term: 'sentiment', widgets: ['sentiment', 'social'], checklist: ['sentiment', 'social'] },
        { id: 'chart', label: 'A price chart', line: 'Adds a candle chart of past prices.', term: 'chart', widgets: ['chart'], checklist: ['chart'] },
      ],
    },
    {
      id: 'help',
      title: 'What would help you most?',
      multi: true,
      notSure: ['explain', 'loss'],
      cards: [
        { id: 'explain', label: 'Understanding what each number means', line: 'Turns on Explain mode: every ⓘ is easy to spot.', term: 'explain' },
        { id: 'loss', label: 'Seeing how much I could lose', line: 'Puts the payoff picture and the plain-English sentence first.', term: 'maxLoss' },
        { id: 'cost', label: 'Seeing what a contract costs', line: 'A simpler chain with the premium up front.', term: 'premium' },
      ],
    },
    {
      id: 'learn',
      title: 'How do you like to learn?',
      multi: false,
      notSure: ['walk'],
      cards: [
        { id: 'walk', label: 'Walk me through it', line: 'Shows short "How to read this" tips as you go.' },
        { id: 'explore', label: 'Let me explore', line: 'No tips. The ⓘ icons stay if you need them.' },
      ],
    },
  ],
  trader: [
    {
      id: 'check',
      title: 'Before you pick an option, what do you check?',
      multi: true,
      notSure: ['range52w', 'dayVol', 'iv', 'chart'],
      cards: [
        { id: 'range52w', label: '52-week high and low', line: 'Key Stats with the range bar.', term: 'range52w', widgets: ['keystats'], checklist: ['range52w'] },
        { id: 'dayVol', label: 'Day range and volume vs average', line: 'Key Stats plus Volume.', term: 'volume', widgets: ['keystats', 'volume'], checklist: ['dayRange', 'volume'] },
        { id: 'news', label: 'News', line: 'Sample headline feed.', term: 'news', widgets: ['news'], checklist: ['news'] },
        { id: 'sentiment', label: 'Analyst and community sentiment', line: 'Sample ratings and votes.', term: 'sentiment', widgets: ['sentiment'], checklist: ['sentiment'] },
        { id: 'social', label: 'Social threads', line: 'Sample posts from fictional accounts.', term: 'social', widgets: ['social'], checklist: ['social'] },
        { id: 'iv', label: 'Implied volatility', line: 'IV column in the chain plus IV Rank.', term: 'iv', widgets: ['ivrank'], checklist: ['iv'] },
        { id: 'events', label: 'Earnings date', line: 'An events chip on Key Stats.', term: 'earnings', widgets: ['keystats'], checklist: ['events'] },
        { id: 'oi', label: 'Open interest', line: 'OI column in the chain.', term: 'oi', checklist: ['oi'] },
        { id: 'chart', label: 'A price chart', line: 'Candle chart.', term: 'chart', widgets: ['chart'], checklist: ['chart'] },
      ],
    },
    {
      id: 'strike',
      title: 'How do you usually pick a strike?',
      multi: false,
      notSure: ['price'],
      cards: [
        { id: 'price', label: 'By price level', line: 'Chain sorted by strike.', term: 'strike' },
        { id: 'delta', label: 'By delta', line: 'Delta column highlighted.', term: 'delta' },
        { id: 'premium', label: 'By premium I want to pay or receive', line: 'Mid column highlighted.', term: 'premium' },
        { id: 'distance', label: 'By distance from the current price', line: 'Adds a "% from price" column.', term: 'moneyness' },
      ],
    },
    {
      id: 'trade',
      title: 'What do you trade most?',
      multi: false,
      notSure: ['both'],
      cards: [
        { id: 'singles', label: 'Single calls and puts', line: 'Starts you on singles, spreads one click away.', term: 'call' },
        { id: 'spreads', label: 'Spreads', line: 'Spread templates pinned in the Strategy Block.', term: 'spread' },
        { id: 'both', label: 'A bit of both', line: 'A mix of templates.', term: 'leg' },
      ],
    },
    {
      id: 'horizon',
      title: 'How far out do you usually trade?',
      multi: false,
      notSure: ['month'],
      cards: [
        { id: 'week', label: 'This week', line: 'Chain opens on the nearest expiry.', term: 'expiration' },
        { id: 'month', label: '2–4 weeks', line: 'Chain opens 2–4 weeks out.', term: 'expiration' },
        { id: 'quarter', label: '1–3 months', line: 'Chain opens on the monthly expiry.', term: 'expiration' },
      ],
    },
  ],
  pro: [
    {
      id: 'checklist',
      title: "What's on your pre-trade checklist?",
      multi: true,
      notSure: ['ivrank', 'oi', 'events', 'greeks'],
      cards: [
        { id: 'ivrank', label: 'IV Rank and percentile', line: 'IV Rank gauge.', term: 'ivrank', widgets: ['ivrank'], checklist: ['iv'] },
        { id: 'skew', label: 'Skew and term structure', line: 'Coming soon in this prototype.', term: 'skew', comingSoon: true },
        { id: 'oi', label: 'Open interest and volume by strike', line: 'OI by Strike histogram and chain columns.', term: 'oi', widgets: ['oi'], checklist: ['oi', 'volume'] },
        { id: 'unusual', label: 'Unusual activity', line: 'Time & Sales tape.', term: 'timesales', widgets: ['timesales'], checklist: ['unusual'] },
        { id: 'events', label: 'Earnings and events', line: 'Events chip on Key Stats.', term: 'earnings', widgets: ['keystats'], checklist: ['events'] },
        { id: 'pcr', label: 'Put/call ratio', line: 'Coming soon in this prototype.', term: 'pcr', comingSoon: true },
        { id: 'greeks', label: 'Net Greeks exposure', line: 'Greeks Panel for the active strategy.', term: 'greeks', widgets: ['greeks'], checklist: ['greeks'] },
        { id: 'range52w', label: '52-week range', line: 'Key Stats.', term: 'range52w', widgets: ['keystats'], checklist: ['range52w'] },
        { id: 'newsSocial', label: 'News and social', line: 'Sample News and Social feeds.', term: 'news', widgets: ['news', 'social'], checklist: ['news', 'social'] },
      ],
    },
    {
      id: 'strike',
      title: 'How do you pick strikes?',
      multi: false,
      notSure: ['delta'],
      cards: [
        { id: 'delta', label: 'By delta', line: 'Delta column highlighted.', term: 'delta' },
        { id: 'premium', label: 'By premium', line: 'Mid column highlighted.', term: 'premium' },
        { id: 'distance', label: 'By % from spot', line: 'Adds a "% from spot" column.', term: 'moneyness' },
        { id: 'support', label: 'By support/resistance', line: 'Adds "% from spot" and a chart.', term: 'strike', widgets: ['chart'] },
      ],
    },
    {
      id: 'structures',
      title: 'Which structures do you reach for?',
      multi: true,
      notSure: ['credit', 'ic'],
      cards: [
        { id: 'credit', label: 'Credit spreads', line: 'Bull put and bear call templates.', term: 'credit' },
        { id: 'debit', label: 'Debit spreads', line: 'Bull call and bear put templates.', term: 'debit' },
        { id: 'ic', label: 'Iron condors', line: 'Iron condor template and Command Bar example.', term: 'ironCondor' },
        { id: 'straddles', label: 'Straddles and strangles', line: 'Straddle and strangle templates.', term: 'straddle' },
        { id: 'calendars', label: 'Calendars', line: 'Calendar template.', term: 'calendar' },
      ],
    },
    {
      id: 'command',
      title: 'Want the Command Bar?',
      multi: false,
      notSure: ['yes'],
      cards: [
        { id: 'yes', label: 'Yes, introduce ⌘K', line: 'A short intro in your first trade.', term: 'commandBar' },
        { id: 'later', label: "I'll find it", line: 'No intro. ⌘K is always there.', term: 'commandBar' },
      ],
    },
  ],
}

export type Answers = Record<string, string[]>

const STRUCTURE_MAP: Record<string, StrategyKind[]> = {
  credit: ['bull_put_spread', 'bear_call_spread'],
  debit: ['bull_call_spread', 'bear_put_spread'],
  ic: ['iron_condor'],
  straddles: ['long_straddle', 'long_strangle'],
  calendars: ['calendar'],
  singles: ['long_call', 'long_put'],
  spreads: ['bull_call_spread', 'bull_put_spread', 'bear_put_spread', 'bear_call_spread'],
  both: ['long_call', 'bull_call_spread', 'bull_put_spread'],
}

/** Answers → ResearchProfile (PRD §5.7 output contract). */
export function buildProfile(level: Level, answers: Answers): ResearchProfile {
  const qs = QUESTIONS[level]
  const pick = (qid: string) => {
    const q = qs.find((x) => x.id === qid)
    const a = answers[qid]
    if (!q) return []
    return a && a.length ? a : []
  }
  const checklist = new Set<ChecklistItem>()
  for (const q of qs) for (const id of pick(q.id)) for (const c of q.cards.find((x) => x.id === id)?.checklist ?? []) checklist.add(c)

  const p: ResearchProfile = {
    level,
    checklist: [...checklist],
    help: { explainMode: level === 'explorer', hotspots: level !== 'pro' },
    commandBarIntro: level === 'pro',
  }
  if (level === 'explorer') {
    const help = pick('help')
    p.help.explainMode = help.length ? help.includes('explain') : true
    p.emphasizeRisk = help.includes('loss')
    p.premiumFocus = help.includes('cost')
    const learn = pick('learn')
    p.help.hotspots = learn.length ? learn.includes('walk') : true
    p.structures = ['bull_call_spread', 'bear_put_spread']
  }
  if (level === 'trader') {
    p.strikeStyle = (pick('strike')[0] as ResearchProfile['strikeStyle']) ?? 'price'
    p.structures = STRUCTURE_MAP[pick('trade')[0] ?? 'both']
    p.horizon = (pick('horizon')[0] as ResearchProfile['horizon']) ?? 'month'
    p.help = { explainMode: false, hotspots: true }
  }
  if (level === 'pro') {
    p.strikeStyle = (pick('strike')[0] as ResearchProfile['strikeStyle']) ?? 'delta'
    p.structures = pick('structures').flatMap((s) => STRUCTURE_MAP[s] ?? [])
    if (!p.structures.length) p.structures = ['bull_put_spread', 'iron_condor']
    p.commandBarIntro = (pick('command')[0] ?? 'yes') === 'yes'
    p.help = { explainMode: false, hotspots: false }
    p.horizon = 'week'
  }
  return p
}

/** Answers → ordered research widgets (first thing checked comes first). */
export function researchWidgets(level: Level, answers: Answers): WidgetKind[] {
  const out: WidgetKind[] = []
  for (const q of QUESTIONS[level]) {
    for (const id of answers[q.id] ?? []) {
      const card = q.cards.find((c) => c.id === id)
      for (const w of card?.widgets ?? []) if (!out.includes(w)) out.push(w)
    }
  }
  return out
}

export const DEFAULT_ANSWERS: Record<Level, Answers> = {
  explorer: { look: ['range52w', 'chart', 'news'], help: ['explain', 'loss'], learn: ['walk'] },
  trader: { check: ['range52w', 'dayVol', 'iv', 'chart'], strike: ['price'], trade: ['both'], horizon: ['month'] },
  pro: { checklist: ['ivrank', 'oi', 'events', 'greeks'], strike: ['delta'], structures: ['credit', 'ic'], command: ['yes'] },
}
