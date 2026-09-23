import { TmallFunnelChannelOverviewSection } from './platform-tab-tmall-funnel-channel-overview-section';
import { TmallFunnelChannelQuantSection } from './platform-tab-tmall-funnel-channel-quant-section';
import type {
  TmallFunnelChannelSectionProps,
} from './platform-tab-tmall-funnel-channel-section-contracts';
import {
  WeeklyBlock,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function TmallFunnelChannelSection({
  channelTitleText,
  overviewSectionProps,
  summaryText,
  quantSectionProps,
}: TmallFunnelChannelSectionProps) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title={`GMV波动归因 · 商品 · 流量渠道 · ${channelTitleText}`}
        description="仅对该渠道做漏斗拆解，定位关键损耗节点。关键词/人群/场景使用“曝光→点击→加购→支付”，搜索/推荐使用“访客→加购→支付”。"
      />

      <TmallFunnelChannelOverviewSection
        {...overviewSectionProps}
      />

      <WeeklyInlineSummary>{summaryText}</WeeklyInlineSummary>

      <TmallFunnelChannelQuantSection
        {...quantSectionProps}
      />
    </WeeklyBlock>
  );
}
