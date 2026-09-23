import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  DATE_LITERAL_PATTERN,
  MONTH_LITERAL_PATTERN,
  YEAR_LITERAL_PATTERN,
} from './dashboard-config';

export function parseDateLiteral(value?: string): Dayjs | null {
  if (!value || !DATE_LITERAL_PATTERN.test(value)) {
    return null;
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.startOf('day');
}

export function parseMonthLiteral(value?: string): Dayjs | null {
  if (!value || !MONTH_LITERAL_PATTERN.test(value)) {
    return null;
  }

  const parsed = dayjs(`${value}-01`);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.startOf('month');
}

export function parseYearLiteral(value?: string): Dayjs | null {
  if (!value || !YEAR_LITERAL_PATTERN.test(value)) {
    return null;
  }

  const parsed = dayjs(`${value}-01-01`);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.startOf('year');
}

export function getDateRangeDaySpan(startValue: Dayjs, endValue: Dayjs): number {
  const start = startValue.startOf('day');
  const end = endValue.startOf('day');
  const [rangeStart, rangeEnd] = start.isAfter(end, 'day') ? [end, start] : [start, end];
  return rangeEnd.diff(rangeStart, 'day') + 1;
}

export function clampCustomRangeToLimit(
  range: [Dayjs, Dayjs],
  maxDays: number,
): { range: [Dayjs, Dayjs]; exceeded: boolean } {
  const [rawStart, rawEnd] = range;
  const start = rawStart.startOf('day');
  const end = rawEnd.startOf('day');
  const daySpan = getDateRangeDaySpan(start, end);

  if (daySpan <= maxDays) {
    return {
      range: [start, end],
      exceeded: false,
    };
  }

  return {
    range: [end.subtract(maxDays - 1, 'day').startOf('day'), end],
    exceeded: true,
  };
}
