import type { DonutChartProps } from '@/components/organisms/donut-chart';
import type { WaterfallChartProps } from '@/components/organisms/waterfall-chart';
import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';

export type BuildOverviewPlatformBreakdownSectionPropsParams = Pick<
  WeeklyReportResponse,
  'charts'
>;

export interface OverviewPlatformBreakdownSectionPropsBundle {
  donutChartProps: DonutChartProps;
  waterfallChartProps: WaterfallChartProps;
  summaryText: string;
}
