'use client';

import { DayjsDatePicker, DayjsDateRangePicker, datePickerLocaleZhCN } from '@lobehub/ui';
import type { Dayjs } from 'dayjs';
import {
  BUSINESS_WEEK_LOCALE,
  CREATOR_WEEK_PICKER_LOCALE,
  type CreatorAvailableDateBounds,
  type DateMode,
} from './creator-date-range';
import styles from './creator-live-dashboard.module.css';

type CreatorDatePickerPeriodUnit = 'week' | 'month' | 'year';

export interface CreatorDateModePickerProps {
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  availableDateBounds?: CreatorAvailableDateBounds | null;
  isDateBoundsReady: boolean;
  onDayValueChange: (value: Dayjs) => void;
  onWeekValueChange: (value: Dayjs) => void;
  onMonthValueChange: (value: Dayjs) => void;
  onYearValueChange: (value: Dayjs) => void;
  onCustomRangeChange: (value: [Dayjs, Dayjs]) => void;
}

export function CreatorDateModePicker({
  dateMode,
  dayValue,
  weekValue,
  monthValue,
  yearValue,
  customRange,
  availableDateBounds,
  isDateBoundsReady,
  onDayValueChange,
  onWeekValueChange,
  onMonthValueChange,
  onYearValueChange,
  onCustomRangeChange,
}: CreatorDateModePickerProps) {
  const disabledDayDate = (currentDate: Dayjs) => {
    const normalizedDate = currentDate.startOf('day');
    if (availableDateBounds?.minDate && normalizedDate.isBefore(availableDateBounds.minDate, 'day')) {
      return true;
    }
    if (availableDateBounds?.maxDate && normalizedDate.isAfter(availableDateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };

  const isPeriodDisabled = (currentDate: Dayjs, unit: CreatorDatePickerPeriodUnit) => {
    const normalizedDate = currentDate.startOf('day');
    const periodStart = unit === 'week'
      ? normalizedDate.locale(BUSINESS_WEEK_LOCALE).startOf('week').startOf('day')
      : normalizedDate.startOf(unit).startOf('day');
    const periodEnd = unit === 'week'
      ? normalizedDate.locale(BUSINESS_WEEK_LOCALE).endOf('week').startOf('day')
      : normalizedDate.endOf(unit).startOf('day');

    if (availableDateBounds?.minDate && periodEnd.isBefore(availableDateBounds.minDate, 'day')) {
      return true;
    }
    if (availableDateBounds?.maxDate && periodStart.isAfter(availableDateBounds.maxDate, 'day')) {
      return true;
    }
    return false;
  };

  if (dateMode === 'day') {
    return (
      <DayjsDatePicker
        value={dayValue}
        locale={datePickerLocaleZhCN}
        onChange={(value) => {
          if (value) {
            onDayValueChange(value.startOf('day'));
          }
        }}
        allowClear={false}
        format="YYYY/MM/DD"
        disabled={!isDateBoundsReady}
        disabledDate={disabledDayDate}
      />
    );
  }

  if (dateMode === 'week') {
    return (
      <DayjsDatePicker
        picker="week"
        value={weekValue}
        locale={CREATOR_WEEK_PICKER_LOCALE}
        onChange={(value) => {
          if (value) {
            onWeekValueChange(value.locale(BUSINESS_WEEK_LOCALE));
          }
        }}
        allowClear={false}
        format="YYYY年WW周"
        disabled={!isDateBoundsReady}
        disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'week')}
      />
    );
  }

  if (dateMode === 'month') {
    return (
      <DayjsDatePicker
        picker="month"
        value={monthValue}
        locale={datePickerLocaleZhCN}
        onChange={(value) => {
          if (value) {
            onMonthValueChange(value.startOf('month'));
          }
        }}
        allowClear={false}
        format="YYYY/MM"
        disabled={!isDateBoundsReady}
        disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'month')}
      />
    );
  }

  if (dateMode === 'year') {
    return (
      <DayjsDatePicker
        picker="year"
        value={yearValue}
        locale={datePickerLocaleZhCN}
        onChange={(value) => {
          if (value) {
            onYearValueChange(value.startOf('year'));
          }
        }}
        allowClear={false}
        format="YYYY"
        disabled={!isDateBoundsReady}
        disabledDate={(currentDate) => isPeriodDisabled(currentDate, 'year')}
      />
    );
  }

  return (
    <div className={styles.customRangeWrap}>
      <DayjsDateRangePicker
        value={customRange}
        locale={datePickerLocaleZhCN}
        allowClear={false}
        format="YYYY/MM/DD"
        disabled={!isDateBoundsReady}
        disabledDate={disabledDayDate}
        onChange={(values) => {
          if (values && values[0] && values[1]) {
            const start = values[0].startOf('day');
            const end = values[1].startOf('day');
            if (!start.isAfter(end)) {
              onCustomRangeChange([start, end]);
            }
          }
        }}
      />
    </div>
  );
}
