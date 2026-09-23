/**
 * AIOS ECharts 主题配置
 *
 * 将设计系统的色彩变量转换为 ECharts 可用的具体色值。
 * 注：ECharts 无法直接使用 CSS 变量，需要在编译时使用具体的 RGB 值。
 *
 * 普通序列来自 CHART_SERIES_COLORS；UI 语义色来自 DESIGN_COLOR_VALUES。
 *
 * @see apps/web-vite/src/lib/domain-taxonomy-colors.ts
 * @see apps/web-vite/src/lib/design-token-values.ts
 */

import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';
import { DESIGN_COLOR_VALUES, DESIGN_FONT_FAMILY } from '@/lib/design-token-values';

export const ECHARTS_FONT_FAMILY = DESIGN_FONT_FAMILY;

export const ECHARTS_SERIES_COLORS = {
  primary: CHART_SERIES_COLORS.series1,
  secondary: CHART_SERIES_COLORS.series2,
  tertiary: CHART_SERIES_COLORS.series3,
  quaternary: CHART_SERIES_COLORS.series4,
  fifth: CHART_SERIES_COLORS.series5,
  sixth: CHART_SERIES_COLORS.series6,
  muted: CHART_SERIES_COLORS.muted,
  highlight: CHART_SERIES_COLORS.highlight,
} as const;

export const ECHARTS_COLORS = [
  ECHARTS_SERIES_COLORS.primary, // Series 1 (--chart-series-1)
  ECHARTS_SERIES_COLORS.secondary, // Series 2 (--chart-series-2)
  ECHARTS_SERIES_COLORS.tertiary, // Series 3 (--chart-series-3)
  ECHARTS_SERIES_COLORS.quaternary, // Series 4 (--chart-series-4)
  ECHARTS_SERIES_COLORS.fifth, // Series 5 (--chart-series-5)
  ECHARTS_SERIES_COLORS.sixth, // Series 6 (--chart-series-6)
] as const;

export const ECHARTS_TEXT_COLORS = {
  primary: DESIGN_COLOR_VALUES.textPrimary,
  secondary: DESIGN_COLOR_VALUES.textSecondary,
  tertiary: DESIGN_COLOR_VALUES.textTertiary,
  inverse: DESIGN_COLOR_VALUES.textInverse,
} as const;

export const ECHARTS_SURFACE_COLORS = {
  canvas: DESIGN_COLOR_VALUES.backgroundSecondary,
  surface: DESIGN_COLOR_VALUES.backgroundPrimary,
  hoverWash: DESIGN_COLOR_VALUES.backgroundTertiary,
} as const;

export const ECHARTS_STRUCTURAL_COLORS = {
  axisLine: DESIGN_COLOR_VALUES.border,
  gridLine: DESIGN_COLOR_VALUES.divider,
  tooltipBorder: 'transparent',
} as const;

function withOpacity(hexColor: string, alpha: number): string {
  const normalizedHex = hexColor.replace('#', '');
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const cssColorFunction = 'rgba';

  return `${cssColorFunction}(${red}, ${green}, ${blue}, ${alpha})`;
}

export const ECHARTS_MATERIAL_COLORS = {
  tooltipBackground: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.88),
  tooltipShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08),
  softShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08),
  mediumShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.16),
  primaryAreaStart: withOpacity(CHART_SERIES_COLORS.series1, 0.26),
  primaryAreaEnd: withOpacity(CHART_SERIES_COLORS.series1, 0.03),
  primaryRadarArea: withOpacity(CHART_SERIES_COLORS.series1, 0.22),
  radarSplitAreaA: withOpacity(DESIGN_COLOR_VALUES.backgroundSecondary, 0.7),
  radarSplitAreaB: withOpacity(DESIGN_COLOR_VALUES.backgroundTertiary, 0.92),
} as const;

export const ECHARTS_SEMANTIC_SERIES_COLORS = {
  negative: DESIGN_COLOR_VALUES.trendUp,
  positive: DESIGN_COLOR_VALUES.trendDown,
  ink: ECHARTS_TEXT_COLORS.primary,
} as const;

export const ECHARTS_TOOLTIP_BGCOLOR = ECHARTS_MATERIAL_COLORS.tooltipBackground; // 哑光黑，对比度高

export const ECHARTS_CHART_TOKENS = {
  textPrimary: ECHARTS_TEXT_COLORS.primary,
  textSecondary: ECHARTS_TEXT_COLORS.secondary,
  textTertiary: ECHARTS_TEXT_COLORS.tertiary,
  textInverse: ECHARTS_TEXT_COLORS.inverse,
  canvas: ECHARTS_SURFACE_COLORS.canvas,
  surface: ECHARTS_SURFACE_COLORS.surface,
  hoverWash: ECHARTS_SURFACE_COLORS.hoverWash,
  axisLine: ECHARTS_STRUCTURAL_COLORS.axisLine,
  gridLine: ECHARTS_STRUCTURAL_COLORS.gridLine,
  mutedSeries: ECHARTS_SERIES_COLORS.muted,
  highlightSeries: ECHARTS_SERIES_COLORS.highlight,
  tooltipBackground: ECHARTS_MATERIAL_COLORS.tooltipBackground,
  tooltipBorder: ECHARTS_STRUCTURAL_COLORS.tooltipBorder,
  tooltipShadow: ECHARTS_MATERIAL_COLORS.tooltipShadow,
  softShadow: ECHARTS_MATERIAL_COLORS.softShadow,
  mediumShadow: ECHARTS_MATERIAL_COLORS.mediumShadow,
  primarySeries: ECHARTS_COLORS[0],
  secondarySeries: ECHARTS_COLORS[1],
  tertiarySeries: ECHARTS_COLORS[2],
  quaternarySeries: ECHARTS_COLORS[3],
  warningSeries: ECHARTS_COLORS[2],
  negativeSeries: ECHARTS_SEMANTIC_SERIES_COLORS.negative,
  positiveSeries: ECHARTS_SEMANTIC_SERIES_COLORS.positive,
  inkSeries: ECHARTS_SEMANTIC_SERIES_COLORS.ink,
  primaryAreaStart: ECHARTS_MATERIAL_COLORS.primaryAreaStart,
  primaryAreaEnd: ECHARTS_MATERIAL_COLORS.primaryAreaEnd,
  primaryRadarArea: ECHARTS_MATERIAL_COLORS.primaryRadarArea,
  radarSplitAreaA: ECHARTS_MATERIAL_COLORS.radarSplitAreaA,
  radarSplitAreaB: ECHARTS_MATERIAL_COLORS.radarSplitAreaB,
} as const;

/**
 * ECharts 主题配置对象
 * 用于在创建图表时应用一致的样式
 *
 * @example
 * import { echartsTheme } from '@/styles/echarts-theme';
 * const chart = echarts.init(dom);
 * chart.setOption({
 *   ...echartsTheme,
 *   series: [...]
 * });
 */
export const echartsTheme = {
  color: ECHARTS_COLORS,
  textStyle: {
    fontFamily: ECHARTS_FONT_FAMILY,
  },
  title: {
    textStyle: {
      color: ECHARTS_CHART_TOKENS.textPrimary, // --text-primary
      fontSize: 18,
      fontWeight: 500,
    },
  },
  legend: {
    textStyle: {
      color: ECHARTS_CHART_TOKENS.textSecondary, // --text-secondary
    },
    itemGap: 16,
  },
  tooltip: {
    backgroundColor: ECHARTS_CHART_TOKENS.tooltipBackground,
    borderColor: ECHARTS_CHART_TOKENS.tooltipBorder,
    textStyle: {
      color: ECHARTS_CHART_TOKENS.textInverse,
      fontSize: 12,
    },
  },
  grid: {
    borderColor: ECHARTS_CHART_TOKENS.axisLine, // --border-color
  },
  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.axisLine, // --border-color
      },
    },
    axisTick: {
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.axisLine, // --border-color
      },
    },
    axisLabel: {
      color: ECHARTS_CHART_TOKENS.textTertiary, // --text-tertiary
    },
    splitLine: {
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.gridLine, // --divider-color
      },
    },
  },
  valueAxis: {
    axisLine: {
      show: true,
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.axisLine, // --border-color
      },
    },
    axisTick: {
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.axisLine, // --border-color
      },
    },
    axisLabel: {
      color: ECHARTS_CHART_TOKENS.textTertiary, // --text-tertiary
    },
    splitLine: {
      lineStyle: {
        color: ECHARTS_CHART_TOKENS.gridLine, // --divider-color
        type: 'dashed' as const,
      },
    },
  },
  line: {
    smooth: true,
  },
  bar: {
    borderRadius: [8, 8, 0, 0],
  },
} as const;

/**
 * 获取第 n 个推荐颜色（循环）
 *
 * @example
 * const color = getChartColor(0); // '#445DF6'
 * const color = getChartColor(6); // '#445DF6' (循环)
 */
export function getChartColor(index: number): string {
  return ECHARTS_COLORS[index % ECHARTS_COLORS.length];
}

/**
 * 创建渐变背景色（用于面积图）
 *
 * @param baseColor - 基础色值
 * @returns 渐变配置对象
 *
 * @example
 * const gradient = createGradientColor('#445DF6');
 * areaStyle: { color: gradient }
 */
export function createGradientColor(baseColor: string) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      {
        offset: 0,
        color: baseColor + '40', // 0.25 透明度
      },
      {
        offset: 1,
        color: baseColor + '00', // 完全透明
      },
    ],
  };
}
