import { FunnelOverviewFrame } from './platform-tab-funnel-overview-frame';
import type {
  TmallFunnelChannelOverviewSectionProps,
} from './platform-tab-tmall-funnel-leaf-contracts';
import type {
  FunnelChannelRow,
} from './platform-tab-types';

export type {
  TmallFunnelChannelOverviewSectionProps,
} from './platform-tab-tmall-funnel-leaf-contracts';

export function TmallFunnelChannelOverviewSection({
  funnelData,
  tableProps,
}: TmallFunnelChannelOverviewSectionProps) {
  return (
    <FunnelOverviewFrame<FunnelChannelRow>
      badge="流量行为流转路径"
      funnelData={funnelData}
      tableProps={tableProps}
    />
  );
}
