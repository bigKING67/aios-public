import { TmallFunnelChannelSection } from './platform-tab-tmall-funnel-channel-section';
import type {
  TmallFunnelDiagnosisSectionsProps,
} from './platform-tab-tmall-funnel-section-list-contracts';
import {
  WeeklyBlock,
  WeeklyEmptyState,
  WeeklySectionHeader,
} from './weekly-primitives';

export function TmallFunnelDiagnosisSections({
  channelSectionPropsList,
  showEmptyFunnelSection,
}: TmallFunnelDiagnosisSectionsProps) {
  if (showEmptyFunnelSection) {
    return (
      <WeeklyBlock>
        <WeeklySectionHeader
          title="GMV波动归因 · 商品 · 流量渠道 · 渠道诊断"
          description="仅对渠道 GMV 增量贡献高于商品整体环比涨幅的渠道做漏斗拆解，定位关键损耗节点。"
        />
        <WeeklyEmptyState description="暂无流量漏斗拆解数据" />
      </WeeklyBlock>
    );
  }

  return (
    <>
      {channelSectionPropsList.map((channelSectionProps) => (
        <TmallFunnelChannelSection
          key={channelSectionProps.channelKey}
          {...channelSectionProps}
        />
      ))}
    </>
  );
}
