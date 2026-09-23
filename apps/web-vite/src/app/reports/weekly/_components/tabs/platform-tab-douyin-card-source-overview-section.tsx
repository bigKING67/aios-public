import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  DouyinCardSourceAttributionOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import type { DouyinCardSourceRow } from './platform-tab-types';

export type {
  DouyinCardSourceAttributionOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';

export function DouyinCardSourceAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: DouyinCardSourceAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<DouyinCardSourceRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无商品卡来源渠道数据"
      waterfallEmptyDescription="暂无来源渠道增量瀑布数据"
    />
  );
}
