import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  DouyinLiveSessionAttributionOverviewSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';
import type { DouyinLiveSessionRow } from './platform-tab-types';

export type {
  DouyinLiveSessionAttributionOverviewSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';

export function DouyinLiveSessionAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: DouyinLiveSessionAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<DouyinLiveSessionRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无直播场次归因数据"
      waterfallEmptyDescription="暂无直播场次增量瀑布数据"
    />
  );
}
