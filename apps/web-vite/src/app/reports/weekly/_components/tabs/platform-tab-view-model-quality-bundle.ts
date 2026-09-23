import type { PlatformBaseMetricValues } from './platform-tab-metrics';
import {
  resolvePlatformQualityMetricInputs,
  resolvePlatformQualityMetrics,
  type PlatformQualityMetricInputs,
  type PlatformQualityMetricSource,
  type PlatformQualityMetrics,
} from './platform-tab-quality-metrics';

interface ResolvePlatformTabQualityBundleParams {
  platformData: PlatformQualityMetricSource;
  baseMetrics: PlatformBaseMetricValues;
}

export interface PlatformTabQualityBundle {
  qualityInputs: PlatformQualityMetricInputs;
  qualityMetrics: PlatformQualityMetrics;
}

export function resolvePlatformTabQualityBundle({
  platformData,
  baseMetrics,
}: ResolvePlatformTabQualityBundleParams): PlatformTabQualityBundle {
  const { gmv, prevGmv, buyerCount, prevBuyerCount } = baseMetrics;
  const qualityInputs = resolvePlatformQualityMetricInputs(platformData);
  const { visitorCount, prevVisitorCount, cost, prevCost } = qualityInputs;
  const qualityMetrics = resolvePlatformQualityMetrics({
    platformData,
    gmv,
    prevGmv,
    buyerCount,
    prevBuyerCount,
    visitorCount,
    prevVisitorCount,
    cost,
    prevCost,
  });

  return {
    qualityInputs,
    qualityMetrics,
  };
}
