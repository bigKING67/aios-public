import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import type { DateMode } from './dashboard-config';
import type { NumericInput } from './dashboard-formatters';
import type {
  DashboardOverviewSeriesRow,
  MonthlyTrendBucket,
} from './dashboard-types';

export function hasNumericInputValue(value: NumericInput): boolean {
  return value !== null && value !== undefined && value !== '';
}

export function toSafeNumber(value: NumericInput): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

export function resolveNumericMetric(primary: NumericInput, fallback: NumericInput): number {
  if (hasNumericInputValue(primary)) {
    return toSafeNumber(primary);
  }
  return toSafeNumber(fallback);
}

export function getSeriesRefundAmountPayTimePredicted(row: DashboardOverviewSeriesRow): number {
  return toSafeNumber(row.refund_amount_pay_time_predicted);
}

export function getSeriesGsvPayTimeCurrent(row: DashboardOverviewSeriesRow): number {
  return resolveNumericMetric(row.gsv_pay_time_current, row.gsv);
}

export function getSeriesRefundRatePayTimePredicted(row: DashboardOverviewSeriesRow): number {
  if (hasNumericInputValue(row.refund_rate_pay_time_predicted)) {
    return toSafeNumber(row.refund_rate_pay_time_predicted);
  }
  if (hasNumericInputValue(row.refund_rate)) {
    return toSafeNumber(row.refund_rate);
  }

  const gmv = toSafeNumber(row.gmv);
  const refundAmount = getSeriesRefundAmountPayTimePredicted(row);
  if (gmv <= 0) {
    return 0;
  }
  return refundAmount / gmv;
}

export function aggregateSeriesByMonth(series: DashboardOverviewSeriesRow[]): MonthlyTrendBucket[] {
  const monthBuckets = new Map<
    string,
    {
      monthStart: Dayjs;
      gmv: number;
      gsv: number;
      refundAmount: number;
    }
  >();

  for (const row of series) {
    const date = dayjs(row.date);
    if (!date.isValid()) {
      continue;
    }

    const monthStart = date.startOf('month');
    const key = monthStart.format('YYYY-MM');
    const current = monthBuckets.get(key);
    if (current) {
      current.gmv += toSafeNumber(row.gmv);
      current.gsv += getSeriesGsvPayTimeCurrent(row);
      current.refundAmount += getSeriesRefundAmountPayTimePredicted(row);
    } else {
      monthBuckets.set(key, {
        monthStart,
        gmv: toSafeNumber(row.gmv),
        gsv: getSeriesGsvPayTimeCurrent(row),
        refundAmount: getSeriesRefundAmountPayTimePredicted(row),
      });
    }
  }

  return Array.from(monthBuckets.values())
    .sort((left, right) => left.monthStart.valueOf() - right.monthStart.valueOf())
    .map((item) => ({
      monthKey: item.monthStart.format('YYYY-MM'),
      monthToken: item.monthStart.format('MM'),
      label: item.monthStart.format('MM月'),
      gmv: item.gmv,
      gsv: item.gsv,
      refundAmount: item.refundAmount,
    }));
}

export function buildTrendLabels(mode: DateMode, customRange: [Dayjs, Dayjs]): string[] {
  if (mode === 'day') {
    return ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  }

  if (mode === 'week') {
    return ['周六', '周日', '周一', '周二', '周三', '周四', '周五'];
  }

  if (mode === 'month') {
    return ['第1周', '第2周', '第3周', '第4周', '第5周'];
  }

  if (mode === 'year') {
    return ['01月', '02月', '03月', '04月', '05月', '06月', '07月', '08月', '09月', '10月', '11月', '12月'];
  }

  const [start, end] = customRange;
  const totalDays = Math.max(2, end.diff(start, 'day') + 1);
  const points = Math.min(10, totalDays);
  const step = Math.max(1, Math.floor(totalDays / points));
  return Array.from({ length: points }, (_, index) => {
    const dayOffset = Math.min(index * step, totalDays - 1);
    return start.add(dayOffset, 'day').format('MM-DD');
  });
}

export function calculatePeriodChange(currentValue: number, previousValue: number): number {
  if (Math.abs(previousValue) < 0.000001) {
    if (Math.abs(currentValue) < 0.000001) {
      return 0;
    }
    return 100;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}
