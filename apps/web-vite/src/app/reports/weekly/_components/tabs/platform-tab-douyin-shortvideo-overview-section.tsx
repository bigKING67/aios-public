import { DouyinShortvideoAttributionOverviewSection } from './platform-tab-douyin-shortvideo-attribution-overview-section';
import type {
  DouyinShortvideoOverviewSectionProps,
} from './platform-tab-douyin-shortvideo-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinShortvideoOverviewSection({
  overviewSectionProps,
  summaryText,
}: DouyinShortvideoOverviewSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 短视频 · 短视频内容定位"
        description="按短视频内容拆解 GMV 增量贡献，定位拉动与拖累的关键视频。"
      />
      <DouyinShortvideoAttributionOverviewSection
        {...overviewSectionProps}
      />

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
