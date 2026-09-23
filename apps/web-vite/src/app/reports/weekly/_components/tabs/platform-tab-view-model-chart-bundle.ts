import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import {
  resolvePlatformAttributionSources,
  type PlatformAttributionSources,
} from './platform-tab-chart-sources';
import {
  buildPlatformTrendChartData,
  type PlatformTrendChartData,
  type PlatformTrendItem,
} from './platform-tab-metrics';
import type { TrendMetricDefinition } from './platform-tab-types';

interface ResolvePlatformTabChartBundleParams {
  report: WeeklyReportResponse;
  platformAliases: string[];
  trend7d: PlatformTrendItem[];
  metricDefinitions: TrendMetricDefinition[];
}

export interface PlatformTabChartBundle {
  attributionSources: PlatformAttributionSources;
  chartData: PlatformTrendChartData;
  hasChartData: boolean;
}

export function resolvePlatformTabChartBundle({
  report,
  platformAliases,
  trend7d,
  metricDefinitions,
}: ResolvePlatformTabChartBundleParams): PlatformTabChartBundle {
  const attributionSources = resolvePlatformAttributionSources(report, platformAliases);
  const chartData = buildPlatformTrendChartData(trend7d, metricDefinitions, platformAliases);
  const hasChartData = chartData.series.length > 0 && chartData.xAxis.length > 0;

  return {
    attributionSources,
    chartData,
    hasChartData,
  };
}
