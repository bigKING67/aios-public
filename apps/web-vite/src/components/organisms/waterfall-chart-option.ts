import type { CSSProperties } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { formatCurrencyCompact, formatSignedCurrency, formatSignedPercent, type WaterfallChartComputedModel } from './waterfall-chart-model';

export type WaterfallRootStyleVars = CSSProperties & {
  '--waterfall-chart-height': string;
};

export type WaterfallLegendStyleVars = CSSProperties & {
  '--waterfall-legend-color': string;
};

export interface BuildWaterfallChartOptionParams {
  computed: WaterfallChartComputedModel;
  cachedCssColors: {
    primary: string;
    success: string;
    error: string;
    textPrimary: string;
    textTertiary: string;
  };
  startLabel: string;
  endLabel: string;
  gridBottomPx?: number;
}

function formatTooltipContent(
  node: WaterfallChartComputedModel['meta'][number],
  startLabel: string,
  endLabel: string,
) {
  if (node.type === 'start') {
    return [`${startLabel}`, `GMV：${formatCurrencyCompact(node.value)}`].join('<br/>');
  }

  if (node.type === 'end') {
    return [
      `${endLabel}`,
      `GMV：${formatCurrencyCompact(node.value)}`,
      `总增量：${formatSignedCurrency(node.delta)}`,
    ].join('<br/>');
  }

  return [
    `${node.name}`,
    `上周同期：${formatCurrencyCompact(node.prev)}`,
    `本周同期：${formatCurrencyCompact(node.current)}`,
    `增量：${formatSignedCurrency(node.delta)}`,
    `增量贡献：${formatSignedPercent(node.share)}`,
  ].join('<br/>');
}

export function buildWaterfallChartOption({
  cachedCssColors,
  computed,
  endLabel,
  gridBottomPx,
  startLabel,
}: BuildWaterfallChartOptionParams): EChartsCoreOption {
  const resolvedGridBottom = gridBottomPx ?? (computed.hasNegativeStep ? 84 : 38);

  return {
    animationDuration: 450,
    animationEasing: 'cubicOut',
    grid: {
      left: '2%',
      right: '2%',
      top: '32px',
      bottom: resolvedGridBottom,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        if (!params || typeof params !== 'object') {
          return '';
        }
        const dataIndex = Number((params as { dataIndex?: number }).dataIndex ?? -1);
        const node = computed.meta[dataIndex];

        if (!node) {
          return '';
        }

        return formatTooltipContent(node, startLabel, endLabel);
      },
    },
    xAxis: {
      type: 'category',
      data: computed.categories,
      show: false,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'value',
      show: false,
      min: (extent: { min: number; max: number }) => {
        const minValue = Number.isFinite(extent.min) ? extent.min : 0;
        const maxValue = Number.isFinite(extent.max) ? extent.max : 0;
        const span = Math.max(1, Math.max(0, maxValue) - minValue);
        const padding = span * 0.22;
        if (minValue < 0) {
          return minValue - padding;
        }
        return 0;
      },
      max: (extent: { min: number; max: number }) => {
        const minValue = Number.isFinite(extent.min) ? extent.min : 0;
        const maxValue = Number.isFinite(extent.max) ? extent.max : 0;
        const span = Math.max(1, maxValue - Math.min(0, minValue));
        const padding = span * 0.3;
        return Math.max(0, maxValue + padding);
      },
      splitNumber: 6,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        name: '正向增量',
        type: 'bar',
        stack: 'platform-delta',
        clip: false,
        data: computed.positiveValues,
        barMaxWidth: 38,
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          z: 10,
          label: { show: false },
          lineStyle: {
            color: cachedCssColors.textTertiary,
            width: 1.5,
            type: 'dashed',
            opacity: 0.95,
          },
          data: [{ yAxis: 0 }],
        },
        itemStyle: {
          borderRadius: [6, 6, 6, 6],
          color: (params: { dataIndex: number }) =>
            computed.colors[params.dataIndex] || cachedCssColors.primary,
        },
        label: {
          show: true,
          position: 'top',
          distance: 12,
          fontSize: 11,
          lineHeight: 14,
          rich: {
            normal: {
              color: cachedCssColors.textPrimary,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 14,
            },
            pos: {
              color: cachedCssColors.error,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 14,
            },
            neg: {
              color: cachedCssColors.success,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 14,
            },
          },
          formatter: (params: { dataIndex: number; value: number }) => {
            const dataIndex = params.dataIndex;
            const node = computed.meta[dataIndex];

            if (!node) {
              return '';
            }

            if (node.type === 'start' || node.type === 'end') {
              return `{normal|${formatCurrencyCompact(Number(params.value || 0))}}`;
            }

            const labelText = `${formatSignedCurrency(node.delta)}\n${formatSignedPercent(node.share)}`;
            if (node.delta < 0) {
              return `{neg|${labelText}}`;
            }

            if (node.share >= computed.averageContribution) {
              return `{pos|${labelText}}`;
            }

            return `{normal|${labelText}}`;
          },
        },
        labelLayout: {
          hideOverlap: false,
        },
      },
      {
        name: '负向增量',
        type: 'bar',
        stack: 'platform-delta',
        clip: false,
        barGap: '-100%',
        data: computed.negativeValues,
        barMaxWidth: 38,
        itemStyle: {
          borderRadius: [6, 6, 6, 6],
          color: (params: { dataIndex: number }) =>
            computed.colors[params.dataIndex] || cachedCssColors.primary,
        },
        label: {
          show: true,
          position: 'bottom',
          distance: 12,
          rich: {
            normal: {
              color: cachedCssColors.textPrimary,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 14,
            },
            neg: {
              color: cachedCssColors.success,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 14,
            },
          },
          formatter: (params: { dataIndex: number; value: number }) => {
            const dataIndex = params.dataIndex;
            const node = computed.meta[dataIndex];

            if (!node) {
              return '';
            }

            if (node.type === 'step') {
              return `{neg|${formatSignedCurrency(node.delta)}\n${formatSignedPercent(node.share)}}`;
            }

            return `{normal|${formatCurrencyCompact(Number(params.value || 0))}}`;
          },
        },
        labelLayout: {
          hideOverlap: false,
        },
      },
    ],
  };
}
