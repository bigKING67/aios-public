import { DonutChart } from '@/components/organisms/donut-chart';
import { WaterfallChart } from '@/components/organisms/waterfall-chart';
import type {
  OverviewPlatformBreakdownSectionPropsBundle,
} from './overview-platform-breakdown-section-contracts';
import {
  WeeklyBlock,
  WeeklyChartFrame,
  WeeklyChartGrid,
  WeeklyInlineSummary,
  WeeklySectionHeader,
} from './weekly-primitives';

export function OverviewPlatformBreakdownSection({
  donutChartProps,
  waterfallChartProps,
  summaryText,
}: OverviewPlatformBreakdownSectionPropsBundle) {
  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="GMV 平台贡献与增量拆解"
        description="口径：平台贡献看本周同期占比；瀑布仅展示平台增量（本周同期 - 上周同期），增量贡献 = 平台增量 / 总增量。"
      />

      <WeeklyChartGrid>
        <WeeklyChartFrame>
          <DonutChart
            {...donutChartProps}
          />
        </WeeklyChartFrame>
        <WeeklyChartFrame>
          <WaterfallChart
            {...waterfallChartProps}
          />
        </WeeklyChartFrame>
      </WeeklyChartGrid>

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </WeeklyBlock>
  );
}
