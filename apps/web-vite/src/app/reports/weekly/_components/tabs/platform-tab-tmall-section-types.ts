import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type {
  ChannelAttributionRow,
  FunnelChannelSection,
  GoodsTableRow,
  QuantAttributionRow,
} from './platform-tab-types';

export interface TmallAttributionTotals {
  attributionTotalGmv: number;
  attributionTotalPrevGmv: number;
  attributionDelta: number;
  channelAttributionTotalPayAmount: number;
  channelAttributionTotalPrevPayAmount: number;
  channelAttributionDelta: number;
}

export interface TmallPlatformSectionData {
  goodsTableRows: GoodsTableRow[];
  goodsWaterfallSteps: WaterfallStepItem[];
  channelTableRows: ChannelAttributionRow[];
  channelWaterfallSteps: WaterfallStepItem[];
  funnelChannelSections: FunnelChannelSection[];
  quantRows: QuantAttributionRow[];
  quantRowsByChannel: Map<string, QuantAttributionRow[]>;
  tmallAttributionTotals: TmallAttributionTotals;
}
