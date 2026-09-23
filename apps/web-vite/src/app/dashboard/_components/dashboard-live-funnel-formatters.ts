import dayjs from 'dayjs';

import {
  formatCompactWanCurrency,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { toSortableNumber } from './dashboard-sorters';
import type { DashboardLiveDetailRow } from './dashboard-types';
import { resolveLiveDetailTitle } from './dashboard-live-detail-formatters';

function resolveRatio(numerator: NumericInput, denominator: NumericInput): number | null {
  const numeratorValue = toSortableNumber(numerator);
  const denominatorValue = toSortableNumber(denominator);
  if (numeratorValue === null || denominatorValue === null || denominatorValue <= 0) {
    return null;
  }
  return numeratorValue / denominatorValue;
}

function resolvePreferredRate(preferred: NumericInput, numerator: NumericInput, denominator: NumericInput): number | null {
  const numeratorValue = toSortableNumber(numerator);
  const denominatorValue = toSortableNumber(denominator);
  if (numeratorValue !== null && denominatorValue !== null) {
    return denominatorValue > 0 ? numeratorValue / denominatorValue : null;
  }

  const preferredValue = toSortableNumber(preferred);
  if (preferredValue !== null) {
    return preferredValue;
  }
  return null;
}

function formatNullableRate(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '--' : formatTableRate(value);
}

export function formatLiveFunnelSessionTimeRange(row: DashboardLiveDetailRow): string {
  const parsedStart = dayjs(row.live_start_time);
  const parsedEnd = row.live_end_time ? dayjs(row.live_end_time) : null;
  const startText = parsedStart.isValid() ? parsedStart.format('HH:mm') : '--';
  const endText = parsedEnd?.isValid() ? parsedEnd.format('HH:mm') : '--';
  return `${startText}-${endText}`;
}

export function formatLiveFunnelSessionOptionLabel(row: DashboardLiveDetailRow): string {
  const anchorText = row.anchor_nickname?.trim() || resolveLiveDetailTitle(row);
  const gmvText = formatCompactWanCurrency(row.live_gmv);
  return `【${formatLiveFunnelSessionTimeRange(row)}】 ${anchorText} · ${gmvText}`;
}

export function getLiveFunnelOverallRate(row: DashboardLiveDetailRow): string {
  return formatNullableRate(resolveRatio(row.live_buyer_count, row.live_exposure_user_count));
}

export function getLiveFunnelExposureToWatchRate(row: DashboardLiveDetailRow): number | null {
  return resolveRatio(row.live_watch_user_count, row.live_exposure_user_count);
}

export function getLiveFunnelWatchToProductExposureRate(row: DashboardLiveDetailRow): number | null {
  return resolveRatio(row.live_product_exposure_user, row.live_watch_user_count);
}

export function getLiveFunnelProductExposureToClickRate(row: DashboardLiveDetailRow): number | null {
  return resolvePreferredRate(
    row.product_click_rate_user,
    row.live_product_click_user,
    row.live_product_exposure_user
  );
}

export function getLiveFunnelProductClickToBuyerRate(row: DashboardLiveDetailRow): number | null {
  return resolvePreferredRate(row.click_to_pay_rate_user, row.live_buyer_count, row.live_product_click_user);
}

export { formatNullableRate };
