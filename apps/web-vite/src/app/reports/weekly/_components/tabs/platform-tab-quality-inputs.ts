import { toOptionalNumber } from './platform-tab-formatters';
import type {
  PlatformQualityMetricInputs,
  PlatformQualityMetricSource,
} from './platform-tab-quality-metric-types';

export function resolvePlatformQualityMetricInputs(
  platformData: PlatformQualityMetricSource
): PlatformQualityMetricInputs {
  return {
    visitorCount: toOptionalNumber(platformData.visitor_count),
    prevVisitorCount: toOptionalNumber(platformData.prev_visitor_count),
    cost: toOptionalNumber(platformData.cost),
    prevCost: toOptionalNumber(platformData.prev_cost),
  };
}
