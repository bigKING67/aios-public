import type { ReactNode } from 'react';
import type { WeeklyKpiTrendItem } from './weekly-primitives';

export interface BuildWeeklyKpiTrendItemsInput {
  wow?: number;
  yoy?: number;
  wowDisplayValue?: ReactNode;
  yoyDisplayValue?: ReactNode;
}

const WEEKLY_KPI_TREND_LABELS = {
  wow: '环比（同期）',
  yoy: '同比',
} as const;

export function buildWeeklyKpiTrendItems({
  wow,
  yoy,
  wowDisplayValue,
  yoyDisplayValue,
}: BuildWeeklyKpiTrendItemsInput): WeeklyKpiTrendItem[] {
  return [
    {
      key: 'wow',
      label: WEEKLY_KPI_TREND_LABELS.wow,
      value: wow,
      displayValue: wowDisplayValue,
    },
    {
      key: 'yoy',
      label: WEEKLY_KPI_TREND_LABELS.yoy,
      value: yoy,
      displayValue: yoyDisplayValue,
    },
  ];
}
