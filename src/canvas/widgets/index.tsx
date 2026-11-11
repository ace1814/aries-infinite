import type { Sym } from '../../config'
import type { AriesWidgetShape } from '../WidgetShape'
import { ChainWidget } from './chain'
import { ChartWidget } from './chart'
import {
  Depth,
  GreeksPanel,
  IvRankWidget,
  KeyStats,
  NewsWidget,
  OiWidget,
  SentimentWidget,
  SocialWidget,
  TimeSales,
  VolumeWidget,
  Watchlist,
} from './research'
import { StrategyBlock } from './strategy'

export function WidgetBody({ shape, sym }: { shape: AriesWidgetShape; sym: Sym }) {
  switch (shape.props.kind) {
    case 'keystats':
      return <KeyStats sym={sym} />
    case 'volume':
      return <VolumeWidget sym={sym} />
    case 'sentiment':
      return <SentimentWidget sym={sym} />
    case 'news':
      return <NewsWidget sym={sym} />
    case 'social':
      return <SocialWidget sym={sym} />
    case 'ivrank':
      return <IvRankWidget sym={sym} />
    case 'oi':
      return <OiWidget sym={sym} />
    case 'chart':
      return <ChartWidget sym={sym} w={shape.props.w} h={shape.props.h} />
    case 'chain':
      return <ChainWidget shape={shape} sym={sym} />
    case 'watchlist':
      return <Watchlist />
    case 'depth':
      return <Depth sym={sym} />
    case 'timesales':
      return <TimeSales sym={sym} />
    case 'greeks':
      return <GreeksPanel />
    case 'strategy':
      return <StrategyBlock shape={shape} />
  }
}
