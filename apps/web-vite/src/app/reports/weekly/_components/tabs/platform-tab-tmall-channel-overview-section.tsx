import { AttributionOverviewFrame } from './platform-tab-attribution-overview-frame';
import type {
  TmallChannelAttributionOverviewSectionProps,
} from './platform-tab-tmall-leaf-contracts';
import type { ChannelAttributionRow } from './platform-tab-types';

export type {
  TmallChannelAttributionOverviewSectionProps,
} from './platform-tab-tmall-leaf-contracts';

export function TmallChannelAttributionOverviewSection({
  tableProps,
  waterfallChartProps,
}: TmallChannelAttributionOverviewSectionProps) {
  return (
    <AttributionOverviewFrame<ChannelAttributionRow>
      tableProps={tableProps}
      waterfallChartProps={waterfallChartProps}
      tableEmptyDescription="暂无商品流量渠道归因数据"
      waterfallEmptyDescription="暂无商品流量渠道增量瀑布数据"
    />
  );
}
