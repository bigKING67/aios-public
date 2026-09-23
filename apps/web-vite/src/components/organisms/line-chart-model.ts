import type { EChartsCoreOption } from 'echarts/core';
import { formatNumberCompact } from '@/lib/chart-utils';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import {
  colorToRgb,
  resolveCssColor,
  resolveNumericParamValue,
} from './chart-model-utils';

export {
  colorToRgb,
  createDebouncedResize,
  resolveCssColor,
  resolveNumericParamValue,
} from './chart-model-utils';

/** 图表系列数据 */
export interface ChartSeries {
  name: string;
  data: number[];
}

/** 折线图数据 */
export interface LineChartData {
  series: ChartSeries[];
  xAxis: string[];
  /** 用于 Tooltip 显示：每个数据点对应的日期 */
  dates?: {
    thisWeek: string[];
    prevWeek: string[];
  };
}

/** 折线图 Props */
export interface LineChartProps {
  /** 图表标题（可选） */
  title?: string;
  /** 图表数据 */
  data: LineChartData;
  /** 颜色主题（默认使用主色） */
  theme?: 'light' | 'dark';
  /** 加载中 */
  loading?: boolean;
  /** 图表高度；number 按 px 处理，string 可传入 CSS length（如 100%） */
  height?: number | string;
  /** 自定义 className */
  className?: string;
  /** 自定义颜色数组（支持 CSS 变量，如 'var(--chart-color-this-week)' 或 '#3264F6'） */
  colors?: string[];
  /** 是否显示数据点标记 */
  showDataLabel?: boolean;
  /** 是否使用平滑曲线，默认保持原折线图行为 */
  smooth?: boolean;
  /** 是否显示线下面积，默认保持原折线图行为 */
  showArea?: boolean;
  /** 是否显示数据点 symbol，默认保持原折线图行为 */
  showPointSymbol?: boolean;
  /** 离散计数图可设置为 1，避免纵轴出现 0.2 这类非整数刻度 */
  yAxisMinInterval?: number;
  /** ECharts step line setting for discrete buckets */
  lineStep?: false | 'start' | 'middle' | 'end';
}

interface LineChartCssColors {
  primary: string;
  echartsColors: string[];
  chartLabelColor: string;
  borderColor: string;
  textTertiary: string;
  dividerColor: string;
  textPrimary: string;
  bgCard: string;
}

interface LineChartTooltipParam {
  dataIndex?: number;
  name?: string | number;
  seriesName?: string;
  value?: unknown;
}

interface LineChartLabelParam {
  value?: unknown;
}

interface BuildLineChartOptionInput {
  title?: string;
  data: LineChartData;
  colors?: string[];
  showDataLabel: boolean;
  smooth: boolean;
  showArea: boolean;
  showPointSymbol: boolean;
  yAxisMinInterval?: number;
  lineStep?: false | 'start' | 'middle' | 'end';
  cssColors: LineChartCssColors;
  isDesktop: boolean;
}

export function buildLineChartOption({
  title,
  data,
  colors,
  showDataLabel,
  smooth,
  showArea,
  showPointSymbol,
  yAxisMinInterval,
  lineStep,
  cssColors,
  isDesktop,
}: BuildLineChartOptionInput): EChartsCoreOption {
  const echartsColorValues =
    colors || [
      ECHARTS_CHART_TOKENS.highlightSeries,
      cssColors.echartsColors[1],
      cssColors.echartsColors[3],
      cssColors.echartsColors[4],
      cssColors.echartsColors[5],
    ];
  const resolvedEchartsColors = echartsColorValues.map((color) => resolveCssColor(color));
  const gridLeft = isDesktop ? '78px' : '62px';
  const gridRight = isDesktop ? '32px' : '18px';
  const xAxisBoundaryGap: [string, string] = isDesktop ? ['8%', '6%'] : ['4%', '4%'];
  const primaryRgbColor = colorToRgb(resolvedEchartsColors[0] || cssColors.primary) || {
    r: 50,
    g: 100,
    b: 246,
  };

  const series = data.series.map((chartSeries, idx) => {
    const seriesColor = resolvedEchartsColors[idx % resolvedEchartsColors.length] || cssColors.primary;
    const rgbColor = colorToRgb(seriesColor) || primaryRgbColor;

    return {
      name: chartSeries.name,
      type: 'line' as const,
      data: chartSeries.data,
      smooth,
      step: lineStep || false,
      symbol: 'emptyCircle',
      symbolSize: 6,
      showSymbol: isDesktop && showPointSymbol,
      label: {
        show: isDesktop && showDataLabel,
        position: idx === 0 ? 'top' : 'bottom',
        distance: 8,
        formatter: (params: LineChartLabelParam) =>
          formatNumberCompact(resolveNumericParamValue(params.value)),
        color: cssColors.chartLabelColor,
        fontSize: 12,
      },
      labelLayout: {
        hideOverlap: true,
        moveOverlap: 'shiftY',
      },
      itemStyle: {
        color: seriesColor,
      },
      lineStyle: {
        width: 2,
        color: seriesColor,
      },
      areaStyle: showArea ? {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${idx === 0 ? 0.22 : 0.14})`,
            },
            {
              offset: 1,
              color: `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0)`,
            },
          ],
        },
      } : undefined,
    };
  });

  const option: EChartsCoreOption = {
    responsive: true,
    color: resolvedEchartsColors,
    grid: {
      left: gridLeft,
      right: gridRight,
      bottom: '40px',
      top: title ? '12%' : '20px',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.xAxis,
      boundaryGap: xAxisBoundaryGap,
      axisLine: {
        lineStyle: {
          color: cssColors.borderColor,
        },
      },
      axisLabel: {
        color: cssColors.textTertiary,
        fontSize: 12,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: yAxisMinInterval,
      axisLine: {
        lineStyle: {
          color: cssColors.borderColor,
        },
      },
      axisLabel: {
        color: cssColors.textTertiary,
        fontSize: 12,
      },
      splitLine: {
        lineStyle: {
          color: cssColors.dividerColor,
          type: 'dashed',
        },
      },
    },
    legend: {
      top: 0,
      textStyle: {
        color: cssColors.textPrimary,
        fontSize: 12,
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        if (!Array.isArray(params)) return '';
        const tooltipParams = params as LineChartTooltipParam[];
        const dataIndex = tooltipParams[0]?.dataIndex ?? -1;
        const dayName = tooltipParams[0]?.name || '';

        const thisWeekDate = data.dates?.thisWeek?.[dataIndex] || '';
        const prevWeekDate = data.dates?.prevWeek?.[dataIndex] || '';

        const values = tooltipParams
          .map((param) => {
            const seriesName = param.seriesName || '';
            const dateStr = seriesName.includes('本周')
              ? thisWeekDate
              : seriesName.includes('上周')
                ? prevWeekDate
                : '';
            const value = Number(param.value);
            const formattedValue = Number.isFinite(value)
              ? value.toLocaleString('zh-CN')
              : '--';
            return `${seriesName}${dateStr ? `（${dateStr}）` : ''}：${formattedValue}`;
          })
          .join('<br/>');

        return `${dayName}<br/>${values}`;
      },
    },
    series,
  };

  return option;
}
