import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import {
  formatCompactWanCurrency,
  formatCompactWanInteger,
  formatTableInteger,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import type { DashboardGoodsCardTrendRow } from './dashboard-types';

export interface DashboardGoodsCardChartTokens {
  textSecondary: string;
  textTertiary: string;
  axisLine: string;
  gridLine: string;
  primarySeries: string;
  inkSeries: string;
}

function toSafeNumber(value: NumericInput): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

export function buildDashboardGoodsCardTrendOption({
  rows,
  chartTokens,
}: {
  rows: DashboardGoodsCardTrendRow[];
  chartTokens: DashboardGoodsCardChartTokens;
}): EChartsCoreOption {
  const labels = rows.map((item) => dayjs(item.date).format('MM/DD'));
  const gmvSeries = rows.map((item) => toSafeNumber(item.card_user_pay_amount));
  const exposureSeries = rows.map((item) => toSafeNumber(item.card_exposure_user_count));

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
              : item.seriesName === '商品卡曝光人数'
                ? formatTableInteger(parsedValue)
                : formatCompactWanCurrency(parsedValue);
          lines.push(`${item.marker || ''}${item.seriesName || '--'}：${valueText}`);
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
        splitLine: { lineStyle: { color: chartTokens.gridLine, type: 'dashed' } },
        axisLabel: {
          color: chartTokens.textTertiary,
          formatter: (value: number) => formatCompactWanCurrency(value),
        },
      },
      {
        type: 'value',
        splitLine: { show: false },
        axisLabel: {
          color: chartTokens.textTertiary,
          formatter: (value: number) => formatCompactWanInteger(value),
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
          color: chartTokens.primarySeries,
          borderRadius: [8, 8, 0, 0],
        },
      },
      {
        name: '商品卡曝光人数',
        type: 'line',
        smooth: true,
        showSymbol: false,
        symbol: 'none',
        symbolSize: 0,
        data: exposureSeries,
        yAxisIndex: 1,
        lineStyle: {
          width: 2,
          color: chartTokens.inkSeries,
        },
        itemStyle: {
          color: chartTokens.inkSeries,
        },
      },
    ],
  };
}
