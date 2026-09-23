import { toOptionalNumber } from './platform-tab-formatters';
import type { ChannelAttributionRow } from './platform-tab-types';
import type { TmallAttributionTotals } from './platform-tab-tmall-section-types';

type AttributionTotalsSource = {
  total_gmv?: unknown;
  total_prev_gmv?: unknown;
};

type TmallAttributionTotalsParams = {
  channelRows: ChannelAttributionRow[];
  gmv: number;
  prevGmvSafe: number;
  platformGoodsAttribution?: AttributionTotalsSource;
};

export function resolveTmallAttributionTotals({
  channelRows,
  gmv,
  prevGmvSafe,
  platformGoodsAttribution,
}: TmallAttributionTotalsParams): TmallAttributionTotals {
  const attributionTotalGmv = toOptionalNumber(platformGoodsAttribution?.total_gmv) ?? gmv;
  const attributionTotalPrevGmv =
    toOptionalNumber(platformGoodsAttribution?.total_prev_gmv) ?? prevGmvSafe;
  const attributionDelta = attributionTotalGmv - attributionTotalPrevGmv;
  const channelAttributionTotalPayAmount = channelRows.reduce(
    (sum, item) => sum + item.payAmount,
    0
  );
  const channelAttributionTotalPrevPayAmount = channelRows.reduce(
    (sum, item) => sum + item.prevPayAmount,
    0
  );
  const channelAttributionDelta =
    channelAttributionTotalPayAmount - channelAttributionTotalPrevPayAmount;

  return {
    attributionTotalGmv,
    attributionTotalPrevGmv,
    attributionDelta,
    channelAttributionTotalPayAmount,
    channelAttributionTotalPrevPayAmount,
    channelAttributionDelta,
  };
}
