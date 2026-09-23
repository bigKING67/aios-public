import { DouyinCardSourceFunnelOverviewSection } from './platform-tab-douyin-card-source-funnel-overview-section';
import type {
  DouyinCardSourceFunnelSectionProps,
} from './platform-tab-douyin-card-leaf-contracts';
import { DouyinCardSourceQuantSection } from './platform-tab-douyin-card-source-quant-section';
import {
  WeeklyBlock,
  WeeklyEmptyState,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinCardSourceFunnelSection({
  selectedSourceLevelText,
  overviewSectionProps,
  quantSectionProps,
}: DouyinCardSourceFunnelSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`GMV波动归因 · 商品 · 流量渠道 · ${selectedSourceLevelText}`}
        description="漏斗口径：GMV = 商品卡曝光人数 × 点击率 × 点击成交率。"
      />
      {overviewSectionProps && quantSectionProps ? (
        <>
          <DouyinCardSourceFunnelOverviewSection
            {...overviewSectionProps}
          />

          <DouyinCardSourceQuantSection
            {...quantSectionProps}
          />
        </>
      ) : (
        <WeeklyEmptyState description="暂无可分析来源渠道" />
      )}
    </WeeklyBlock>
  );
}
