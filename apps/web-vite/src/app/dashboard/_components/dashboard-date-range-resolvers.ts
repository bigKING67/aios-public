import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type {
  DateMode,
} from './dashboard-config';
import type { DashboardAvailableDateBounds } from './dashboard-date-bounds-state';
import type {
  ResolvedDateRange,
} from './dashboard-types';
import {
  BUSINESS_WEEK_LOCALE,
  WEEKDAY_LABELS_SUN_FIRST,
} from './dashboard-date-range-constants';

type PeriodUnit = 'week' | 'month' | 'year';

function hasAvailableDateBound(bounds?: DashboardAvailableDateBounds | null): boolean {
  return Boolean(bounds?.minDate || bounds?.maxDate);
}

function resolvePeriodBounds(value: Dayjs, unit: PeriodUnit): ResolvedDateRange {
  const localizedValue = unit === 'week' ? value.locale(BUSINESS_WEEK_LOCALE) : value;
  return {
    start: localizedValue.startOf(unit).startOf('day'),
    end: localizedValue.endOf(unit).startOf('day'),
  };
}

export function clampDateToAvailableBounds(
  value: Dayjs,
  bounds?: DashboardAvailableDateBounds | null,
): Dayjs {
  const date = value.startOf('day');
  const minDate = bounds?.minDate?.startOf('day') ?? null;
  const maxDate = bounds?.maxDate?.startOf('day') ?? null;

  if (minDate && date.isBefore(minDate, 'day')) {
    return minDate;
  }

  if (maxDate && date.isAfter(maxDate, 'day')) {
    return maxDate;
  }

  return date;
}

export function clampPickerValueToAvailableBounds(
  value: Dayjs,
  unit: PeriodUnit,
  bounds?: DashboardAvailableDateBounds | null,
): Dayjs {
  if (!hasAvailableDateBound(bounds)) {
    return value;
  }

  const range = resolvePeriodBounds(value, unit);
  const minDate = bounds?.minDate?.startOf('day') ?? null;
  const maxDate = bounds?.maxDate?.startOf('day') ?? null;

  if (minDate && range.end.isBefore(minDate, 'day')) {
    return minDate;
  }

  if (maxDate && range.start.isAfter(maxDate, 'day')) {
    return maxDate;
  }

  return value;
}

function intersectRangeWithAvailableBounds(
  range: ResolvedDateRange,
  bounds?: DashboardAvailableDateBounds | null,
): ResolvedDateRange {
  const minDate = bounds?.minDate?.startOf('day') ?? null;
  const maxDate = bounds?.maxDate?.startOf('day') ?? null;

  if (minDate && range.end.isBefore(minDate, 'day')) {
    return { start: minDate, end: minDate };
  }

  if (maxDate && range.start.isAfter(maxDate, 'day')) {
    return { start: maxDate, end: maxDate };
  }

  const start = minDate && range.start.isBefore(minDate, 'day') ? minDate : range.start;
  const end = maxDate && range.end.isAfter(maxDate, 'day') ? maxDate : range.end;

  if (start.isAfter(end, 'day')) {
    return { start: end, end };
  }

  return { start, end };
}

export function clampCustomRangeToAvailableBounds(
  customRange: [Dayjs, Dayjs],
  bounds?: DashboardAvailableDateBounds | null,
  maxRangeDays?: number,
): [Dayjs, Dayjs] {
  let start = clampDateToAvailableBounds(customRange[0], bounds);
  const end = clampDateToAvailableBounds(customRange[1], bounds);

  if (start.isAfter(end, 'day')) {
    start = end;
  }

  if (maxRangeDays && maxRangeDays > 0) {
    const daySpan = end.diff(start, 'day') + 1;
    if (daySpan > maxRangeDays) {
      start = end.subtract(maxRangeDays - 1, 'day').startOf('day');
      const minDate = bounds?.minDate?.startOf('day') ?? null;
      if (minDate && start.isBefore(minDate, 'day')) {
        start = minDate;
      }
    }
  }

  return [start, end];
}

function resolvePeriodRange(
  value: Dayjs,
  unit: PeriodUnit,
  bounds?: DashboardAvailableDateBounds | null,
): ResolvedDateRange {
  if (hasAvailableDateBound(bounds)) {
    const clampedValue = clampPickerValueToAvailableBounds(value, unit, bounds);
    const range = resolvePeriodBounds(clampedValue, unit);
    return intersectRangeWithAvailableBounds(range, bounds);
  }

  const range = resolvePeriodBounds(value, unit);
  const today = dayjs().startOf('day');
  const shouldClampToToday = !range.start.isAfter(today, 'day') && range.end.isAfter(today, 'day');
  return {
    start: range.start,
    end: shouldClampToToday ? today : range.end,
  };
}

export function resolveCurrentRange(
  dateMode: DateMode,
  dayValue: Dayjs,
  weekValue: Dayjs,
  monthValue: Dayjs,
  yearValue: Dayjs,
  customRange: [Dayjs, Dayjs],
  availableDateBounds?: DashboardAvailableDateBounds | null,
): ResolvedDateRange {
  if (dateMode === 'day') {
    const day = clampDateToAvailableBounds(dayValue, availableDateBounds);
    return {
      start: day,
      end: day,
    };
  }

  if (dateMode === 'week') {
    return resolvePeriodRange(weekValue, 'week', availableDateBounds);
  }

  if (dateMode === 'month') {
    return resolvePeriodRange(monthValue, 'month', availableDateBounds);
  }

  if (dateMode === 'year') {
    return resolvePeriodRange(yearValue, 'year', availableDateBounds);
  }

  return intersectRangeWithAvailableBounds({
    start: customRange[0].startOf('day'),
    end: customRange[1].startOf('day'),
  }, availableDateBounds);
}

export function resolvePreviousRange(
  dateMode: DateMode,
  currentRange: ResolvedDateRange,
): ResolvedDateRange {
  if (dateMode === 'day') {
    const previousDay = currentRange.start.subtract(1, 'day').startOf('day');
    return {
      start: previousDay,
      end: previousDay,
    };
  }

  if (dateMode === 'week') {
    return {
      start: currentRange.start.subtract(7, 'day').startOf('day'),
      end: currentRange.end.subtract(7, 'day').startOf('day'),
    };
  }

  if (dateMode === 'month') {
    const previousMonthStart = currentRange.start.subtract(1, 'month').startOf('month').startOf('day');
    const isFullMonthPeriod =
      currentRange.start.date() === 1 &&
      currentRange.end.isSame(currentRange.start.endOf('month').startOf('day'), 'day');

    if (isFullMonthPeriod) {
      return {
        start: previousMonthStart,
        end: previousMonthStart.endOf('month').startOf('day'),
      };
    }

    const previousPartialStart = currentRange.start.subtract(1, 'month').startOf('day');
    const previousMonthEnd = currentRange.end.subtract(1, 'month').startOf('day');
    return {
      start: previousPartialStart,
      end: previousMonthEnd.isBefore(previousPartialStart, 'day') ? previousPartialStart : previousMonthEnd,
    };
  }

  if (dateMode === 'year') {
    return {
      start: currentRange.start.subtract(1, 'year').startOf('day'),
      end: currentRange.end.subtract(1, 'year').startOf('day'),
    };
  }

  const days = Math.max(1, currentRange.end.diff(currentRange.start, 'day') + 1);
  const previousEnd = currentRange.start.subtract(1, 'day').startOf('day');
  const previousStart = previousEnd.subtract(days - 1, 'day').startOf('day');

  return {
    start: previousStart,
    end: previousEnd,
  };
}

export function formatTrendLabelByMode(dateValue: string, dateMode: DateMode): string {
  const date = dayjs(dateValue);
  if (!date.isValid()) {
    return dateValue;
  }

  if (dateMode === 'week') {
    return WEEKDAY_LABELS_SUN_FIRST[date.day()] || date.format('MM/DD');
  }

  if (dateMode === 'day') {
    return date.format('MM/DD');
  }

  if (dateMode === 'year') {
    return date.format('MM月');
  }

  return date.format('MM/DD');
}
