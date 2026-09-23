import {
  WeeklyBlock,
  WeeklyEmptyState,
  WeeklySectionHeader,
} from './weekly-primitives';

export function DouyinEmptyAttributionSection() {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV波动归因 · 渠道定位"
        description="当前周期暂无可归因的直播/短视频/商品卡增量贡献。"
      />
      <WeeklyEmptyState description="暂无可展示的抖音归因明细" />
    </WeeklyBlock>
  );
}
