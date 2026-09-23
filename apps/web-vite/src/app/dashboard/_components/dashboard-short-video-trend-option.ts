import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import { formatTableNumber, toCompactNumber } from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { toSortableNumber } from './dashboard-sorters';
import type { DashboardShortVideoTrendRow } from './dashboard-types';

export interface DashboardShortVideoChartTokens {
  textSecondary: string;
  textTertiary: string;
  axisLine: string;
  gridLine: string;
  primarySeries: string;
  secondarySeries: string;
  warningSeries: string;
}

function toSafeNumber(value: NumericInput): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

export function buildDashboardShortVideoTrendOption({
  rows,
  chartTokens,
}: {
  rows: DashboardShortVideoTrendRow[];
  chartTokens: DashboardShortVideoChartTokens;
}): EChartsCoreOption {
  const labels = rows.map((item) => dayjs(item.date).format('MM/DD'));
  const gmvSeries = rows.map((item) => toSafeNumber(item.shortvideo_gmv));
  const gsvSeries = rows.map((item) => toSafeNumber(item.shortvideo_gsv));
  const gpvSeries = rows.map((item) => toSortableNumber(item.gpv));
  const gmvColor = chartTokens.primarySeries;
  const gsvColor = chartTokens.secondarySeries;
  const gpvColor = chartTokens.warningSeries;

  return {
    grid: {
      left: '3%',
      right: '4%',
      top: '12%',
      bottom: '6%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params];
        const normalized = items as Array<{
          marker?: string;
          seriesName?: string;
          axisValueLabel?: string;
          name?: string;
          value?: unknown;
        }>;
        if (!normalized.length) {
          return '';
        }

        const title = normalized[0]?.axisValueLabel || normalized[0]?.name || '--';
        const lines = [`<div>${title}</div>`];
        normalized.forEach((item) => {
          const rawValue = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
          const parsedValue = rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);
          const valueText =
            parsedValue === null || !Number.isFinite(parsedValue)
              ? '--'
              : item.seriesName === 'GPV'
                ? formatTableNumber(parsedValue, 2)
                : toCompactNumber(parsedValue);
          lines.push(`${item.marker || ''}${item.seriesName || '--'}：${valueText}`);
        });
        return lines.join('<br/>');
      },
    },
    legend: {
      left: 'center',
      top: 4,
      textStyle: {
        color: chartTokens.textSecondary,
        fontSize: 12,
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: chartTokens.axisLine } },
      axisLabel: {
        color: chartTokens.textTertiary,
        hideOverlap: true,
      },
    },
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: chartTokens.gridLine, type: 'dashed' } },
        axisLabel: {
          color: chartTokens.textTertiary,
          formatter: (value: number) => toCompactNumber(value),
        },
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: {
          color: chartTokens.textTertiary,
          formatter: (value: number) => formatTableNumber(value, 2),
        },
      },
    ],
    series: [
      {
        name: 'GMV',
        type: 'bar',
        barWidth: 18,
        data: gmvSeries,
        yAxisIndex: 0,
        itemStyle: {
          color: gmvColor,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: 'GSV',
        type: 'bar',
        barWidth: 18,
        data: gsvSeries,
        yAxisIndex: 0,
        itemStyle: {
          color: gsvColor,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: 'GPV',
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        data: gpvSeries,
        yAxisIndex: 1,
        lineStyle: {
          width: 2,
          color: gpvColor,
        },
        itemStyle: {
          color: gpvColor,
        },
      },
    ],
  };
}
