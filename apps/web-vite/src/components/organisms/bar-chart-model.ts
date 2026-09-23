import type { EChartsCoreOption } from 'echarts/core';
import { formatNumberCompact } from '@/lib/chart-utils';
import { resolveCssColor } from './chart-model-utils';

export {
  createDebouncedResize,
  resolveCssColor,
} from './chart-model-utils';

/** 柱状图数据项 */
export interface BarDataItem {
  name: string;
  value: number;
  secondaryValue?: number;
}

/** 柱状图 Props */
export interface BarChartProps {
  title?: string;
  data: BarDataItem[];
  barColor?: string;
  secondaryBarColor?: string;
  primarySeriesName?: string;
  secondarySeriesName?: string;
  primaryAxisName?: string;
  secondaryAxisName?: string;
  loading?: boolean;
  height?: number;
  className?: string;
  showValueLabel?: boolean;
  singleAxis?: boolean;
}

interface BarChartCssColors {
  primary: string;
  success: string;
  echartsColors: string[];
  textPrimary: string;
  textTertiary: string;
  borderColor: string;
  dividerColor: string;
  chartLabelColor: string;
}

interface BuildBarChartOptionInput {
  data: BarDataItem[];
  barColor: string;
  secondaryBarColor: string;
  primarySeriesName: string;
  secondarySeriesName: string;
  primaryAxisName: string;
  secondaryAxisName: string;
  showValueLabel: boolean;
  singleAxis: boolean;
  cssColors: BarChartCssColors;
}

interface BarChartTooltipParam {
  name?: string;
  marker?: string;
  seriesName?: string;
  value?: number;
}

function formatTooltipCurrency(value: unknown): string {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) {
    return '--';
  }

  return `¥${safeValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function buildBarChartOption({
  data,
  barColor,
  secondaryBarColor,
  primarySeriesName,
  secondarySeriesName,
  primaryAxisName,
  secondaryAxisName,
  showValueLabel,
  singleAxis,
  cssColors,
}: BuildBarChartOptionInput): EChartsCoreOption {
  const names = data.map((item) => item.name);
  const primaryValues = data.map((item) => (Number.isFinite(item.value) ? item.value : 0));
  const secondaryValues = data.map((item) =>
    Number.isFinite(item.secondaryValue ?? NaN) ? Number(item.secondaryValue) : 0
  );
  const hasSecondarySeries = data.some((item) => Number.isFinite(item.secondaryValue ?? NaN));
  const hasDualAxis = hasSecondarySeries && !singleAxis;
  const resolvedBarColor = resolveCssColor(barColor, cssColors.primary);
  const resolvedSecondaryBarColor = resolveCssColor(
    secondaryBarColor,
    cssColors.echartsColors[1] || cssColors.success
  );

  return {
    responsive: true,
    color: [resolvedBarColor, resolvedSecondaryBarColor],
    legend: hasSecondarySeries
      ? {
          top: 0,
          itemWidth: 14,
          itemHeight: 8,
          textStyle: {
            color: cssColors.textPrimary,
            fontSize: 12,
          },
        }
      : undefined,
    grid: {
      left: '64px',
      right: hasDualAxis ? '64px' : '28px',
      top: hasSecondarySeries ? '54px' : '22px',
      bottom: '44px',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: {
        lineStyle: {
          color: cssColors.borderColor,
        },
      },
      axisLabel: {
        color: cssColors.textTertiary,
        fontSize: 12,
        interval: 0,
      },
    },
    yAxis: hasDualAxis
      ? [
          {
            type: 'value',
            name: primaryAxisName,
            nameTextStyle: {
              color: cssColors.textTertiary,
              fontSize: 11,
            },
            axisLabel: {
              color: cssColors.textTertiary,
              fontSize: 12,
              formatter: (value: number) => formatNumberCompact(value),
            },
            splitLine: {
              lineStyle: {
                color: cssColors.dividerColor,
                type: 'dashed',
              },
            },
          },
          {
            type: 'value',
            name: secondaryAxisName,
            position: 'right',
            nameTextStyle: {
              color: cssColors.textTertiary,
              fontSize: 11,
            },
            axisLabel: {
              color: cssColors.textTertiary,
              fontSize: 12,
              formatter: (value: number) => formatNumberCompact(value),
            },
            splitLine: {
              show: false,
            },
          },
        ]
      : {
          type: 'value',
          name: primaryAxisName,
          nameTextStyle: {
            color: cssColors.textTertiary,
            fontSize: 11,
          },
          axisLabel: {
            color: cssColors.textTertiary,
            fontSize: 12,
            formatter: (value: number) => formatNumberCompact(value),
          },
          splitLine: {
            lineStyle: {
              color: cssColors.dividerColor,
              type: 'dashed',
            },
          },
        },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }

        const pointList = params as BarChartTooltipParam[];
        const titleText = pointList[0]?.name || '';
        const lines = pointList.map((item) => {
          return `${item.marker || ''}${item.seriesName || ''}：${formatTooltipCurrency(item.value)}`;
        });

        return `${titleText}<br/>${lines.join('<br/>')}`;
      },
    },
    series: [
      {
        name: primarySeriesName,
        data: primaryValues,
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: hasSecondarySeries ? 18 : 26,
        barGap: hasSecondarySeries ? '30%' : '0%',
        itemStyle: {
          color: resolvedBarColor,
          borderRadius: [8, 8, 0, 0],
        },
        label: {
          show: showValueLabel,
          position: 'top',
          distance: hasSecondarySeries ? 14 : 10,
          offset: hasSecondarySeries ? [-5, 0] : [0, 0],
          formatter: (params: unknown) => {
            const value = (params as { value: number }).value;
            return formatNumberCompact(value);
          },
          color: cssColors.chartLabelColor,
          fontSize: 11,
        },
        labelLayout: {
          moveOverlap: 'shiftY',
          hideOverlap: false,
        },
      },
      ...(hasSecondarySeries
        ? [
            {
              name: secondarySeriesName,
              data: secondaryValues,
              type: 'bar' as const,
              yAxisIndex: hasDualAxis ? 1 : 0,
              barMaxWidth: 18,
              itemStyle: {
                color: resolvedSecondaryBarColor,
                borderRadius: [8, 8, 0, 0],
              },
              label: {
                show: showValueLabel,
                position: 'top' as const,
                distance: 28,
                offset: [5, 0],
                formatter: (params: unknown) => {
                  const value = (params as { value: number }).value;
                  return formatNumberCompact(value);
                },
                color: cssColors.chartLabelColor,
                fontSize: 11,
              },
              labelLayout: {
                moveOverlap: 'shiftY',
                hideOverlap: false,
              },
            },
          ]
        : []),
    ],
  };
}
