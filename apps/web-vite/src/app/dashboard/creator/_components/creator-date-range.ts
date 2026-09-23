import datePickerZhCN from 'antd/es/date-picker/locale/zh_CN';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import zhCnDayjsLocale from 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';

export const BUSINESS_WEEK_LOCALE = 'zh-cn-business-week';
const CREATOR_WEEKDAY_LABELS_SUN_FIRST = ['日', '一', '二', '三', '四', '五', '六'];

dayjs.extend(isoWeek);

dayjs.locale(
  {
    ...zhCnDayjsLocale,
    name: BUSINESS_WEEK_LOCALE,
    weekStart: 6,
    weekdaysMin: CREATOR_WEEKDAY_LABELS_SUN_FIRST,
  },
  undefined,
  true
);

export const CREATOR_WEEK_PICKER_LOCALE = {
  ...datePickerZhCN,
  lang: {
    ...datePickerZhCN.lang,
    locale: BUSINESS_WEEK_LOCALE,
    shortWeekDays: CREATOR_WEEKDAY_LABELS_SUN_FIRST,
  },
};

export type DateMode = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface DateRange {
  start: Dayjs;
  end: Dayjs;
}

export type CreatorAvailableDateBounds = {
  minDate: Dayjs | null;
  maxDate: Dayjs | null;
};

export const EMPTY_CREATOR_DATE_BOUNDS: CreatorAvailableDateBounds = {
  minDate: null,
  maxDate: null,
};

export const DATE_MODE_OPTIONS: ReadonlyArray<{ key: DateMode; label: string }> = [
  { key: 'month', label: '月' },
  { key: 'week', label: '周' },
  { key: 'day', label: '日' },
  { key: 'year', label: '年' },
  { key: 'custom', label: '自定义' },
];

type PeriodUnit = 'week' | 'month' | 'year';

export function hasUsableCreatorDateBounds(bounds?: CreatorAvailableDateBounds | null): boolean {
  return Boolean(bounds?.minDate && bounds?.maxDate);
}

function hasAnyCreatorDateBound(bounds?: CreatorAvailableDateBounds | null): boolean {
  return Boolean(bounds?.minDate || bounds?.maxDate);
}

function resolvePeriodBounds(value: Dayjs, unit: PeriodUnit): DateRange {
  const localizedValue = unit === 'week' ? value.locale(BUSINESS_WEEK_LOCALE) : value;
  return {
    start: localizedValue.startOf(unit).startOf('day'),
    end: localizedValue.endOf(unit).startOf('day'),
  };
}

export function clampDateToCreatorBounds(
  value: Dayjs,
  bounds?: CreatorAvailableDateBounds | null
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

export function clampPickerValueToCreatorBounds(
  value: Dayjs,
  unit: PeriodUnit,
  bounds?: CreatorAvailableDateBounds | null
): Dayjs {
  if (!hasAnyCreatorDateBound(bounds)) {
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

function intersectRangeWithCreatorBounds(
  range: DateRange,
  bounds?: CreatorAvailableDateBounds | null
): DateRange {
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

export function clampCustomRangeToCreatorBounds(
  customRange: [Dayjs, Dayjs],
  bounds?: CreatorAvailableDateBounds | null
): [Dayjs, Dayjs] {
  let start = clampDateToCreatorBounds(customRange[0], bounds);
  const end = clampDateToCreatorBounds(customRange[1], bounds);

  if (start.isAfter(end, 'day')) {
    start = end;
  }

  return [start, end];
}

function resolvePeriodRange(
  value: Dayjs,
  unit: PeriodUnit,
  bounds?: CreatorAvailableDateBounds | null
): DateRange {
  if (hasAnyCreatorDateBound(bounds)) {
    const clampedValue = clampPickerValueToCreatorBounds(value, unit, bounds);
    return intersectRangeWithCreatorBounds(resolvePeriodBounds(clampedValue, unit), bounds);
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
  availableDateBounds?: CreatorAvailableDateBounds | null
): DateRange {
  if (dateMode === 'day') {
    const day = clampDateToCreatorBounds(dayValue, availableDateBounds);
    return { start: day, end: day };
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

  return intersectRangeWithCreatorBounds({
    start: customRange[0].startOf('day'),
    end: customRange[1].startOf('day'),
  }, availableDateBounds);
}

export function resolvePreviousRange(dateMode: DateMode, current: DateRange): DateRange {
  if (dateMode === 'day') {
    const previousDay = current.start.subtract(1, 'day').startOf('day');
    return { start: previousDay, end: previousDay };
  }

  if (dateMode === 'week') {
    return {
      start: current.start.subtract(7, 'day').startOf('day'),
      end: current.end.subtract(7, 'day').startOf('day'),
    };
  }

  if (dateMode === 'month') {
    const previousMonthStart = current.start.subtract(1, 'month').startOf('month').startOf('day');
    const isFullMonthPeriod =
      current.start.date() === 1 && current.end.isSame(current.start.endOf('month').startOf('day'), 'day');

    if (isFullMonthPeriod) {
      return {
        start: previousMonthStart,
        end: previousMonthStart.endOf('month').startOf('day'),
      };
    }

    const previousPartialStart = current.start.subtract(1, 'month').startOf('day');
    const previousMonthEnd = current.end.subtract(1, 'month').startOf('day');
    return {
      start: previousPartialStart,
      end: previousMonthEnd.isBefore(previousPartialStart, 'day') ? previousPartialStart : previousMonthEnd,
    };
  }

  if (dateMode === 'year') {
    return {
      start: current.start.subtract(1, 'year').startOf('day'),
      end: current.end.subtract(1, 'year').startOf('day'),
    };
  }

  const days = Math.max(current.end.diff(current.start, 'day') + 1, 1);
  const previousEnd = current.start.subtract(1, 'day').startOf('day');
  const previousStart = previousEnd.subtract(days - 1, 'day').startOf('day');

  return {
    start: previousStart,
    end: previousEnd,
  };
}

export function formatDateRangeLabel(range: DateRange): string {
  return `${range.start.format('YYYY-MM-DD')} 至 ${range.end.format('YYYY-MM-DD')}`;
}
