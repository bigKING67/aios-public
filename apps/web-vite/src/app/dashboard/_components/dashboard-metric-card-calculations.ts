import type { NumericInput } from './dashboard-formatters';
import { toSortableNumber } from './dashboard-sorters';
import type { LiveMetricCard } from './dashboard-types';

export type DashboardMetricCardGroups = {
  topMetricCards: LiveMetricCard[];
  bottomMetricCards: LiveMetricCard[];
};

export const LIVE_TOP_METRIC_KEYS = new Set(['live_session_count', 'live_gmv', 'live_gsv']);
export const SHORT_VIDEO_TOP_METRIC_KEYS = new Set(['shortvideo_count', 'shortvideo_gmv', 'shortvideo_gsv']);

export function calculateRateChange(current: NumericInput, previous: NumericInput): number | null {
  const currentValue = toSortableNumber(current);
  const previousValue = toSortableNumber(previous);

  if (currentValue === null || previousValue === null) {
    return null;
  }
  if (Math.abs(previousValue) < Number.EPSILON) {
    return null;
  }

  return (currentValue - previousValue) / Math.abs(previousValue);
}

export function splitDashboardMetricCardsByKeys(
  metricCards: LiveMetricCard[],
  topMetricKeys: ReadonlySet<string>
): DashboardMetricCardGroups {
  return {
    topMetricCards: metricCards.filter((item) => topMetricKeys.has(item.key)),
    bottomMetricCards: metricCards.filter((item) => !topMetricKeys.has(item.key)),
  };
}
