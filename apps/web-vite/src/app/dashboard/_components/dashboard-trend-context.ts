import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import type { DateMode } from './dashboard-config';
import { BUSINESS_WEEK_LOCALE } from './dashboard-date-range';
import type { NumericInput } from './dashboard-formatters';
import { aggregateSeriesByMonth } from './dashboard-overview-snapshot-calculations';
import type { DashboardOverviewSeriesRow } from './dashboard-types';
import type { DashboardTrendOptionContext } from './dashboard-trend-option';

export interface DashboardAggregatedTrend {
  labels: string[];
  gmv: number[];
  gsv: number[];
  tooltipLabels?: string[];
}

export type DashboardCustomTrendGranularity = 'day' | 'month';

export const CUSTOM_TREND_MONTH_DEFAULT_THRESHOLD_DAYS = 90;

export interface DashboardDayMiniTrendWindow {
  labels: string[];
  gmv: number[];
  userPayAmount: number[];
  gsv: number[];
  refundRate: number[];
}

export interface DashboardTrendContext extends DashboardTrendOptionContext {
  title: string;
}

function hasNumericTrendInputValue(value: NumericInput): boolean {
  return value !== null && value !== undefined && value !== '';
}

function toSafeTrendNumber(value: NumericInput): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function resolveNumericTrendMetric(primary: NumericInput, fallback: NumericInput): number {
  if (hasNumericTrendInputValue(primary)) {
    return toSafeTrendNumber(primary);
  }
  return toSafeTrendNumber(fallback);
}

function getTrendSeriesUserPayAmount(row: DashboardOverviewSeriesRow): number {
  return toSafeTrendNumber(row.user_pay_amount);
}

function getTrendSeriesRefundAmountPayTimeCurrent(row: DashboardOverviewSeriesRow): number {
  return toSafeTrendNumber(row.refund_amount_pay_time_current);
}

function getTrendSeriesGsvPayTimeCurrent(row: DashboardOverviewSeriesRow): number {
  return resolveNumericTrendMetric(row.gsv_pay_time_current, row.gsv);
}

function getTrendSeriesRefundRatePayTimeCurrent(row: DashboardOverviewSeriesRow): number {
  if (hasNumericTrendInputValue(row.refund_rate_pay_time_current)) {
    return toSafeTrendNumber(row.refund_rate_pay_time_current);
  }
  if (hasNumericTrendInputValue(row.refund_rate)) {
    return toSafeTrendNumber(row.refund_rate);
  }

  const gmv = toSafeTrendNumber(row.gmv);
  const refundAmount = getTrendSeriesRefundAmountPayTimeCurrent(row);
  if (gmv <= 0) {
    return 0;
  }
  return refundAmount / gmv;
}

export function resolveDefaultCustomTrendGranularity(params: {
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
}): DashboardCustomTrendGranularity {
  const inclusiveDays = params.rangeEnd.startOf('day').diff(params.rangeStart.startOf('day'), 'day') + 1;
  return inclusiveDays > CUSTOM_TREND_MONTH_DEFAULT_THRESHOLD_DAYS ? 'month' : 'day';
}

function buildCustomMonthTooltipLabel(params: {
  monthStart: Dayjs;
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
}): string {
  const monthLabel = params.monthStart.format('YYYY年MM月');
  const isStartMonth = params.monthStart.isSame(params.rangeStart.startOf('month'), 'month');
  const isEndMonth = params.monthStart.isSame(params.rangeEnd.startOf('month'), 'month');
  const hasPartialStart = isStartMonth && !params.rangeStart.isSame(params.rangeStart.startOf('month'), 'day');
  const hasPartialEnd = isEndMonth && !params.rangeEnd.isSame(params.rangeEnd.endOf('month'), 'day');

  if (hasPartialStart && hasPartialEnd) {
    return `${monthLabel}（${params.rangeStart.format('MM/DD')}–${params.rangeEnd.format('MM/DD')}）`;
  }
  if (hasPartialStart) {
    return `${monthLabel}（从${params.rangeStart.format('MM/DD')}）`;
  }
  if (hasPartialEnd) {
    return `${monthLabel}（截至${params.rangeEnd.format('MM/DD')}）`;
  }
  return monthLabel;
}

export function buildDashboardCustomMonthTrend(params: {
  rows: readonly DashboardOverviewSeriesRow[];
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
}): DashboardAggregatedTrend | null {
  const rangeStart = params.rangeStart.startOf('day');
  const rangeEnd = params.rangeEnd.startOf('day');
  if (!rangeStart.isValid() || !rangeEnd.isValid() || rangeEnd.isBefore(rangeStart, 'day')) {
    return null;
  }

  const rowsInRange = params.rows.filter((row) => {
    const date = dayjs(row.date).startOf('day');
    return date.isValid() && !date.isBefore(rangeStart, 'day') && !date.isAfter(rangeEnd, 'day');
  });
  const monthBuckets = new Map(
    aggregateSeriesByMonth(rowsInRange).map((bucket) => [bucket.monthKey, bucket])
  );

  const labels: string[] = [];
  const tooltipLabels: string[] = [];
  const gmv: number[] = [];
  const gsv: number[] = [];
  let cursor = rangeStart.startOf('month');
  const endMonth = rangeEnd.startOf('month');

  while (!cursor.isAfter(endMonth, 'month')) {
    const bucket = monthBuckets.get(cursor.format('YYYY-MM'));
    labels.push(cursor.format('YYYY/MM'));
    tooltipLabels.push(buildCustomMonthTooltipLabel({
      monthStart: cursor,
      rangeStart,
      rangeEnd,
    }));
    gmv.push(Number((bucket?.gmv || 0).toFixed(2)));
    gsv.push(Number((bucket?.gsv || 0).toFixed(2)));
    cursor = cursor.add(1, 'month');
  }

  return {
    labels,
    tooltipLabels,
    gmv,
    gsv,
  };
}

export function buildDashboardWeekYtdTrend(rows: readonly DashboardOverviewSeriesRow[]): DashboardAggregatedTrend | null {
  if (rows.length === 0) {
    return null;
  }

  const weekBuckets = new Map<string, { weekStart: Dayjs; gmv: number; gsv: number }>();

  for (const row of rows) {
    const date = dayjs(row.date);
    if (!date.isValid()) {
      continue;
    }

    const weekStart = date.locale(BUSINESS_WEEK_LOCALE).startOf('week').startOf('day');
    const key = weekStart.format('YYYY-MM-DD');
    const current = weekBuckets.get(key);

    if (current) {
      current.gmv += toSafeTrendNumber(row.gmv);
      current.gsv += getTrendSeriesGsvPayTimeCurrent(row);
    } else {
      weekBuckets.set(key, {
        weekStart,
        gmv: toSafeTrendNumber(row.gmv),
        gsv: getTrendSeriesGsvPayTimeCurrent(row),
      });
    }
  }

  const ordered = Array.from(weekBuckets.values()).sort(
    (left, right) => left.weekStart.valueOf() - right.weekStart.valueOf()
  );

  return {
    labels: ordered.map((item) => item.weekStart.format('MM/DD')),
    gmv: ordered.map((item) => Number(item.gmv.toFixed(2))),
    gsv: ordered.map((item) => Number(item.gsv.toFixed(2))),
  };
}

export function buildDashboardMonthYtdTrend(params: {
  dateMode: DateMode;
  rows: readonly DashboardOverviewSeriesRow[];
  currentRangeEnd: Dayjs;
}): DashboardAggregatedTrend | null {
  if (params.dateMode !== 'month' || params.rows.length === 0) {
    return null;
  }

  const monthBuckets = new Map<string, { gmv: number; gsv: number }>();
  for (const row of params.rows) {
    const date = dayjs(row.date);
    if (!date.isValid()) {
      continue;
    }
    const key = date.startOf('month').format('YYYY-MM');
    const current = monthBuckets.get(key);
    if (current) {
      current.gmv += toSafeTrendNumber(row.gmv);
      current.gsv += getTrendSeriesGsvPayTimeCurrent(row);
    } else {
      monthBuckets.set(key, {
        gmv: toSafeTrendNumber(row.gmv),
        gsv: getTrendSeriesGsvPayTimeCurrent(row),
      });
    }
  }

  const startMonth = params.currentRangeEnd.startOf('year').startOf('month');
  const endMonth = params.currentRangeEnd.startOf('month');
  const labels: string[] = [];
  const gmv: number[] = [];
  const gsv: number[] = [];

  let cursor = startMonth;
  while (!cursor.isAfter(endMonth, 'month')) {
    const key = cursor.format('YYYY-MM');
    const bucket = monthBuckets.get(key);
    labels.push(cursor.format('MM月'));
    gmv.push(Number((bucket?.gmv || 0).toFixed(2)));
    gsv.push(Number((bucket?.gsv || 0).toFixed(2)));
    cursor = cursor.add(1, 'month');
  }

  return {
    labels,
    gmv,
    gsv,
  };
}

export function buildDashboardTrendContext(params: {
  dateMode: DateMode;
  customTrendGranularity: DashboardCustomTrendGranularity;
  customTrendRows: readonly DashboardOverviewSeriesRow[];
  customMonthTrend: DashboardAggregatedTrend | null;
  dayYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  snapshotTrendLabels: readonly string[];
  snapshotTrendCurrent: readonly number[];
  snapshotGsvSeries: readonly number[];
  weekYtdTrend: DashboardAggregatedTrend | null;
  monthYtdTrend: DashboardAggregatedTrend | null;
}): DashboardTrendContext {
  const secondaryColor = ECHARTS_CHART_TOKENS.secondarySeries;
  const dayYtdAvailable = params.dayYearTrendSeries.length > 0;

  if (params.dateMode === 'day') {
    return {
      title: '日趋势',
      chartType: 'line',
      labels: dayYtdAvailable
        ? params.dayYearTrendSeries.map((item) => dayjs(item.date).format('MM/DD'))
        : params.snapshotTrendLabels,
      primarySeries: dayYtdAvailable
        ? params.dayYearTrendSeries.map((item) => toSafeTrendNumber(item.gmv))
        : params.snapshotTrendCurrent,
      secondarySeries: dayYtdAvailable
        ? params.dayYearTrendSeries.map((item) => getTrendSeriesGsvPayTimeCurrent(item))
        : params.snapshotGsvSeries,
      dateKeys: dayYtdAvailable
        ? params.dayYearTrendSeries.map((item) => dayjs(item.date).format('YYYY-MM-DD'))
        : [],
      primaryLabel: 'GMV',
      secondaryLabel: 'GSV（支付时间）',
      secondaryColor,
    };
  }

  if (params.dateMode === 'week') {
    const weekYtdAvailable = Boolean(params.weekYtdTrend && params.weekYtdTrend.labels.length > 0);
    const weekYtdLabels = params.weekYtdTrend?.labels || [];
    const weekYtdGmv = params.weekYtdTrend?.gmv || [];
    const weekYtdGsv = params.weekYtdTrend?.gsv || [];
    return {
      title: '周趋势',
      chartType: 'line',
      labels: weekYtdAvailable ? weekYtdLabels : params.snapshotTrendLabels,
      primarySeries: weekYtdAvailable ? weekYtdGmv : params.snapshotTrendCurrent,
      secondarySeries: weekYtdAvailable ? weekYtdGsv : params.snapshotGsvSeries,
      dateKeys: [],
      primaryLabel: 'GMV',
      secondaryLabel: 'GSV（支付时间）',
      secondaryColor,
    };
  }

  if (params.dateMode === 'month') {
    const monthYtdAvailable = Boolean(params.monthYtdTrend && params.monthYtdTrend.labels.length > 0);
    return {
      title: '月趋势',
      chartType: 'bar',
      labels: monthYtdAvailable ? params.monthYtdTrend?.labels || [] : params.snapshotTrendLabels,
      primarySeries: monthYtdAvailable ? params.monthYtdTrend?.gmv || [] : params.snapshotTrendCurrent,
      secondarySeries: monthYtdAvailable ? params.monthYtdTrend?.gsv || [] : params.snapshotGsvSeries,
      dateKeys: [],
      primaryLabel: 'GMV',
      secondaryLabel: 'GSV（支付时间）',
      secondaryColor,
    };
  }

  if (params.dateMode === 'year') {
    return {
      title: '年趋势',
      chartType: 'bar',
      labels: params.snapshotTrendLabels,
      primarySeries: params.snapshotTrendCurrent,
      secondarySeries: params.snapshotGsvSeries,
      dateKeys: [],
      primaryLabel: 'GMV',
      secondaryLabel: 'GSV（支付时间）',
      secondaryColor,
    };
  }

  if (params.customTrendGranularity === 'month' && params.customMonthTrend) {
    return {
      title: '区间趋势',
      chartType: 'bar',
      labels: params.customMonthTrend.labels,
      tooltipLabels: params.customMonthTrend.tooltipLabels,
      primarySeries: params.customMonthTrend.gmv,
      secondarySeries: params.customMonthTrend.gsv,
      dateKeys: [],
      primaryLabel: 'GMV',
      secondaryLabel: 'GSV（支付时间）',
      secondaryColor,
    };
  }

  const customDailyAvailable = params.customTrendRows.length > 0;

  return {
    title: '区间趋势',
    chartType: 'line',
    labels: customDailyAvailable
      ? params.customTrendRows.map((item) => dayjs(item.date).format('MM/DD'))
      : params.snapshotTrendLabels,
    tooltipLabels: customDailyAvailable
      ? params.customTrendRows.map((item) => dayjs(item.date).format('YYYY年MM月DD日'))
      : undefined,
    primarySeries: customDailyAvailable
      ? params.customTrendRows.map((item) => toSafeTrendNumber(item.gmv))
      : params.snapshotTrendCurrent,
    secondarySeries: customDailyAvailable
      ? params.customTrendRows.map((item) => getTrendSeriesGsvPayTimeCurrent(item))
      : params.snapshotGsvSeries,
    dateKeys: customDailyAvailable
      ? params.customTrendRows.map((item) => dayjs(item.date).format('YYYY-MM-DD'))
      : [],
    primaryLabel: 'GMV',
    secondaryLabel: 'GSV（支付时间）',
    secondaryColor,
  };
}

export function buildDashboardDayMiniTrendWindow(params: {
  dateMode: DateMode;
  dayYearTrendSeries: readonly DashboardOverviewSeriesRow[];
}): DashboardDayMiniTrendWindow | null {
  if (params.dateMode !== 'day' || params.dayYearTrendSeries.length === 0) {
    return null;
  }

  const rows = params.dayYearTrendSeries.slice(-7);
  const labels = rows.map((item) => dayjs(item.date).format('MM/DD'));
  const gmv = rows.map((item) => toSafeTrendNumber(item.gmv));
  const userPayAmount = rows.map((item) => getTrendSeriesUserPayAmount(item));
  const gsv = rows.map((item) => getTrendSeriesGsvPayTimeCurrent(item));
  const refundRate = rows.map((item) => {
    return Number((getTrendSeriesRefundRatePayTimeCurrent(item) * 100).toFixed(2));
  });

  return {
    labels,
    gmv,
    userPayAmount,
    gsv,
    refundRate,
  };
}
