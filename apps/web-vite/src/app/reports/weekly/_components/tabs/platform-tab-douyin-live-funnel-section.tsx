import { DouyinLiveFunnelOverviewSection } from './platform-tab-douyin-live-funnel-overview-section';
import type {
  DouyinLiveFunnelAttributionSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';
import { DouyinLiveQuantSection } from './platform-tab-douyin-live-quant-section';
import {
  WeeklyBlock,
  WeeklyEmptyState,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinLiveFunnelAttributionSection({
  selectedAnchorNickname,
  overviewSectionProps,
  quantSectionProps,
}: DouyinLiveFunnelAttributionSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`GMV波动归因 · 直播 · ${selectedAnchorNickname} · 直播分析`}
        description="五维四率漏斗：直播间曝光人数 × 看播率 × 商品曝光率 × 商品点击率 × 商品点击成交转化率。"
      />

      {overviewSectionProps && quantSectionProps ? (
        <>
          <DouyinLiveFunnelOverviewSection
            {...overviewSectionProps}
          />

          <DouyinLiveQuantSection
            {...quantSectionProps}
          />
        </>
      ) : (
        <WeeklyEmptyState description="暂无可分析直播场次" />
      )}
    </WeeklyBlock>
  );
}
