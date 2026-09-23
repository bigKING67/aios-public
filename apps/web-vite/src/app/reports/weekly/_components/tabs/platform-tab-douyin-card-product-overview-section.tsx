import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  DouyinCardProductAttributionOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import type { DouyinCardProductRow } from './platform-tab-types';

export type {
  DouyinCardProductAttributionOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';

export function DouyinCardProductAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: DouyinCardProductAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<DouyinCardProductRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无商品卡商品归因数据"
      waterfallEmptyDescription="暂无商品卡商品增量瀑布数据"
    />
  );
}
