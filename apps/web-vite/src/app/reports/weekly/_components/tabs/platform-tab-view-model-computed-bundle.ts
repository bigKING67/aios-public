import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type { PlatformAttributionSources } from './platform-tab-chart-sources';
import {
  type DouyinChannelColors,
  type DouyinSectionData,
} from './platform-tab-douyin-section-data';
import type { DouyinChannelGmvSummary } from './platform-tab-douyin-summary';
import {
  resolvePlatformBaseMetricValues,
  type PlatformBaseMetricValues,
  type PlatformMetricCard,
} from './platform-tab-metrics';
import type {
  PlatformQualityMetricInputs,
  PlatformQualityMetrics,
} from './platform-tab-quality-metrics';
import type { TmallPlatformSectionData } from './platform-tab-tmall-derived-data';
import { resolvePlatformTabDouyinBundle } from './platform-tab-view-model-douyin-bundle';
import { resolvePlatformTabPrimaryMetrics } from './platform-tab-view-model-primary-metrics';
import { resolvePlatformTabQualityBundle } from './platform-tab-view-model-quality-bundle';
import { resolvePlatformTabTmallBundle } from './platform-tab-view-model-tmall-bundle';

type PlatformData = WeeklyReportResponse['charts']['platforms'][number];

interface ResolvePlatformTabComputedBundleParams {
  report: WeeklyReportResponse;
  platformAliases: string[];
  platformData: PlatformData;
  isDouyinPlatform: boolean;
  useDashForTrafficQualityMetrics: boolean;
  channelColors: DouyinChannelColors;
  resolveCategoryWaterfallColor: (index: number) => string;
  attributionSources: PlatformAttributionSources;
}

export interface PlatformTabComputedBundle {
  baseMetrics: PlatformBaseMetricValues;
  qualityInputs: PlatformQualityMetricInputs;
  qualityMetrics: PlatformQualityMetrics;
  douyinChannelGmvSummary: DouyinChannelGmvSummary;
  tmallSectionData: TmallPlatformSectionData;
  douyinSectionData: DouyinSectionData;
  primaryMetrics: PlatformMetricCard[];
}

export function resolvePlatformTabComputedBundle({
  report,
  platformAliases,
  platformData,
  isDouyinPlatform,
  useDashForTrafficQualityMetrics,
  channelColors,
  resolveCategoryWaterfallColor,
  attributionSources,
}: ResolvePlatformTabComputedBundleParams): PlatformTabComputedBundle {
  const baseMetrics = resolvePlatformBaseMetricValues(platformData);

  const { tmallSectionData } = resolvePlatformTabTmallBundle({
    attributionSources,
    baseMetrics,
    resolveCategoryWaterfallColor,
  });

  const { qualityInputs, qualityMetrics } = resolvePlatformTabQualityBundle({
    platformData,
    baseMetrics,
  });

  const { douyinChannelGmvSummary, douyinSectionData } = resolvePlatformTabDouyinBundle({
    report,
    platformAliases,
    platformData,
    channelColors,
    resolveCategoryWaterfallColor,
    attributionSources,
  });

  const primaryMetrics = resolvePlatformTabPrimaryMetrics({
    baseMetrics,
    qualityInputs,
    qualityMetrics,
    douyinChannelGmvSummary,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
  });

  return {
    baseMetrics,
    qualityInputs,
    qualityMetrics,
    douyinChannelGmvSummary,
    tmallSectionData,
    douyinSectionData,
    primaryMetrics,
  };
}
