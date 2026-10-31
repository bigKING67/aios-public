import dayjs from 'dayjs';
import type { StudioOverviewPeriod } from './ai-studio-api';

/**
 * The 日 / 月 / 年 / 自定义 period shared by the studio home and 爆款分析 (Asia/Shanghai dates).
 * The server resolves it and answers with a `StudioOverviewPeriod`: the key, the covered dates,
 * today and the newest date with data.
 */
export type PeriodUnit = 'day' | 'month' | 'year' | 'custom';
export type CalendarUnit = Exclude<PeriodUnit, 'custom'>;

/** The day, month or year around `date` (the server anchors on the newest data when absent), or a custom inclusive range. */
export type PeriodSelection = { unit: CalendarUnit; date?: string } | { unit: 'custom'; from: string; to: string };

/** The query parameters a selection sends. */
export interface PeriodQuery {
  unit?: CalendarUnit;
  date?: string;
  from?: string;
  to?: string;
}

export const PERIOD_UNITS: readonly { value: PeriodUnit; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
  { value: 'custom', label: '自定义' },
];

/** Longest custom range the server accepts, both ends included. */
export const MAX_CUSTOM_DAYS = 366;

const BEIJING_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' });

/** The day before `today` (the server's, else the Beijing date now): the newest complete day. */
export function yesterdayDate(today?: string): string {
  return dayjs(today ?? BEIJING_DATE.format(new Date()))
    .subtract(1, 'day')
    .format('YYYY-MM-DD');
}

/** Pages open on 日 at yesterday, so the first read is the newest complete day. */
export function defaultPeriodSelection(): PeriodSelection {
  return { unit: 'day', date: yesterdayDate() };
}

export function periodQuery(selection: PeriodSelection): PeriodQuery {
  if (selection.unit === 'custom') return { from: selection.from, to: selection.to };
  return selection.date ? { unit: selection.unit, date: selection.date } : { unit: selection.unit };
}

const slashed = (date: string) => date.replace(/-/g, '/');

/** `2026/10/01 - 2026/10/26`, or one date for a single day. */
export function periodRangeText(period: Pick<StudioOverviewPeriod, 'from' | 'to'>): string {
  return period.from === period.to ? slashed(period.from) : `${slashed(period.from)} - ${slashed(period.to)}`;
}

/** The period one day, month or year before or after the one shown; null when it would start after today. */
export function shiftPeriodDate(period: StudioOverviewPeriod, unit: CalendarUnit, step: -1 | 1): string | null {
  const next = dayjs(period.from).add(step, unit).startOf(unit);
  return next.isAfter(dayjs(period.today), 'day') ? null : next.format('YYYY-MM-DD');
}
