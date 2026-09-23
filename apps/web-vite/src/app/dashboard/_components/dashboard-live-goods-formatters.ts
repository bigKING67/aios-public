import dayjs from 'dayjs';
import type { NumericInput } from './dashboard-formatters';
import { toSortableNumber } from './dashboard-sorters';

export function toLiveGoodsNumber(value: NumericInput): number {
  return toSortableNumber(value) ?? 0;
}

export function formatLiveGoodsSessionTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value || '--';
}

export function formatLiveGoodsAnchorType(value: string): string {
  const normalized = (value || '').trim();
  if (normalized === 'self') {
    return '自播';
  }
  if (normalized === 'influencer') {
    return '达播';
  }
  return normalized || '--';
}
