import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import type { DashboardOverviewSeriesRow } from './dashboard-types';
import {
  buildDashboardCustomMonthTrend,
  buildDashboardTrendContext,
  resolveDefaultCustomTrendGranularity,
} from './dashboard-trend-context';
import { formatDashboardTrendTooltip } from './dashboard-trend-tooltip';

function buildTrendRow(
  date: string,
  gmv: number,
  gsv: number
): DashboardOverviewSeriesRow {
  return {
    date,
    gmv,
    user_pay_amount: gmv,
    gsv_pay_time_current: gsv,
    gsv_pay_time_predicted: gsv,
    gsv_refund_time: gsv,
    refund_amount_pay_time_current: gmv - gsv,
    refund_amount_pay_time_predicted: gmv - gsv,
    refund_amount_refund_time: gmv - gsv,
    refund_rate_pay_time_current: gmv > 0 ? (gmv - gsv) / gmv : 0,
    refund_rate_pay_time_predicted: gmv > 0 ? (gmv - gsv) / gmv : 0,
    refund_rate_refund_time: gmv > 0 ? (gmv - gsv) / gmv : 0,
    gsv,
    refund_rate: gmv > 0 ? (gmv - gsv) / gmv : 0,
    order_count: 1,
    buyer_count: 1,
  };
}

describe('dashboard custom trend granularity', () => {
  it('defaults ranges longer than 90 inclusive days to month view', () => {
    expect(resolveDefaultCustomTrendGranularity({
      rangeStart: dayjs('2026-01-01'),
      rangeEnd: dayjs('2026-03-31'),
    })).toBe('day');

    expect(resolveDefaultCustomTrendGranularity({
      rangeStart: dayjs('2026-01-01'),
      rangeEnd: dayjs('2026-04-01'),
    })).toBe('month');
  });

  it('aggregates by natural month across years and retains empty months', () => {
    const trend = buildDashboardCustomMonthTrend({
      rangeStart: dayjs('2025-11-15'),
      rangeEnd: dayjs('2026-02-10'),
      rows: [
        buildTrendRow('2025-11-14', 999, 999),
        buildTrendRow('2025-11-15', 100, 90),
        buildTrendRow('2025-11-30', 50, 40),
        buildTrendRow('2025-12-01', 200, 180),
        buildTrendRow('2026-02-10', 300, 250),
        buildTrendRow('2026-02-11', 999, 999),
      ],
    });

    expect(trend).toEqual({
      labels: ['2025/11', '2025/12', '2026/01', '2026/02'],
      tooltipLabels: [
        '2025年11月（从11/15）',
        '2025年12月',
        '2026年01月',
        '2026年02月（截至02/10）',
      ],
      gmv: [150, 200, 0, 300],
      gsv: [130, 180, 0, 250],
    });
  });

  it('builds a bar context for custom month and a dated line context for custom day', () => {
    const rows = [buildTrendRow('2025-12-31', 100, 80), buildTrendRow('2026-01-01', 200, 170)];
    const monthTrend = buildDashboardCustomMonthTrend({
      rangeStart: dayjs('2025-12-31'),
      rangeEnd: dayjs('2026-01-01'),
      rows,
    });
    const shared = {
      dateMode: 'custom' as const,
      customTrendRows: rows,
      dayYearTrendSeries: [],
      snapshotTrendLabels: [],
      snapshotTrendCurrent: [],
      snapshotGsvSeries: [],
      weekYtdTrend: null,
      monthYtdTrend: null,
    };

    const monthContext = buildDashboardTrendContext({
      ...shared,
      customTrendGranularity: 'month',
      customMonthTrend: monthTrend,
    });
    expect(monthContext.chartType).toBe('bar');
    expect(monthContext.labels).toEqual(['2025/12', '2026/01']);
    expect(monthContext.primarySeries).toEqual([100, 200]);

    const dayContext = buildDashboardTrendContext({
      ...shared,
      customTrendGranularity: 'day',
      customMonthTrend: null,
    });
    expect(dayContext.chartType).toBe('line');
    expect(dayContext.labels).toEqual(['12/31', '01/01']);
    expect(dayContext.tooltipLabels).toEqual(['2025年12月31日', '2026年01月01日']);
    expect(dayContext.dateKeys).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('uses the full monthly label in the tooltip instead of the compact axis label', () => {
    const tooltip = formatDashboardTrendTooltip({
      tooltipParams: [{
        axisValueLabel: '2026/02',
        dataIndex: 0,
        marker: '●',
        seriesName: 'GMV',
        value: 300,
      }],
      tooltipLabels: ['2026年02月（截至02/10）'],
      dateKeys: [],
      countsByDate: {},
      showNoteMarkers: false,
      warningColor: ECHARTS_CHART_TOKENS.warningSeries,
    });

    expect(tooltip).toContain('2026年02月（截至02/10）');
    expect(tooltip).not.toContain('<div>2026/02</div>');
  });
});
