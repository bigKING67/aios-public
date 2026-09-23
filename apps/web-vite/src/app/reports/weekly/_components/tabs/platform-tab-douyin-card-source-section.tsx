import {
  DouyinCardSourceAttributionOverviewSection,
} from './platform-tab-douyin-card-source-overview-section';
import type {
  DouyinCardSourceAttributionSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinCardSourceAttributionSection(
  {
    sourceDescription,
    overviewSectionProps,
    summaryText,
  }: DouyinCardSourceAttributionSectionProps,
) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 商品 · 流量渠道定位"
        description={sourceDescription}
      />

      <DouyinCardSourceAttributionOverviewSection
        {...overviewSectionProps}
      />

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
