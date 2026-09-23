import { TmallGoodsAttributionOverviewSection } from './platform-tab-tmall-goods-overview-section';
import type {
  TmallGoodsAttributionSectionProps,
} from './platform-tab-tmall-leaf-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function TmallGoodsAttributionSection({
  overviewSectionProps,
  summaryText,
}: TmallGoodsAttributionSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 商品定位"
        description="按商品拆解天猫 GMV 增量贡献，定位拉动与拖累单品。"
      />

      <TmallGoodsAttributionOverviewSection {...overviewSectionProps} />

      <WeeklyInlineSummary>{summaryText}</WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
