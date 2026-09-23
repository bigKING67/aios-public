import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type { PlatformTabColumns } from './platform-tab-columns';
import type { PlatformTabContentProps } from './platform-tab-content-props';
import type { PlatformTabContext } from './platform-tab-context';
import type { DouyinChannelColors } from './platform-tab-douyin-section-data';
import type { TrendMetricDefinition } from './platform-tab-types';
import { resolvePlatformTabViewModel } from './platform-tab-view-model';

export type PlatformTabRenderState =
  | { kind: 'empty' }
  | { kind: 'content'; contentProps: PlatformTabContentProps };

export interface BuildPlatformTabRenderStateParams {
  report: WeeklyReportResponse;
  isMobile: boolean;
  context: PlatformTabContext;
  metricDefinitions: TrendMetricDefinition[];
  columns: PlatformTabColumns;
  channelColors: DouyinChannelColors;
  resolveCategoryWaterfallColor: (index: number) => string;
}

export function buildPlatformTabRenderState({
  report,
  isMobile,
  context,
  metricDefinitions,
  columns,
  channelColors,
  resolveCategoryWaterfallColor,
}: BuildPlatformTabRenderStateParams): PlatformTabRenderState {
  const {
    platformData,
    platformLabel,
    platformAliases,
    summaryWeekPeriod,
    trend7d,
    isTmallPlatform,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
  } = context;

  if (!platformData) {
    return { kind: 'empty' };
  }

  const viewModel = resolvePlatformTabViewModel({
    report,
    platformAliases,
    trend7d,
    metricDefinitions,
    platformData,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
    channelColors,
    resolveCategoryWaterfallColor,
  });

  return {
    kind: 'content',
    contentProps: {
      isMobile,
      report,
      platformLabel,
      summaryWeekPeriod,
      isTmallPlatform,
      isDouyinPlatform,
      columns,
      viewModel,
    },
  };
}
