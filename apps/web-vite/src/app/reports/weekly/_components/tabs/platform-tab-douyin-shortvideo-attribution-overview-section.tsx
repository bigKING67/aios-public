import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  DouyinShortvideoAttributionOverviewSectionProps,
} from './platform-tab-douyin-shortvideo-leaf-contracts';
import type { DouyinShortvideoRow } from './platform-tab-types';

export type {
  DouyinShortvideoAttributionOverviewSectionProps,
} from './platform-tab-douyin-shortvideo-leaf-contracts';

export function DouyinShortvideoAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: DouyinShortvideoAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<DouyinShortvideoRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无短视频内容归因数据"
      waterfallEmptyDescription="暂无短视频增量瀑布数据"
    />
  );
}
