import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { buildOverviewTrendChartData } from './overview-trend-data';
import type {
  OverviewTrendSectionPropsBundle,
} from './overview-trend-section-contracts';

export const OVERVIEW_TREND_CHART_COLORS = [
  'var(--chart-series-3)',
  'var(--chart-color-prev-week)',
] as const;

export function buildOverviewTrendSectionProps(
  report: WeeklyReportResponse
): OverviewTrendSectionPropsBundle {
  const chartData = buildOverviewTrendChartData(report);

  return {
    lineChartProps: chartData
      ? {
        data: chartData,
        height: 320,
        colors: [...OVERVIEW_TREND_CHART_COLORS],
        showDataLabel: true,
      }
      : null,
  };
}
