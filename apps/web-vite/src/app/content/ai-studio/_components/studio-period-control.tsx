import { Button, DayjsDatePicker, DayjsDateRangePicker, Segmented, datePickerLocaleZhCN } from '@lobehub/ui';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StudioOverviewPeriod } from '../_lib/ai-studio-api';
import {
  MAX_CUSTOM_DAYS,
  PERIOD_UNITS,
  type CalendarUnit,
  type PeriodSelection,
  type PeriodUnit,
  periodRangeText,
  shiftPeriodDate,
  yesterdayDate,
} from '../_lib/studio-period';
import home from './studio-home.module.css';

const UNIT_NAMES: Record<CalendarUnit, string> = { day: '天', month: '个月', year: '年' };
const ISO = 'YYYY-MM-DD';

/**
 * 日 / 月 / 年 / 自定义 with the dates they cover on the left: the picker shows the resolved range,
 * not the anchor, and ‹ › step one period. Nothing after today can be picked.
 */
export function StudioPeriodControl({
  selection,
  period,
  onChange,
}: {
  selection: PeriodSelection;
  /** The period the server resolved; may still be the previous selection's while loading. */
  period: StudioOverviewPeriod | undefined;
  onChange: (next: PeriodSelection) => void;
}) {
  const today = dayjs(period?.today);
  const afterToday = (date: Dayjs) => date.isAfter(today, 'day');
  const changeUnit = (unit: PeriodUnit) => {
    if (unit !== 'custom') {
      // Every unit lands on the one holding yesterday (on the 1st, 月 is last month).
      onChange({ unit, date: yesterdayDate(period?.today) });
      return;
    }
    // Start from the dates on screen, so 自定义 refines what was being read.
    const from = period?.from ?? today.format(ISO);
    onChange({ unit, from, to: period?.to ?? from });
  };

  return (
    <div className={home.periodControl} role="group" aria-label="统计时间">
      {selection.unit === 'custom' ? (
        <DayjsDateRangePicker
          size="small"
          variant="borderless"
          className={home.periodRange}
          value={[dayjs(selection.from), dayjs(selection.to)]}
          locale={datePickerLocaleZhCN}
          allowClear={false}
          format="YYYY/MM/DD"
          disabledDate={(date, info) =>
            afterToday(date) || (info.from ? Math.abs(date.diff(info.from, 'day')) >= MAX_CUSTOM_DAYS : false)
          }
          onChange={(values) => {
            const [from, to] = values ?? [];
            if (from && to) onChange({ unit: 'custom', from: from.format(ISO), to: to.format(ISO) });
          }}
        />
      ) : (
        <CalendarPeriod unit={selection.unit} period={period?.key === selection.unit ? period : undefined} onChange={onChange} />
      )}
      <Segmented<PeriodUnit>
        size="small"
        value={selection.unit}
        options={PERIOD_UNITS.map((option) => ({ ...option }))}
        onChange={changeUnit}
      />
    </div>
  );
}

function CalendarPeriod({
  unit,
  period,
  onChange,
}: {
  unit: CalendarUnit;
  /** Undefined until the server has resolved this unit's dates. */
  period: StudioOverviewPeriod | undefined;
  onChange: (next: PeriodSelection) => void;
}) {
  const previous = period ? shiftPeriodDate(period, unit, -1) : null;
  const next = period ? shiftPeriodDate(period, unit, 1) : null;
  const today = dayjs(period?.today);
  return (
    <span className={home.periodStepper}>
      <Button
        type="text"
        size="small"
        icon={<ChevronLeft size={14} strokeWidth={1.8} aria-hidden="true" />}
        aria-label={`上一${UNIT_NAMES[unit]}`}
        disabled={!previous}
        onClick={() => previous && onChange({ unit, date: previous })}
      />
      <DayjsDatePicker
        size="small"
        variant="borderless"
        className={home.periodPicker}
        picker={unit === 'day' ? 'date' : unit}
        value={period ? dayjs(period.from) : null}
        // The field reads as the covered dates (2026/10/01 - 2026/10/26) rather than the anchor.
        format={() => (period ? periodRangeText(period) : '')}
        placeholder="读取中"
        locale={datePickerLocaleZhCN}
        allowClear={false}
        disabled={!period}
        disabledDate={(date) => date.startOf(unit).isAfter(today, 'day')}
        onChange={(value) => {
          if (value) onChange({ unit, date: value.format(ISO) });
        }}
      />
      <Button
        type="text"
        size="small"
        icon={<ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />}
        aria-label={`下一${UNIT_NAMES[unit]}`}
        disabled={!next}
        onClick={() => next && onChange({ unit, date: next })}
      />
    </span>
  );
}
