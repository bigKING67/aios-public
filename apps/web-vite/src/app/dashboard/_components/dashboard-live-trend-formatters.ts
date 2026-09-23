import dayjs from 'dayjs';
import type { DashboardLiveTrendRow } from './dashboard-types';

export function getLiveTrendDateKey(row?: DashboardLiveTrendRow): string | null {
  if (!row?.date) {
    return null;
  }
  const parsed = dayjs(row.date);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}
