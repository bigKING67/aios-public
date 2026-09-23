import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  TmallGoodsAttributionOverviewSectionProps,
} from './platform-tab-tmall-leaf-contracts';
import type { GoodsTableRow } from './platform-tab-types';

export type {
  TmallGoodsAttributionOverviewSectionProps,
} from './platform-tab-tmall-leaf-contracts';

export function TmallGoodsAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: TmallGoodsAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<GoodsTableRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无商品归因数据"
      waterfallEmptyDescription="暂无商品增量瀑布数据"
    />
  );
}
