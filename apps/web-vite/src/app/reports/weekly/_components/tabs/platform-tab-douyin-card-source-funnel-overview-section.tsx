import { FunnelOverviewFrame } from './platform-tab-funnel-overview-frame';
import type {
  DouyinCardSourceFunnelOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import type { DouyinMetricDetailRow } from './platform-tab-types';

export type {
  DouyinCardSourceFunnelOverviewSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';

export function DouyinCardSourceFunnelOverviewSection({
  funnelData,
  tableProps,
}: DouyinCardSourceFunnelOverviewSectionProps) {
  return (
    <FunnelOverviewFrame<DouyinMetricDetailRow>
      badge="来源渠道漏斗"
      funnelData={funnelData}
      tableProps={tableProps}
    />
  );
}
