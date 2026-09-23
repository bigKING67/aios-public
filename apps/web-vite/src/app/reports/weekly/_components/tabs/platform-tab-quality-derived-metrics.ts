import { toOptionalNumber } from './platform-tab-formatters';
import type {
  PlatformQualityMetricParams,
  PlatformQualityMetrics,
} from './platform-tab-quality-metric-types';

function resolveDerivedMetric(
  numerator: number | undefined,
  denominator: number | undefined,
  fallback: unknown,
): number | undefined {
  if (numerator !== undefined && denominator !== undefined) {
    return denominator > 0 ? numerator / denominator : undefined;
  }
  return toOptionalNumber(fallback);
}

export function resolvePlatformQualityMetrics({
  platformData,
  gmv,
  prevGmv,
  buyerCount,
  prevBuyerCount,
  visitorCount,
  prevVisitorCount,
  cost,
  prevCost,
}: PlatformQualityMetricParams): PlatformQualityMetrics {
  const payCvr = resolveDerivedMetric(buyerCount, visitorCount, platformData.pay_cvr);
  const prevPayCvr = resolveDerivedMetric(prevBuyerCount, prevVisitorCount, platformData.prev_pay_cvr);
  const uvValue = resolveDerivedMetric(gmv, visitorCount, platformData.uv_value);
  const prevUvValue = resolveDerivedMetric(prevGmv, prevVisitorCount, platformData.prev_uv_value);
  const roi = resolveDerivedMetric(gmv, cost, platformData.roi);
  const prevRoi = resolveDerivedMetric(prevGmv, prevCost, platformData.prev_roi);

  return {
    payCvr,
    prevPayCvr,
    uvValue,
    prevUvValue,
    roi,
    prevRoi,
  };
}
