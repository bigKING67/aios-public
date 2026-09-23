import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import {
  formatCompactWanCurrency,
  formatTableInteger,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { escapeTooltipHtml } from './dashboard-html-formatters';
import { getLiveTrendDateKey } from './dashboard-live-trend-formatters';
import { toSortableNumber } from './dashboard-sorters';
import type { DashboardLiveDetailRow, DashboardLiveTrendRow } from './dashboard-types';

export interface DashboardLiveChartClassNames {
  liveTrendTooltipMetricRow: string;
  liveTrendTooltipMetricLabel: string;
  liveTrendTooltipMetricValue: string;
  liveTrendTooltipCard: string;
  liveTrendTooltipDate: string;
  liveTrendTooltipHint: string;
  liveTrendTooltipMetrics: string;
}

export interface DashboardLiveChartTokens {
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  axisLine: string;
  gridLine: string;
  primarySeries: string;
  secondarySeries: string;
  inkSeries: string;
  tooltipBackground: string;
  tooltipBorder: string;
}

function toSafeNumber(value: NumericInput): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function buildLiveTrendTooltipHtml(
  dateLabel: string,
  dateKey: string | null,
  rows: DashboardLiveDetailRow[],
  metricItems: Array<{
    marker?: string;
    seriesName?: string;
    value?: unknown;
  }>,
  classNames: DashboardLiveChartClassNames
): string {
  const sessionCount = rows.length;
  const sessionHint =
    sessionCount > 0 ? `共 ${sessionCount} 场，点击查看转化漏斗` : '当前日期暂无可钻取场次';

  const metricRows = metricItems
    .map((item) => {
      const rawValue = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
      const parsedValue = rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);
      const valueText =
        parsedValue === null || !Number.isFinite(parsedValue)
          ? '--'
          : item.seriesName === 'GPM'
            ? formatTableInteger(parsedValue)
            : formatCompactWanCurrency(parsedValue);
      return [
        `<div class="${classNames.liveTrendTooltipMetricRow}">`,
        `<span class="${classNames.liveTrendTooltipMetricLabel}">${item.marker || ''}${escapeTooltipHtml(item.seriesName || '--')}</span>`,
        `<em class="${classNames.liveTrendTooltipMetricValue}">${escapeTooltipHtml(valueText)}</em>`,
        '</div>',
      ].join('');
    })
    .join('');

  return [
    `<div class="${classNames.liveTrendTooltipCard}">`,
    `<div class="${classNames.liveTrendTooltipDate}">${escapeTooltipHtml(dateKey || dateLabel || '--')}</div>`,
    `<div class="${classNames.liveTrendTooltipHint}">${escapeTooltipHtml(sessionHint)}</div>`,
    `<div class="${classNames.liveTrendTooltipMetrics}">${metricRows}</div>`,
    '</div>',
  ].join('');
}

export function buildDashboardLiveTrendOption({
  rows,
  rowsByDate,
  chartTokens,
  classNames,
}: {
  rows: DashboardLiveTrendRow[];
  rowsByDate: Map<string, DashboardLiveDetailRow[]>;
  chartTokens: DashboardLiveChartTokens;
  classNames: DashboardLiveChartClassNames;
}): EChartsCoreOption {
  const labels = rows.map((item) => dayjs(item.date).format('MM/DD'));
  const dateKeys = rows.map((item) => getLiveTrendDateKey(item));
  const gmvSeries = rows.map((item) => toSafeNumber(item.live_gmv));
  const gsvSeries = rows.map((item) => toSafeNumber(item.live_gsv));
  const gpmSeries = rows.map((item) => toSortableNumber(item.gpm));
  const gmvColor = chartTokens.primarySeries;
  const gsvColor = chartTokens.secondarySeries;
  const gpmColor = chartTokens.inkSeries;

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
      backgroundColor: chartTokens.tooltipBackground,
      borderColor: chartTokens.tooltipBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: chartTokens.textInverse,
        fontSize: 12,
        lineHeight: 18,
      },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params];
        const normalized = items as Array<{
          marker?: string;
          seriesName?: string;
          axisValueLabel?: string;
          name?: string;
          dataIndex?: number;
          value?: unknown;
        }>;
        if (!normalized.length) {
          return '';
        }

        const title = normalized[0]?.axisValueLabel || normalized[0]?.name || '--';
        const indexFromParam =
          typeof normalized[0]?.dataIndex === 'number' ? normalized[0].dataIndex : labels.findIndex((label) => label === title);
        const dateKey = indexFromParam >= 0 ? dateKeys[indexFromParam] : null;
        const tooltipRows = dateKey ? rowsByDate.get(dateKey) || [] : [];
        return buildLiveTrendTooltipHtml(title, dateKey, tooltipRows, normalized, classNames);
      },
    },
    legend: {
      left: 'center',
      top: 4,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 6,
      itemGap: 14,
      textStyle: {
        color: chartTokens.textSecondary,
        fontSize: 11,
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTokens.axisLine } },
      axisLabel: {
        color: chartTokens.textTertiary,
        fontSize: 11,
        margin: 12,
        hideOverlap: true,
      },
    },
    yAxis: [
      {
        type: 'value',
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: chartTokens.gridLine, type: 'dashed' } },
        axisLabel: {
          color: chartTokens.textTertiary,
          fontSize: 11,
          formatter: (value: number) => formatCompactWanCurrency(value),
        },
      },
      {
        type: 'value',
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: chartTokens.textTertiary,
          fontSize: 11,
          formatter: (value: number) => formatTableInteger(value),
        },
      },
    ],
    series: [
      {
        name: 'GMV',
        type: 'bar',
        barWidth: 16,
        barGap: '18%',
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
        barWidth: 16,
        data: gsvSeries,
        yAxisIndex: 0,
        itemStyle: {
          color: gsvColor,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: 'GPM',
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        data: gpmSeries,
        yAxisIndex: 1,
        lineStyle: {
          width: 1.8,
          color: gpmColor,
        },
        itemStyle: {
          color: gpmColor,
        },
      },
    ],
  };
}
