import type { PlatformAttributionSources } from './platform-tab-chart-sources';
import type { PlatformBaseMetricValues } from './platform-tab-metrics';
import {
  resolveTmallPlatformSectionData,
  type TmallPlatformSectionData,
} from './platform-tab-tmall-derived-data';

interface ResolvePlatformTabTmallBundleParams {
  attributionSources: PlatformAttributionSources;
  baseMetrics: PlatformBaseMetricValues;
  resolveCategoryWaterfallColor: (index: number) => string;
}

export interface PlatformTabTmallBundle {
  tmallSectionData: TmallPlatformSectionData;
}

export function resolvePlatformTabTmallBundle({
  attributionSources,
  baseMetrics,
  resolveCategoryWaterfallColor,
}: ResolvePlatformTabTmallBundleParams): PlatformTabTmallBundle {
  const {
    platformGoodsAttribution,
    platformGoodsChannelAttribution,
    platformGoodsChannelFunnelDiagnosis,
  } = attributionSources;
  const { gmv, prevGmvSafe } = baseMetrics;

  return {
    tmallSectionData: resolveTmallPlatformSectionData({
      platformGoodsAttribution,
      platformGoodsChannelAttribution,
      platformGoodsChannelFunnelDiagnosis,
      gmv,
      prevGmvSafe,
      resolveCategoryWaterfallColor,
    }),
  };
}
