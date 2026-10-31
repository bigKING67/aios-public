import type { CompetitorSource } from './competitor-api';
import { readPeriodSelection } from './competitor-scope';
import { periodQuery, type PeriodSelection } from './studio-period';

export function readVideoFilters(params: URLSearchParams) {
  const selection = readPeriodSelection(params);
  const rawSource = params.get('source');
  const source: CompetitorSource = rawSource === 'compass' || rawSource === 'manual' ? rawSource : 'all';
  const rawPage = Number(params.get('page') || '1');
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 100_000 ? rawPage : 1;
  return { selection, source, page, query: { ...periodQuery(selection), source, page, pageSize: 20 } };
}

export function changeVideoFilters(current: URLSearchParams, change: { source?: CompetitorSource; selection?: PeriodSelection; page?: number }) {
  const next = new URLSearchParams(current);
  if (change.source) next.set('source', change.source);
  if (change.selection) {
    for (const key of ['unit', 'date', 'from', 'to', 'period']) next.delete(key);
    for (const [key, value] of Object.entries(periodQuery(change.selection))) next.set(key, value);
  }
  next.set('page', String(change.page ?? 1));
  next.delete('analysis');
  next.delete('video');
  return next;
}
