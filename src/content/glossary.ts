import type { Level } from '../engine/types'

// One place for all explanatory copy (PRD §7A.3). Explain, never advise.

export type GlossaryGroup = 'Basics' | 'Prices' | 'Greeks' | 'Orders' | 'Strategies' | 'Research' | 'This app'

export interface GlossaryEntry {
  term: string
  group: GlossaryGroup
  /** Tooltip, 15 words or fewer. */
  short: string
  explorer: string
  trader: string
  pro: string
  why?: string
}

const E = (term: string, group: GlossaryGroup, short: string, explorer: string, trader: string, pro: string, why?: string): GlossaryEntry => ({ term, group, short, explorer, trader, pro, why })

export const GLOSSARY: Record<string, GlossaryEntry> = {
  option: E('Option', 'Basics', 'A contract giving the right, not the obligation, to buy or sell.', 'A contract that gives you the right, not the obligation, to buy or sell a stock at a set price before a set date.', 'A contract on 100 shares with a strike and an expiry. Calls and puts.', 'Exchange-listed equity option, 100 multiplier, American exercise for single names.'),
  call: E('Call', 'Basics', 'The right to buy at the strike price.', 'The right to buy at the strike price. It tends to gain value when the stock rises.', 'Right to buy at the strike. Positive delta.', 'Long call: +Δ, +Γ, −Θ, +V.'),
  put: E('Put', 'Basics', 'The right to sell at the strike price.', 'The right to sell at the strike price. It tends to gain value when the stock falls.', 'Right to sell at the strike. Negative delta.', 'Long put: −Δ, +Γ, −Θ, +V. Skew usually makes OTM puts richer.'),
  strike: E('Strike price', 'Basics', 'The set price written in the contract.', 'The set price written in the contract.', 'The price the option lets you buy or sell at.', 'Exercise price. Listed on a fixed grid per underlying.', 'Strikes decide where your trade starts making or losing money.'),
  expiration: E('Expiration', 'Basics', 'The date the contract ends.', 'The date the contract ends.', 'Last trading day. Weeklies end on Fridays; monthlies on the third Friday.', 'Expiry. PM-settled Friday weeklies and monthlies here.', 'Closer expiries cost less but have less time to work.'),
  contract: E('Contract', 'Basics', 'One contract usually covers 100 shares.', 'One contract usually covers 100 shares.', 'One contract = 100 shares, so a 2.10 premium is $210.', 'Multiplier 100.'),
  premium: E('Premium', 'Prices', 'The price of the option, quoted per share.', 'The price of the option, quoted per share. A premium of 2.10 costs about $210 for one contract.', 'Option price per share. × 100 for one contract.', 'Quoted per share; × multiplier for notional.', 'It is what you pay to buy, or receive to sell.'),
  bid: E('Bid', 'Prices', 'The highest price buyers are offering right now.', 'The highest price buyers are offering right now. If you sell now, you usually get about this.', 'Best price to sell at right now.', 'NBB. Selling at the bid crosses the spread.'),
  ask: E('Ask', 'Prices', 'The lowest price sellers are asking right now.', 'The lowest price sellers are asking right now. If you buy now, you usually pay about this.', 'Best price to buy at right now.', 'NBO. Buying at the ask crosses the spread.'),
  mid: E('Mid', 'Prices', 'The price halfway between bid and ask.', 'The price halfway between bid and ask. A common starting point for a limit order.', 'Halfway between bid and ask. Limit orders here often fill.', '(bid + ask) / 2. Default limit here.'),
  natural: E('Natural price', 'Prices', 'Buy every leg at the ask and sell at the bid.', 'The price if every leg trades right away: buy at the ask, sell at the bid. Usually worse than mid.', 'Pay the ask on buys, hit the bid on sells. Fills fast, costs more.', 'Natural = Σ(ask on longs) − Σ(bid on shorts). Marketable.'),
  buy: E('Buy (long)', 'Basics', 'You own the right. The most you can lose is what you paid.', 'You buy a contract and own the right. The most you can lose is what you paid.', 'Long: pay premium, own the right.', 'Long premium, defined risk.'),
  sell: E('Sell (short)', 'Basics', 'You take on an obligation. Selling can carry more risk.', 'You sell a contract and take on an obligation. Selling can carry more risk, so some kinds are locked.', 'Short: receive premium, take the obligation.', 'Short premium. Naked shorts are undefined risk.'),
  side: E('Side', 'Orders', 'Buy or sell this leg.', 'Buy means you own the contract. Sell means you owe it. Green is buy, red is sell.', 'Long or short this leg. Flip with ⇄.', 'Long/short. ⇄ flips.'),
  quantity: E('Quantity', 'Orders', 'How many contracts (or spreads).', 'How many contracts. One contract covers 100 shares.', 'Contracts per leg, or number of spreads on the ticket.', 'Ratio per leg; ticket qty multiplies the whole structure.'),
  leg: E('Leg', 'Basics', 'One option inside a trade made of several options.', 'One option inside a trade made of several options.', 'One option inside a multi-leg order.', 'Single component of a complex order.'),
  spread: E('Spread', 'Strategies', 'Buy one option and sell another to limit cost and risk.', 'A trade that buys one option and sells another to limit cost and risk.', 'Two or more legs on one underlying, priced as one order.', 'Vertical, calendar, diagonal, etc.'),
  debit: E('Debit', 'Prices', 'You pay money to open the trade.', 'A debit means you pay money to open the trade.', 'Net cost to open.', 'Net long premium.'),
  credit: E('Credit', 'Prices', 'You receive money to open the trade.', 'A credit means you receive money to open the trade.', 'Net premium received to open.', 'Net short premium.'),
  netDebitCredit: E('Net debit / credit', 'Prices', 'What the whole trade costs or pays, per share.', 'What the whole trade costs (debit) or pays you (credit), per share. × 100 for one contract.', 'Sum of all legs. Debit = you pay, credit = you receive.', 'Σ side × qty × price.'),
  maxProfit: E('Max profit', 'Prices', 'The most the trade can make.', 'The most the trade can make if things go as well as possible.', 'Best case at expiry.', 'Max of expiry P&L.'),
  maxLoss: E('Max loss', 'Prices', 'The most the trade can lose.', 'The most the trade can lose. For a debit spread, it is what you paid.', 'Worst case at expiry. Defined for spreads.', 'Min of expiry P&L. Unlimited if net short calls.', 'Knowing this before you send is the point of the Strategy Block.'),
  breakeven: E('Breakeven', 'Prices', 'The price at expiry where you neither make nor lose.', 'The stock price at expiry where you neither make nor lose money.', 'Where expiry P&L crosses zero.', 'Zero crossings of the expiry payoff.'),
  payoff: E('Payoff chart', 'Prices', 'How much you make or lose at different prices.', 'A picture of how much you make or lose at different stock prices on expiry day. Green is profit, red is loss.', 'Expiry P&L across prices, plus a today (T+0) curve.', 'Expiry payoff and T+0 BS revaluation.'),
  t0: E('T+0 curve', 'Prices', 'What the trade would be worth today at each price.', 'The dashed line shows what the trade would be worth today if the stock jumped to that price. It moves toward the solid line as expiry nears.', 'Today’s mark-to-model P&L at each price.', 'Black-Scholes revaluation at current IV and time.'),
  priceScrubber: E('Price at expiry', 'Prices', 'Drag to see P&L at a chosen stock price.', 'Drag this to pick a stock price and read what you would make or lose there.', 'Scrub price to read P&L.', 'Spot scrubber.'),
  dayScrubber: E('Days to expiry', 'Prices', 'Drag to see the trade on a future date.', 'Drag to move forward in time. The dashed curve shows the trade on that day.', 'Moves the T+0 curve through time (theta).', 'Time scrubber: revalue at t.'),
  itm: E('In / at / out of the money', 'Basics', 'Whether the option already has value at today’s price.', 'In the money means the option already has value at today’s price. At the money means the strike is about the current price. Out of the money means it does not yet.', 'ITM has intrinsic value; ATM ≈ spot; OTM has only time value.', 'Moneyness.'),
  moneyness: E('% from price', 'Prices', 'How far the strike is from the current price.', 'How far the strike is from today’s price, in percent.', 'Strike distance from spot, %.', 'ln(K/S) ≈ % OTM.'),
  iv: E('Implied volatility (IV)', 'Prices', 'How big a price swing the market expects.', 'How big a price swing the market expects. Higher IV usually means pricier options.', 'Market-implied annualised vol. Drives premium.', 'Annualised σ implied by price. Skewed by strike.'),
  ivrank: E('IV Rank', 'Research', 'Where today’s IV sits compared with the past year.', 'Where today’s IV sits compared with the past year. 0 is the lowest, 100 the highest.', '(IV − 1y low) / (1y high − 1y low).', 'IVR and IV percentile (days below today).', 'It shows whether options are cheap or rich for this stock.'),
  delta: E('Delta', 'Greeks', 'How much the option moves when the stock moves $1.', 'How much the option price tends to move when the stock moves $1. It is also a rough guide to the chance of finishing in the money.', 'Price change per $1 in the stock. ≈ probability ITM.', '∂V/∂S. Net Δ in shares-equivalent × 100.', 'It tells you how much the trade leans up or down.'),
  chanceItm: E('≈ Chance in the money', 'Greeks', 'A rough guide from delta, not a forecast.', 'A rough guide, taken from delta, to how likely the option is to have value at expiry. It is not a forecast.', '|Δ| as a rough probability ITM.', '|Δ| proxy for P(ITM).'),
  gamma: E('Gamma', 'Greeks', 'How fast delta changes as the stock moves.', 'How fast delta changes as the stock moves.', 'Change in delta per $1 move.', '∂²V/∂S².'),
  theta: E('Theta', 'Greeks', 'How much value the option loses each day.', 'How much value the option tends to lose each day as time passes.', 'Daily time decay, $ per day.', '∂V/∂t per calendar day.'),
  vega: E('Vega', 'Greeks', 'How much the price changes when IV moves.', 'How much the option price tends to change when implied volatility moves.', '$ change per 1 point of IV.', '∂V/∂σ per vol point.'),
  greeks: E('Greeks', 'Greeks', 'Delta, gamma, theta and vega: how value changes.', 'Measures of how an option’s value tends to change with price, time and volatility.', 'Net Δ, Γ, Θ, V across all legs.', 'Signed Σ legs × qty × 100.'),
  volume: E('Volume', 'Research', 'How many contracts or shares traded today.', 'How many contracts or shares have traded today.', 'Today’s traded quantity. Compare to the average.', 'Session volume vs 30d ADV.', 'Busy days often come with news or bigger moves.'),
  oi: E('Open interest', 'Research', 'How many contracts are still open.', 'How many contracts are still open (not yet closed).', 'Outstanding contracts. High OI = more liquidity.', 'OI by strike shows positioning.'),
  range52w: E('52-week high / low', 'Research', 'The highest and lowest prices in the past year.', 'The highest and lowest prices in the past year. The bar shows where today’s price sits between them.', '1-year range and where spot sits in it.', '52w hi/lo, position %.'),
  dayRange: E('Day range', 'Research', 'The lowest and highest prices so far today.', 'The lowest and highest prices so far today.', 'Today’s low and high.', 'Session H/L.'),
  earnings: E('Earnings date', 'Research', 'When the company reports results. Prices can jump.', 'The day a company reports its results. Prices can move a lot around it.', 'Scheduled report. IV usually rises into it and drops after.', 'Event vol; IV crush post-print.'),
  sentiment: E('Sentiment', 'Research', 'A sample of what analysts and the community think.', 'A sample of what analysts and other traders think. It is opinion, not a forecast.', 'Sample analyst split, targets and community votes.', 'Sample consensus data.'),
  news: E('News', 'Research', 'Sample headlines from a fictional outlet.', 'Headlines that could explain why a stock is moving. Here they are templated samples.', 'Headline feed. Sample data here.', 'Sample wire.'),
  social: E('Social', 'Research', 'Sample posts from fictional accounts.', 'Posts from other traders. Here they are samples from made-up accounts.', 'Community chatter. Sample data.', 'Sample social feed.'),
  sampleData: E('Sample data', 'This app', 'Made-up content so you can see how the widget works.', 'This widget shows made-up sample content so you can see how it works. It is not real market information.', 'Templated, simulated content. Not real.', 'Synthetic. No real sources.', 'Real news, ratings and posts need licensed data feeds.'),
  chart: E('Price chart', 'Research', 'Past prices drawn as candles.', 'Past prices drawn as candles. Green candles closed higher than they opened, red lower.', 'OHLC candles with range presets.', 'Candles, simulated history.'),
  watchlist: E('Watchlist', 'Research', 'Symbols you follow, with live prices.', 'A short list of symbols you follow. Click one to switch your dashboard to it.', 'Symbols and last price. Click to link.', 'Click to set the link group symbol.'),
  chain: E('Options chain', 'Research', 'Every call and put for one expiry, with prices.', 'A table of every call and put for one expiry, with what each costs. Drag a row to build a trade.', 'Strikes × calls/puts for an expiry. Click bid/ask to add legs.', 'Chain. Bid → sell leg, ask → buy leg. Drag rows to a block.'),
  depth: E('Market depth', 'Research', 'Bids and offers waiting at each price.', 'Orders waiting to buy and sell at each price near the current price.', 'Level 2 book. Simulated.', 'L2, simulated.'),
  timesales: E('Time & Sales', 'Research', 'A live tape of trades as they happen.', 'A list of trades as they happen. Green traded at the ask (buyers), red at the bid (sellers).', 'Prints tape, tinted by aggressor side.', 'Tape. Watch for size prints.'),
  linkedTicker: E('Linked ticker', 'This app', 'Change it once and every linked widget follows.', 'All research widgets share one symbol. Change it in any widget and the others follow.', 'Link group. Unlink a widget to pin its own symbol.', 'Link group = canvas.'),
  strategy: E('Strategy Block', 'This app', 'Drop contracts here to build one trade.', 'Drop contracts here to build one trade. It names the strategy, draws what you could make or lose, and holds the order.', 'Composite: legs, payoff, ticket.', 'Legs + payoff + ticket.'),
  strategyName: E('Strategy name', 'Strategies', 'Named automatically from the legs you add.', 'The block looks at your legs and names the strategy for you.', 'Auto-recognised from legs.', 'Recognition from legs.'),
  bullCall: E('Bull Call Spread', 'Strategies', 'Buy a call, sell a higher call.', 'Buy a call, sell a higher call. You gain if the stock rises, with limited risk and limited reward.', 'Debit vertical: +C(K1) −C(K2).', 'Bullish debit vertical.'),
  bearPut: E('Bear Put Spread', 'Strategies', 'Buy a put, sell a lower put.', 'Buy a put, sell a lower put. You gain if the stock falls, with limited risk and limited reward.', 'Debit vertical: +P(K2) −P(K1).', 'Bearish debit vertical.'),
  bullPut: E('Bull Put Spread', 'Strategies', 'Sell a put, buy a lower put.', 'Sell a put, buy a lower put. You get paid up front and profit if the stock stays above the sold strike.', 'Credit vertical below spot.', 'Short put vertical.'),
  bearCall: E('Bear Call Spread', 'Strategies', 'Sell a call, buy a higher call.', 'Sell a call, buy a higher call. You get paid up front and profit if the stock stays below the sold strike.', 'Credit vertical above spot.', 'Short call vertical.'),
  straddle: E('Straddle', 'Strategies', 'A call and a put at the same strike.', 'Buy (or sell) a call and a put at the same strike. It bets on a big move (or a quiet stock if sold).', 'Same-strike call + put. Long = long vol.', 'ATM straddle ≈ expected move.'),
  strangle: E('Strangle', 'Strategies', 'Like a straddle, with different strikes.', 'Like a straddle, but with different strikes for the call and the put.', 'OTM call + OTM put.', 'OTM call + put.'),
  ironCondor: E('Iron Condor', 'Strategies', 'A put spread and a call spread together.', 'A put spread and a call spread together. It earns if the stock stays in a range.', 'Short put vertical + short call vertical. Range-bound credit.', 'Short IC: −Γ, +Θ, −V.'),
  calendar: E('Calendar Spread', 'Strategies', 'Same strike, different expiries.', 'Options at the same strike but different expiries.', 'Sell near, buy far, same strike.', 'Long calendar: +V, +Θ near strike.'),
  skew: E('Skew', 'Research', 'How IV changes across strikes.', 'How implied volatility changes from strike to strike.', 'Put IV usually above call IV.', 'Vol skew and term structure.'),
  pcr: E('Put/call ratio', 'Research', 'Puts traded divided by calls traded.', 'How many puts traded compared with calls.', 'Put volume / call volume.', 'PCR.'),
  undefinedRisk: E('Undefined risk', 'Strategies', 'A loss with no fixed limit.', 'A trade where the most you could lose has no fixed limit, like selling a call without buying one above it.', 'Naked short legs. Blocked below Pro.', 'Uncovered short exposure.', 'Blocking these keeps practice trades within a known loss.'),
  locked: E('Locked strategy', 'This app', 'Not available at your practice level.', 'This strategy isn’t available at your level. You can switch level in practice mode.', 'Requires a higher simulated level.', 'Gated by level.'),
  limit: E('Limit order', 'Orders', 'Fills only at your price or better.', 'An order that only fills at your price or better.', 'Max you pay / min you receive.', 'Limit. Multi-leg = limit only.'),
  limitPrice: E('Limit price', 'Orders', 'The price you are willing to trade the whole spread at.', 'The price you are willing to trade the whole trade at. It starts at mid. Use ± to nudge by a cent.', 'Net price for the whole spread. ±0.01 nudges.', 'Net limit, tick 0.01.'),
  midNatural: E('Mid / Natural', 'Orders', 'Start the limit at mid, or at the natural price.', 'Mid is halfway between bid and ask. Natural trades right away but costs more.', 'Prefill at mid or natural.', 'Prefill mode.'),
  tif: E('Time in force', 'Orders', 'How long an order stays open.', 'How long an order stays open. Day ends today, GTC stays until you cancel.', 'Day or Good-til-cancelled.', 'DAY / GTC.'),
  buyingPower: E('Buying power', 'Orders', 'How much you can use to open trades.', 'How much you can use to open trades in this account. A spread uses up to its max loss.', 'Capital used: debit paid, or width − credit for credit spreads.', 'Defined-risk BP = max loss.'),
  fees: E('Estimated fees', 'Orders', 'Per-contract fees. An assumption in this prototype.', 'What the trade costs in fees: an assumed $0.55 per contract per leg. Not a real Aries rate.', '$0.55 × contracts × legs (assumption).', 'Assumed per-contract fee.'),
  marketOrder: E('Market order', 'Orders', 'Fills now at whatever price is available.', 'An order that fills now at whatever price is available. Multi-leg orders here use limit prices instead.', 'Disabled for multi-leg.', 'Multi-leg market disabled.'),
  requote: E('Re-Quote', 'Orders', 'Prices moved. Refresh before sending.', 'Prices moved since you set your price. Refresh it before sending, so nothing fills at an old price.', 'Net moved >1.5% from your quote.', 'Stale-quote protection.'),
  simulated: E('Practice mode / Simulated', 'This app', 'Nothing here is real. Prices and orders are simulated.', 'Nothing here is real. Prices and orders are simulated.', 'Simulated fills. No routing.', 'No real orders.'),
  assignment: E('Assignment', 'Basics', 'When the buyer of an option you sold uses it.', 'When someone who bought the option you sold uses it, and you must deliver the shares or cash. It is a real risk of selling options.', 'Short options can be exercised against you.', 'Early assignment risk on short ITM legs.'),
  commandBar: E('Command Bar', 'This app', 'Type a trade as a sentence. ⌘K.', 'Press ⌘K and type a trade in plain words. It builds the trade on the canvas for you to check. Nothing is sent until you confirm.', '⌘K: sentence → proposed block → confirm.', '⌘K. Deterministic parser, confirm required.'),
  understood: E('"I understood"', 'This app', 'How the Command Bar read your sentence.', 'This is how the Command Bar read your sentence. Check it before you confirm.', 'Parsed interpretation.', 'Parsed intent restated.'),
  confirm: E('Confirm', 'This app', 'Sends the proposed trade as a practice order.', 'Confirm sends the proposed trade as a practice order. Nothing is ever sent without it.', 'Explicit send. Never automatic.', 'Explicit confirm.'),
  clarify: E('Clarification', 'This app', 'Something was missing, so it asks instead of guessing.', 'Something was missing or unclear, so it asks you instead of guessing.', 'Missing field chips.', 'Ambiguity → chips.'),
  explain: E('Explain mode', 'This app', 'Makes every ⓘ easy to spot.', 'When on, every ⓘ has a small dot and tips appear right away.', 'Highlights info icons.', 'Info highlights.'),
  whyAsk: E('Why we ask', 'This app', 'Your answers build your dashboard.', 'We use this to build your dashboard. You can change it anytime.', 'Answers → dashboard layout.', 'Answers → layout.'),
  tidy: E('Tidy up', 'This app', 'Arranges your widgets into the suggested layout.', 'Arranges your widgets: research on the left, prices in the middle, your trade on the right.', 'Research → Premiums → Trade zones.', 'Auto-layout.'),
  level: E('Experience level', 'This app', 'Changes words, widgets and strategies. Practice only.', 'Your level changes how things are explained, which widgets you start with and which strategies are unlocked. It is practice only.', 'Simulated level. Gates strategies.', 'Simulated approval tier.'),
  listClassic: E('List / Classic', 'This app', 'One column of contracts, or calls and puts side by side.', 'List shows one column of contracts. Classic shows calls on the left and puts on the right of each strike.', 'List vs straddle view.', 'Single vs straddle layout.'),
  callsPuts: E('Calls / Puts', 'Basics', 'Show calls, puts, or both.', 'Choose whether the list shows calls (the right to buy) or puts (the right to sell).', 'Filter by type.', 'Type filter.'),
  ivCol: E('IV column', 'Prices', 'Implied volatility for each contract.', 'Implied volatility for each contract. Higher usually means pricier.', 'Per-contract IV.', 'σ per strike.'),
}

export function entry(term: string): GlossaryEntry {
  const e = GLOSSARY[term]
  if (!e) {
    console.warn('[glossary] missing term', term)
    return E(term, 'Basics', term, term, term, term)
  }
  return e
}

export function textFor(term: string, level: Level): string {
  const e = entry(term)
  return level === 'explorer' ? e.explorer : level === 'trader' ? e.trader : e.pro
}

export const GROUP_ORDER: GlossaryGroup[] = ['Basics', 'Prices', 'Greeks', 'Orders', 'Strategies', 'Research', 'This app']
