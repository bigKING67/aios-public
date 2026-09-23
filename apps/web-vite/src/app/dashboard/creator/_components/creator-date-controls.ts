'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { CreatorDateModePickerProps } from './creator-date-mode-picker';
import {
  BUSINESS_WEEK_LOCALE,
  clampCustomRangeToCreatorBounds,
  clampDateToCreatorBounds,
  clampPickerValueToCreatorBounds,
  formatDateRangeLabel,
  hasUsableCreatorDateBounds,
  resolveCurrentRange,
  resolvePreviousRange,
  type CreatorAvailableDateBounds,
  type DateMode,
  type DateRange,
} from './creator-date-range';

export interface UseCreatorDashboardDateControlsResult {
  today: Dayjs;
  dateMode: DateMode;
  setDateMode: Dispatch<SetStateAction<DateMode>>;
  dayValue: Dayjs;
  setDayValue: Dispatch<SetStateAction<Dayjs>>;
  weekValue: Dayjs;
  setWeekValue: Dispatch<SetStateAction<Dayjs>>;
  monthValue: Dayjs;
  setMonthValue: Dispatch<SetStateAction<Dayjs>>;
  yearValue: Dayjs;
  setYearValue: Dispatch<SetStateAction<Dayjs>>;
  customRange: [Dayjs, Dayjs];
  setCustomRange: Dispatch<SetStateAction<[Dayjs, Dayjs]>>;
  datePickerProps: CreatorDateModePickerProps;
  currentRange: DateRange;
  previousRange: DateRange;
  currentRangeLabel: string;
}

export function useCreatorDashboardDateControls(
  availableDateBounds?: CreatorAvailableDateBounds | null
): UseCreatorDashboardDateControlsResult {
  const today = useMemo(() => dayjs().startOf('day'), []);
  const [dateMode, setDateMode] = useState<DateMode>('month');
  const [dayValue, setDayValue] = useState<Dayjs>(today.subtract(1, 'day'));
  const [weekValue, setWeekValue] = useState<Dayjs>(today.locale(BUSINESS_WEEK_LOCALE));
  const [monthValue, setMonthValue] = useState<Dayjs>(today.startOf('month'));
  const [yearValue, setYearValue] = useState<Dayjs>(today.startOf('year'));
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>(() => {
    const fallbackEnd = today.subtract(1, 'day').startOf('day');
    const fallbackStart = fallbackEnd.subtract(364, 'day').startOf('day');
    return [fallbackStart, fallbackEnd];
  });
  const isDateBoundsReady = hasUsableCreatorDateBounds(availableDateBounds);

  useEffect(() => {
    if (!isDateBoundsReady) {
      return;
    }

    setDayValue((previousValue) => {
      const nextValue = clampDateToCreatorBounds(previousValue, availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setWeekValue((previousValue) => {
      const nextValue = clampPickerValueToCreatorBounds(
        previousValue,
        'week',
        availableDateBounds
      ).locale(BUSINESS_WEEK_LOCALE);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setMonthValue((previousValue) => {
      const nextValue = clampPickerValueToCreatorBounds(previousValue, 'month', availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setYearValue((previousValue) => {
      const nextValue = clampPickerValueToCreatorBounds(previousValue, 'year', availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setCustomRange((previousValue) => {
      const nextValue = clampCustomRangeToCreatorBounds(previousValue, availableDateBounds);
      return previousValue[0].isSame(nextValue[0], 'day') &&
        previousValue[1].isSame(nextValue[1], 'day')
        ? previousValue
        : nextValue;
    });
  }, [availableDateBounds, isDateBoundsReady]);

  const currentRange = useMemo(
    () => resolveCurrentRange(
      dateMode,
      dayValue,
      weekValue,
      monthValue,
      yearValue,
      customRange,
      availableDateBounds
    ),
    [availableDateBounds, customRange, dateMode, dayValue, monthValue, weekValue, yearValue]
  );
  const previousRange = useMemo(() => resolvePreviousRange(dateMode, currentRange), [currentRange, dateMode]);
  const currentRangeLabel = useMemo(() => formatDateRangeLabel(currentRange), [currentRange]);
  const datePickerProps = useMemo<CreatorDateModePickerProps>(
    () => ({
      dateMode,
      dayValue,
      weekValue,
      monthValue,
      yearValue,
      customRange,
      availableDateBounds,
      isDateBoundsReady,
      onDayValueChange: setDayValue,
      onWeekValueChange: setWeekValue,
      onMonthValueChange: setMonthValue,
      onYearValueChange: setYearValue,
      onCustomRangeChange: setCustomRange,
    }),
    [availableDateBounds, customRange, dateMode, dayValue, isDateBoundsReady, monthValue, weekValue, yearValue]
  );

  return {
    today,
    dateMode,
    setDateMode,
    dayValue,
    setDayValue,
    weekValue,
    setWeekValue,
    monthValue,
    setMonthValue,
    yearValue,
    setYearValue,
    customRange,
    setCustomRange,
    datePickerProps,
    currentRange,
    previousRange,
    currentRangeLabel,
  };
}
