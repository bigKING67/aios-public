import datePickerZhCN from 'antd/es/date-picker/locale/zh_CN';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import zhCnDayjsLocale from 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';

import type { LiveCenterDateBoundsResponse } from './live-center-types';

export const LIVE_CENTER_WEEK_LOCALE = 'zh-cn-live-center-week';
export const LIVE_CENTER_WEEKDAY_LABELS_SUN_FIRST = ['日', '一', '二', '三', '四', '五', '六'];

export const LIVE_CENTER_DATE_PICKER_LOCALE = {
  ...datePickerZhCN,
  lang: {
    ...datePickerZhCN.lang,
    locale: LIVE_CENTER_WEEK_LOCALE,
    shortWeekDays: LIVE_CENTER_WEEKDAY_LABELS_SUN_FIRST,
  },
};

export type LiveCenterDateMode = 'day' | 'week' | 'month' | 'year' | 'custom';
export type LiveCenterDateRangeValue = [Dayjs, Dayjs];
export type LiveCenterDateBoundsStatus = 'loading' | 'ready' | 'empty' | 'error';

export type LiveCenterDateRange = {
  start: Dayjs;
  end: Dayjs;
};

export type LiveCenterAvailableDateBounds = {
  minDate: Dayjs | null;
  maxDate: Dayjs | null;
};

export type LiveCenterDateState = {
  dateMode: LiveCenterDateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: LiveCenterDateRangeValue;
};

export const LIVE_CENTER_DATE_MODE_OPTIONS: ReadonlyArray<{
  label: string;
  value: LiveCenterDateMode;
}> = [
  { label: '月', value: 'month' },
  { label: '周', value: 'week' },
  { label: '日', value: 'day' },
  { label: '年', value: 'year' },
  { label: '自定义', value: 'custom' },
];

export const EMPTY_LIVE_CENTER_DATE_BOUNDS: LiveCenterAvailableDateBounds = {
  minDate: null,
  maxDate: null,
};

const LIVE_CENTER_DATE_LITERAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

let hasConfiguredLiveCenterDayjsLocale = false;

export function configureLiveCenterDayjsLocale() {
  if (hasConfiguredLiveCenterDayjsLocale) {
    return;
  }

  dayjs.extend(isoWeek);
  dayjs.locale(
    {
      ...zhCnDayjsLocale,
      name: LIVE_CENTER_WEEK_LOCALE,
      weekStart: 6,
      weekdaysMin: LIVE_CENTER_WEEKDAY_LABELS_SUN_FIRST,
    },
    undefined,
    true
  );
  hasConfiguredLiveCenterDayjsLocale = true;
}

export function getInitialLiveCenterDateState(
  today: Dayjs = dayjs().startOf('day')
): LiveCenterDateState {
  const normalizedToday = today.startOf('day');
  const fallbackEnd = normalizedToday.subtract(1, 'day').startOf('day');

  return {
    dateMode: 'month',
    dayValue: fallbackEnd,
    weekValue: normalizedToday.locale(LIVE_CENTER_WEEK_LOCALE),
    monthValue: normalizedToday.startOf('month'),
    yearValue: normalizedToday.startOf('year'),
    customRange: [fallbackEnd.subtract(6, 'day').startOf('day'), fallbackEnd],
  };
}

export function normalizeLiveCenterDateBounds(
  payload: LiveCenterDateBoundsResponse | null | undefined
): LiveCenterAvailableDateBounds {
  const minDate = parseLiveCenterDateLiteral(payload?.minDate);
  const maxDate = parseLiveCenterDateLiteral(payload?.maxDate);

  if (minDate && maxDate && minDate.isAfter(maxDate, 'day')) {
    return EMPTY_LIVE_CENTER_DATE_BOUNDS;
  }

  return {
    minDate,
    maxDate,
  };
}

export function hasUsableLiveCenterDateBounds(
  bounds?: LiveCenterAvailableDateBounds | null
): boolean {
  return Boolean(bounds?.minDate && bounds?.maxDate);
}

export function clampDateToLiveCenterBounds(
  value: Dayjs,
  bounds?: LiveCenterAvailableDateBounds | null
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

export function clampPickerValueToLiveCenterBounds(
  value: Dayjs,
  unit: 'week' | 'month' | 'year',
  bounds?: LiveCenterAvailableDateBounds | null
): Dayjs {
  if (!hasAnyLiveCenterDateBound(bounds)) {
    return value;
  }

  const range = resolveLiveCenterPeriodBounds(value, unit);
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

export function clampCustomRangeToLiveCenterBounds(
  customRange: LiveCenterDateRangeValue,
  bounds?: LiveCenterAvailableDateBounds | null
): LiveCenterDateRangeValue {
  let start = clampDateToLiveCenterBounds(customRange[0], bounds);
  const end = clampDateToLiveCenterBounds(customRange[1], bounds);

  if (start.isAfter(end, 'day')) {
    start = end;
  }

  return [start, end];
}

export function resolveLiveCenterCurrentRange(
  dateState: LiveCenterDateState,
  availableDateBounds?: LiveCenterAvailableDateBounds | null
): LiveCenterDateRange {
  if (dateState.dateMode === 'day') {
    const day = clampDateToLiveCenterBounds(dateState.dayValue, availableDateBounds);
    return { start: day, end: day };
  }

  if (dateState.dateMode === 'week') {
    return resolveLiveCenterPeriodRange(dateState.weekValue, 'week', availableDateBounds);
  }

  if (dateState.dateMode === 'month') {
    return resolveLiveCenterPeriodRange(dateState.monthValue, 'month', availableDateBounds);
  }

  if (dateState.dateMode === 'year') {
    return resolveLiveCenterPeriodRange(dateState.yearValue, 'year', availableDateBounds);
  }

  return intersectRangeWithLiveCenterBounds(
    {
      start: dateState.customRange[0].startOf('day'),
      end: dateState.customRange[1].startOf('day'),
    },
    availableDateBounds
  );
}

function parseLiveCenterDateLiteral(value?: string | null): Dayjs | null {
  if (!value || !LIVE_CENTER_DATE_LITERAL_PATTERN.test(value)) {
    return null;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf('day') : null;
}

function hasAnyLiveCenterDateBound(bounds?: LiveCenterAvailableDateBounds | null): boolean {
  return Boolean(bounds?.minDate || bounds?.maxDate);
}

function resolveLiveCenterPeriodBounds(
  value: Dayjs,
  unit: 'week' | 'month' | 'year'
): LiveCenterDateRange {
  const localizedValue = unit === 'week' ? value.locale(LIVE_CENTER_WEEK_LOCALE) : value;
  return {
    start: localizedValue.startOf(unit).startOf('day'),
    end: localizedValue.endOf(unit).startOf('day'),
  };
}

function resolveLiveCenterPeriodRange(
  value: Dayjs,
  unit: 'week' | 'month' | 'year',
  bounds?: LiveCenterAvailableDateBounds | null
): LiveCenterDateRange {
  if (hasAnyLiveCenterDateBound(bounds)) {
    const clampedValue = clampPickerValueToLiveCenterBounds(value, unit, bounds);
    return intersectRangeWithLiveCenterBounds(
      resolveLiveCenterPeriodBounds(clampedValue, unit),
      bounds
    );
  }

  const range = resolveLiveCenterPeriodBounds(value, unit);
  const today = dayjs().startOf('day');
  const shouldClampToToday = !range.start.isAfter(today, 'day') && range.end.isAfter(today, 'day');
  return {
    start: range.start,
    end: shouldClampToToday ? today : range.end,
  };
}

function intersectRangeWithLiveCenterBounds(
  range: LiveCenterDateRange,
  bounds?: LiveCenterAvailableDateBounds | null
): LiveCenterDateRange {
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
