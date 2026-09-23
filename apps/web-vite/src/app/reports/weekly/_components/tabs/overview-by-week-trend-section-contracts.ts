import type { BarChartProps } from '@/components/organisms/bar-chart';
import type { OverviewByWeekTrendDataResult } from './use-overview-by-week-trend-data';

export interface OverviewByWeekTrendSectionProps {
  summaryWeekPeriod?: string;
}

export type BuildOverviewByWeekTrendSectionPropsParams = OverviewByWeekTrendDataResult;

export interface OverviewByWeekTrendSectionPropsBundle {
  barChartProps: BarChartProps | null;
  emptyStateDescription: string | null;
}
