import { LineChart } from '@/components/organisms/line-chart';
import type {
  OverviewTrendSectionPropsBundle,
} from './overview-trend-section-contracts';
import {
  WeeklyBlock,
  WeeklyChartFrame,
  WeeklySectionHeader,
} from './weekly-primitives';

export function OverviewTrendSection({
  lineChartProps,
}: OverviewTrendSectionPropsBundle) {
  if (!lineChartProps) {
    return null;
  }

  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="周趋势"
        description="对比本周与上周同期走势，定位波峰与回落区间。"
      />
      <WeeklyChartFrame variant="singleFrame">
        <LineChart
          {...lineChartProps}
        />
      </WeeklyChartFrame>
    </WeeklyBlock>
  );
}
