import { calcChangePercent, formatDecimal } from './platform-tab-formatters';
import type { PlatformMetricCard } from './platform-tab-metric-types';
import type { BuildPrimaryRoiMetricParams } from './platform-tab-primary-metric-types';

export function buildPrimaryRoiMetric({
  roi,
  prevRoi,
  useDashForTrafficQualityMetrics,
}: BuildPrimaryRoiMetricParams): PlatformMetricCard {
  return {
    key: 'roi',
    label: 'ROI',
    value: useDashForTrafficQualityMetrics ? '-' : formatDecimal(roi, 2),
    wow:
      useDashForTrafficQualityMetrics
        ? undefined
        : roi !== undefined && prevRoi !== undefined
          ? calcChangePercent(roi, prevRoi)
          : undefined,
  };
}
