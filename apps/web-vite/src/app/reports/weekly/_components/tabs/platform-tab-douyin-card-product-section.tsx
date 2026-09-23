import {
  DouyinCardProductAttributionOverviewSection,
} from './platform-tab-douyin-card-product-overview-section';
import type {
  DouyinCardProductAttributionSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinCardProductAttributionSection(
  {
    overviewSectionProps,
    summaryText,
  }: DouyinCardProductAttributionSectionProps,
) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 商品卡 · 商品定位"
        description="按商品卡商品拆解 GMV 增量贡献，定位拉动与拖累商品。"
      />

      <DouyinCardProductAttributionOverviewSection
        {...overviewSectionProps}
      />

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
