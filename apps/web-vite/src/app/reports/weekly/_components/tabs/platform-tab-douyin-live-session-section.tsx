import { DouyinLiveSessionAttributionOverviewSection } from './platform-tab-douyin-live-session-overview-section';
import type {
  DouyinLiveSessionAttributionSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinLiveSessionAttributionSection({
  overviewSectionProps,
  summaryText,
}: DouyinLiveSessionAttributionSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 直播 · 直播场次定位"
        description="按直播场次拆解 GMV 增量贡献，定位拉动与拖累最大的场次。"
      />
      <DouyinLiveSessionAttributionOverviewSection
        {...overviewSectionProps}
      />

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
