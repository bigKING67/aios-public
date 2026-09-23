import { mapChannelAttributionItem } from './platform-tab-row-mappers';
import { buildChannelWaterfall } from './platform-tab-waterfall-helpers';
import type { ChannelAttributionRow } from './platform-tab-types';
import type { ChannelAttributionSource } from './platform-tab-tmall-source-types';

type TmallChannelAttributionDataParams = {
  platformGoodsChannelAttribution?: ChannelAttributionSource;
  locatedProductIds: Set<string>;
  resolveCategoryWaterfallColor: (index: number) => string;
};

export function buildTmallChannelAttributionData({
  platformGoodsChannelAttribution,
  locatedProductIds,
  resolveCategoryWaterfallColor,
}: TmallChannelAttributionDataParams) {
  const channelItemsRaw = Array.isArray(platformGoodsChannelAttribution?.items)
    ? platformGoodsChannelAttribution.items
    : [];
  const channelRows: ChannelAttributionRow[] = channelItemsRaw
    .map(mapChannelAttributionItem)
    .filter((item) => locatedProductIds.size === 0 || locatedProductIds.has(item.productId))
    .filter(
      (item) =>
        Math.abs(item.payAmount) > Number.EPSILON ||
        Math.abs(item.prevPayAmount) > Number.EPSILON ||
        Math.abs(item.payAmountDelta) > Number.EPSILON
    )
    .sort((left, right) => right.payAmount - left.payAmount);

  const channelTableRows = channelRows.slice(0, 80);
  const { waterfallSteps: channelWaterfallSteps } = buildChannelWaterfall(
    channelRows,
    resolveCategoryWaterfallColor
  );

  return {
    channelRows,
    channelTableRows,
    channelWaterfallSteps,
  };
}
