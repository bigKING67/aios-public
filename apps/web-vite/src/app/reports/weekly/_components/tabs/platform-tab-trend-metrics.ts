import {
  findPlatformTrend,
  formatDateLabel,
  toSafeNumber,
} from './platform-tab-formatters';
import type { TrendMetricDefinition } from './platform-tab-types';
import type {
  PlatformChartSeries,
  PlatformTrendChartData,
  PlatformTrendItem,
} from './platform-tab-metric-types';

export function buildPlatformTrendChartData(
  trends: PlatformTrendItem[],
  metricDefinitions: TrendMetricDefinition[],
  platformAliases: string[]
): PlatformTrendChartData {
  const trendMetrics = metricDefinitions.map((metricDefinition) => ({
    ...metricDefinition,
    trend: findPlatformTrend(trends, metricDefinition.key, platformAliases),
  }));

  const availableTrends = trendMetrics
    .map((item) => item.trend)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => Array.isArray(item.points) && item.points.length > 0);
  const baseTrend = availableTrends.length
    ? availableTrends.reduce((previous, current) =>
      (current.points?.length ?? 0) > (previous.points?.length ?? 0) ? current : previous
    )
    : undefined;

  const baseDates = baseTrend?.points?.map((point) => point.date) ?? [];
  const xAxis = baseDates.map((date) => formatDateLabel(date));
  const series = trendMetrics
    .map((metric) => {
      if (!metric.trend?.points?.length) {
        return null;
      }

      const valueMap = new Map(
        metric.trend.points.map((point) => [point.date, toSafeNumber(point.value)])
      );
      return {
        name: metric.label,
        data: baseDates.map((date) => valueMap.get(date) ?? 0),
      };
    })
    .filter((item): item is PlatformChartSeries => Boolean(item));

  return {
    series,
    xAxis,
  };
}
