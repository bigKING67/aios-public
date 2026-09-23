import { DonutChart } from '@/components/organisms/donut-chart';
import { WaterfallChart } from '@/components/organisms/waterfall-chart';
import type {
  DouyinChannelAttributionSectionProps,
} from './platform-tab-douyin-channel-leaf-contracts';
import {
  WeeklyAttributionGrid,
  WeeklyBlock,
  WeeklyChartFrame,
  WeeklyEmptyState,
  WeeklyInlineSummary,
  WeeklySectionHeader,
  WeeklyWaterfallChartFrame,
} from './weekly-primitives';

export function DouyinChannelAttributionSection(
  {
    donutChartProps,
    waterfallChartProps,
    summaryText,
  }: DouyinChannelAttributionSectionProps,
) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        spacing="relaxed"
        title="GMV波动归因 · 渠道定位"
        description="按渠道拆解抖音 GMV 增量贡献，定位拉动与拖累渠道。"
      />

      <WeeklyAttributionGrid>
        <WeeklyChartFrame variant="douyinChannelDonut">
          {donutChartProps ? (
            <DonutChart
              {...donutChartProps}
            />
          ) : (
            <WeeklyEmptyState description="暂无抖音渠道结构数据" />
          )}
        </WeeklyChartFrame>

        <WeeklyWaterfallChartFrame>
          {waterfallChartProps ? (
            <WaterfallChart
              {...waterfallChartProps}
            />
          ) : (
            <WeeklyEmptyState description="暂无抖音渠道增量贡献数据" />
          )}
        </WeeklyWaterfallChartFrame>
      </WeeklyAttributionGrid>

      <WeeklyInlineSummary>{summaryText}</WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
