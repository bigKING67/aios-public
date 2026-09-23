import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';

import {
  formatCompactWanCurrency,
  formatTableNumber,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { escapeTooltipHtml } from './dashboard-html-formatters';
import type { DashboardQianchuanTrendRow } from './dashboard-qianchuan-types';

export interface DashboardQianchuanChartTokens {
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  axisLine: string;
  gridLine: string;
  primarySeries: string;
  secondarySeries: string;
  tertiarySeries: string;
  inkSeries: string;
  tooltipBackground: string;
  tooltipBorder: string;
}

function getTrendDateKey(row: DashboardQianchuanTrendRow): string | null {
  return row.statDate?.trim() || row.stat_date?.trim() || row.date?.trim() || null;
}

function formatTrendLabel(dateKey: string | null): string {
  if (!dateKey) {
    return '--';
  }

  const parsed = dayjs(dateKey);
  return parsed.isValid() ? parsed.format('MM/DD') : dateKey;
}

function toChartNumber(value: NumericInput | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTooltipMetric(seriesName: string | undefined, value: unknown): string {
  const rawValue = Array.isArray(value) ? value[value.length - 1] : value;
  const parsedValue = toChartNumber(rawValue as NumericInput | undefined);

  if (parsedValue === null) {
    return '--';
  }

  if (seriesName?.includes('ROI')) {
    return formatTableNumber(parsedValue, 2);
  }

  return formatCompactWanCurrency(parsedValue);
}

export function buildDashboardQianchuanTrendOption({
  rows,
  chartTokens,
}: {
  rows: DashboardQianchuanTrendRow[];
  chartTokens: DashboardQianchuanChartTokens;
}): EChartsCoreOption {
  const dateKeys = rows.map(getTrendDateKey);
  const labels = dateKeys.map(formatTrendLabel);

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

        const matchedLabel = normalized[0]?.axisValueLabel || normalized[0]?.name;
        const itemIndex =
          typeof normalized[0]?.dataIndex === 'number'
            ? normalized[0].dataIndex
            : labels.findIndex((label) => label === matchedLabel);
        const title = itemIndex >= 0 ? dateKeys[itemIndex] || labels[itemIndex] : normalized[0]?.axisValueLabel || '--';
        const lines = [`<div>${escapeTooltipHtml(title)}</div>`];

        normalized.forEach((item) => {
          lines.push(
            `${item.marker || ''}${escapeTooltipHtml(item.seriesName || '--')}：${escapeTooltipHtml(
              formatTooltipMetric(item.seriesName, item.value)
            )}`
          );
        });

        return lines.join('<br/>');
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
          formatter: (value: number) => formatTableNumber(value, 1),
        },
      },
    ],
    series: [
      {
        name: '消耗',
        type: 'bar',
        barWidth: 16,
        barGap: '18%',
        data: rows.map((item) => toChartNumber(item.overall_cost ?? item.overallCost ?? item.cost_amount ?? item.costAmount)),
        yAxisIndex: 0,
        itemStyle: {
          color: chartTokens.primarySeries,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: 'GMV',
        type: 'bar',
        barWidth: 16,
        data: rows.map((item) => toChartNumber(item.overall_gmv ?? item.overallGmv)),
        yAxisIndex: 0,
        itemStyle: {
          color: chartTokens.secondarySeries,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: '支付 ROI',
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        data: rows.map((item) => toChartNumber(item.overall_pay_roi ?? item.overallPayRoi ?? item.pay_roi ?? item.payRoi)),
        yAxisIndex: 1,
        lineStyle: {
          width: 1.8,
          color: chartTokens.inkSeries,
        },
        itemStyle: {
          color: chartTokens.inkSeries,
        },
      },
      {
        name: '净成交 ROI',
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        data: rows.map((item) => toChartNumber(item.net_gmv_roi ?? item.netGmvRoi)),
        yAxisIndex: 1,
        lineStyle: {
          width: 1.7,
          color: chartTokens.tertiarySeries,
          type: 'dashed',
        },
        itemStyle: {
          color: chartTokens.tertiarySeries,
        },
      },
    ],
  };
}
