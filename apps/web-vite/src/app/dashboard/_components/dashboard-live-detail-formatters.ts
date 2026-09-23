import dayjs from 'dayjs';

import { DATE_LITERAL_PATTERN } from './dashboard-config';
import type { DashboardLiveDetailRow } from './dashboard-types';
import { toSortableNumber } from './dashboard-sorters';

export function getLiveDetailDateKey(row: DashboardLiveDetailRow): string | null {
  const statDate = row.stat_date?.trim();
  if (statDate && DATE_LITERAL_PATTERN.test(statDate)) {
    return statDate;
  }

  const parsed = dayjs(row.live_start_time);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

export function getLiveDetailBusinessSessionKey(row: DashboardLiveDetailRow): string {
  const liveStart = dayjs(row.live_start_time);
  const liveEnd = row.live_end_time ? dayjs(row.live_end_time) : null;
  return [
    row.shop_id || '',
    row.anchor_douyin_id || '',
    getLiveDetailDateKey(row) || '',
    liveStart.isValid() ? liveStart.format('YYYY-MM-DD HH:mm') : row.live_start_time || '',
    liveEnd?.isValid() ? liveEnd.format('YYYY-MM-DD HH:mm:ss') : row.live_end_time || '',
  ].join('|');
}

export function getLiveDetailGsv(row: DashboardLiveDetailRow): number | null {
  // Live GSV uses the explicit live refund amount; net_gmv may use a 1-hour refund window.
  const gmv = toSortableNumber(row.live_gmv);
  const refundAmount = toSortableNumber(row.live_refund_amount);
  if (gmv === null || refundAmount === null) {
    return null;
  }
  return gmv - refundAmount;
}

export function resolveLiveDetailTitle(row: DashboardLiveDetailRow): string {
  return (
    row.live_title?.trim() ||
    row.live_room_title?.trim() ||
    row.anchor_nickname?.trim() ||
    row.shop_name?.trim() ||
    '未命名直播间'
  );
}
