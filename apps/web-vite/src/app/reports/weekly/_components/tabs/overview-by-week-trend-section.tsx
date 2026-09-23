'use client';

import { BarChart } from '@/components/organisms/bar-chart';
import type {
  OverviewByWeekTrendSectionProps,
} from './overview-by-week-trend-section-contracts';
import { useOverviewByWeekTrendSectionProps } from './use-overview-by-week-trend-section-props';
import {
  WeeklyBlock,
  WeeklyChartFrame,
  WeeklySectionHeader,
  WeeklyTextEmptyState,
} from './weekly-primitives';

export function OverviewByWeekTrendSection({
  summaryWeekPeriod,
}: OverviewByWeekTrendSectionProps) {
  const {
    barChartProps,
    emptyStateDescription,
  } = useOverviewByWeekTrendSectionProps({
    summaryWeekPeriod,
  });

  return (
    <WeeklyBlock>
      <WeeklySectionHeader
        title="by周趋势"
        description="近5周对比：横轴为周区间，单轴金额对比 GMV 与 GSV。"
      />
      <WeeklyChartFrame variant="singleFrame">
        {barChartProps ? (
          <BarChart
            {...barChartProps}
          />
        ) : (
          <WeeklyTextEmptyState description={emptyStateDescription ?? ''} />
        )}
      </WeeklyChartFrame>
    </WeeklyBlock>
  );
}
