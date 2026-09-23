import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import { mapGoodsAttributionItem } from './platform-tab-row-mappers';
import { buildGoodsWaterfall } from './platform-tab-waterfall-helpers';
import type { GoodsTableRow } from './platform-tab-types';
import type { GoodsAttributionSource } from './platform-tab-tmall-source-types';

type TmallGoodsAttributionDataParams = {
  platformGoodsAttribution?: GoodsAttributionSource;
  resolveCategoryWaterfallColor: (index: number) => string;
};

export function buildTmallGoodsAttributionData({
  platformGoodsAttribution,
  resolveCategoryWaterfallColor,
}: TmallGoodsAttributionDataParams) {
  const goodsItemsRaw = Array.isArray(platformGoodsAttribution?.items)
    ? platformGoodsAttribution.items
    : [];
  const goodsItems: GoodsTableRow[] = goodsItemsRaw
    .map(mapGoodsAttributionItem)
    .sort((left, right) => right.gmv - left.gmv);

  const goodsTableRows = goodsItems.slice(0, 20);
  const {
    waterfallRows: goodsWaterfallRows,
    waterfallSteps: goodsWaterfallSteps,
  }: {
    waterfallRows: GoodsTableRow[];
    waterfallSteps: WaterfallStepItem[];
  } = buildGoodsWaterfall(goodsItems, resolveCategoryWaterfallColor);
  const locatedProductIds = new Set(goodsWaterfallRows.map((item) => item.productId).filter(Boolean));

  if (locatedProductIds.size === 0 && goodsTableRows[0]?.productId) {
    locatedProductIds.add(goodsTableRows[0].productId);
  }

  return {
    goodsItems,
    goodsTableRows,
    goodsWaterfallRows,
    goodsWaterfallSteps,
    locatedProductIds,
  };
}
