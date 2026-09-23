import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import {
  resolvePlatformTabChartBundle,
  resolvePlatformTabComputedBundle,
  type PlatformTabChartBundle,
  type PlatformTabComputedBundle,
} from './platform-tab-view-model-bundles';
import type { DouyinChannelColors } from './platform-tab-douyin-section-data';
import type { PlatformTrendItem } from './platform-tab-metrics';
import type { TrendMetricDefinition } from './platform-tab-types';

type PlatformData = WeeklyReportResponse['charts']['platforms'][number];

interface ResolvePlatformTabViewModelParams {
  report: WeeklyReportResponse;
  platformAliases: string[];
  trend7d: PlatformTrendItem[];
  metricDefinitions: TrendMetricDefinition[];
  platformData: PlatformData;
  isDouyinPlatform: boolean;
  useDashForTrafficQualityMetrics: boolean;
  channelColors: DouyinChannelColors;
  resolveCategoryWaterfallColor: (index: number) => string;
}

export interface PlatformTabViewModel extends PlatformTabChartBundle, PlatformTabComputedBundle {}

export function resolvePlatformTabViewModel({
  report,
  platformAliases,
  trend7d,
  metricDefinitions,
  platformData,
  isDouyinPlatform,
  useDashForTrafficQualityMetrics,
  channelColors,
  resolveCategoryWaterfallColor,
}: ResolvePlatformTabViewModelParams): PlatformTabViewModel {
  const chartBundle = resolvePlatformTabChartBundle({
    report,
    platformAliases,
    trend7d,
    metricDefinitions,
  });

  const computedBundle = resolvePlatformTabComputedBundle({
    report,
    platformAliases,
    platformData,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
    channelColors,
    resolveCategoryWaterfallColor,
    attributionSources: chartBundle.attributionSources,
  });

  return {
    ...chartBundle,
    ...computedBundle,
  };
}
