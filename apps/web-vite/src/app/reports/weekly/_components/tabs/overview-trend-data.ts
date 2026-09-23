import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import {
  formatWeeklyTrendData,
  type FormattedChartData,
  type TrendPoint,
} from '@/lib/chart-utils';

type OverviewTrendItem = WeeklyReportResponse['charts']['trend_7d'][number];

export interface OverviewTrendSeries {
  currentPoints: TrendPoint[];
  previousPoints?: TrendPoint[];
}

function isTrendPointList(value: unknown): value is TrendPoint[] {
  return Array.isArray(value);
}

function resolveTrendPoints(trend?: OverviewTrendItem): TrendPoint[] | undefined {
  return isTrendPointList(trend?.points) ? trend.points : undefined;
}

export function resolveOverviewTrendSeries(
  report: WeeklyReportResponse
): OverviewTrendSeries | null {
  const trendData = Array.isArray(report.charts?.trend_7d)
    ? report.charts.trend_7d
    : [];
  const gmvTrend = trendData.find((trend) => trend.metric === 'gmv');
  const currentPoints = resolveTrendPoints(gmvTrend);

  if (!currentPoints) {
    return null;
  }

  const gmvPrevWeek = trendData.find(
    (trend) => trend.metric === 'gmv_prev_week'
  );

  return {
    currentPoints,
    previousPoints: resolveTrendPoints(gmvPrevWeek),
  };
}

export function buildOverviewTrendChartData(
  report: WeeklyReportResponse
): FormattedChartData | null {
  const trendSeries = resolveOverviewTrendSeries(report);

  if (!trendSeries) {
    return null;
  }

  return formatWeeklyTrendData(
    trendSeries.currentPoints,
    trendSeries.previousPoints,
    report.meta?.period_start
  );
}
