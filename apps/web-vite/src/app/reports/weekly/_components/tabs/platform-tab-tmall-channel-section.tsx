import { TmallChannelAttributionOverviewSection } from './platform-tab-tmall-channel-overview-section';
import type {
  TmallChannelAttributionSectionProps,
} from './platform-tab-tmall-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function TmallChannelAttributionSection({
  overviewSectionProps,
  summaryText,
}: TmallChannelAttributionSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 商品 · 流量渠道定位"
        description="基于已定位商品，继续拆解流量渠道，识别渠道拉动与拖累。"
      />

      <TmallChannelAttributionOverviewSection {...overviewSectionProps} />

      <WeeklyInlineSummary>{summaryText}</WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
