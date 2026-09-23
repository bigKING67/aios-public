import type {
  BuildPlatformKpiCardPropsListParams,
  PlatformKpiCardProps,
} from './platform-tab-kpi-section-contracts';
import { buildWeeklyKpiTrendItems } from './weekly-kpi-trend-data';

export function buildPlatformKpiCardPropsList({
  metrics,
  resolveTrendClassName,
}: BuildPlatformKpiCardPropsListParams): PlatformKpiCardProps[] {
  return metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: metric.value,
    variant: 'platform',
    resolveTrendClassName,
    trends: buildWeeklyKpiTrendItems({
      wow: metric.wow,
      yoyDisplayValue: '--',
    }),
  }));
}
