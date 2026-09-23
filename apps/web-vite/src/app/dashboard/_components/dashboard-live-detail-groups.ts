import dayjs from 'dayjs';

import { compareText } from './dashboard-sorters';
import type { DashboardLiveDetailRow } from './dashboard-types';
import {
  getLiveDetailBusinessSessionKey,
  getLiveDetailDateKey,
  resolveLiveDetailTitle,
} from './dashboard-live-detail-formatters';
import { toLiveGoodsNumber } from './dashboard-live-goods-formatters';

function compareLiveDetailRowsByDefault(left: DashboardLiveDetailRow, right: DashboardLiveDetailRow): number {
  const leftGmv = toLiveGoodsNumber(left.live_gmv) ?? Number.NEGATIVE_INFINITY;
  const rightGmv = toLiveGoodsNumber(right.live_gmv) ?? Number.NEGATIVE_INFINITY;
  if (Math.abs(rightGmv - leftGmv) > Number.EPSILON) {
    return rightGmv - leftGmv;
  }

  const leftTime = dayjs(left.live_start_time).valueOf();
  const rightTime = dayjs(right.live_start_time).valueOf();
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return compareText(resolveLiveDetailTitle(left), resolveLiveDetailTitle(right));
}

export function buildLiveRowsByDate(rows: DashboardLiveDetailRow[]): Map<string, DashboardLiveDetailRow[]> {
  const sessionMapByDate = new Map<string, Map<string, DashboardLiveDetailRow>>();
  rows.forEach((row) => {
    const dateKey = getLiveDetailDateKey(row);
    if (!dateKey) {
      return;
    }
    const sessionKey = getLiveDetailBusinessSessionKey(row);
    const currentDateMap = sessionMapByDate.get(dateKey) || new Map<string, DashboardLiveDetailRow>();
    const existingRow = currentDateMap.get(sessionKey);
    if (!existingRow || compareLiveDetailRowsByDefault(row, existingRow) < 0) {
      currentDateMap.set(sessionKey, row);
    }
    if (!sessionMapByDate.has(dateKey)) {
      sessionMapByDate.set(dateKey, currentDateMap);
    }
  });

  const rowsByDate = new Map<string, DashboardLiveDetailRow[]>();
  sessionMapByDate.forEach((sessionMap, dateKey) => {
    rowsByDate.set(dateKey, Array.from(sessionMap.values()).sort(compareLiveDetailRowsByDefault));
  });
  return rowsByDate;
}

export function dedupeLiveDetailRows(rows: DashboardLiveDetailRow[]): DashboardLiveDetailRow[] {
  const rowMap = new Map<string, DashboardLiveDetailRow>();
  rows.forEach((row) => {
    const key = getLiveDetailBusinessSessionKey(row);
    const existingRow = rowMap.get(key);
    if (!existingRow || compareLiveDetailRowsByDefault(row, existingRow) < 0) {
      rowMap.set(key, row);
    }
  });
  return Array.from(rowMap.values()).sort((left, right) => {
    const leftTime = dayjs(left.live_start_time).valueOf();
    const rightTime = dayjs(right.live_start_time).valueOf();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    const gmvCompare = compareLiveDetailRowsByDefault(left, right);
    if (Math.abs(gmvCompare) > Number.EPSILON) {
      return gmvCompare;
    }
    return compareText(resolveLiveDetailTitle(left), resolveLiveDetailTitle(right));
  });
}
