/**
 * ECharts v6 AIOS 品牌蓝主题配置
 * 与 AIOS DESIGN.md 图表契约对齐
 *
 * 特性：
 * 1. 圆润柱状图（borderRadius）
 * 2. 低噪轴线与网格
 * 3. 克制的普通序列色与阴影
 * 4. 响应式字体
 *
 * 版本：v6.0.0
 * 更新时间：2026-02-11
 */

import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS, ECHARTS_COLORS, ECHARTS_FONT_FAMILY } from '@/styles/echarts-theme';

export const createEchartsTheme = () => {
  const chartTokens = ECHARTS_CHART_TOKENS;
  const theme: EChartsCoreOption = {
    color: [...ECHARTS_COLORS],

    textStyle: {
      fontFamily: ECHARTS_FONT_FAMILY,
      fontSize: 12,
      color: chartTokens.textPrimary,
    },

    title: {
      textStyle: {
        fontSize: 18,
        fontWeight: 600,
        color: chartTokens.textPrimary,
      },
      subtextStyle: {
        color: chartTokens.textSecondary,
      },
    },

    line: {
      itemStyle: {
        borderWidth: 1,
      },
      lineStyle: {
        width: 2,
      },
      symbolSize: 6,
      smooth: true,  // 平滑曲线
    },

    bar: {
      itemStyle: {
        // 圆润柱状图（关键特性）
        borderRadius: [6, 6, 0, 0],
        // 低噪阴影，避免高饱和外发光
        shadowColor: chartTokens.softShadow,
        shadowBlur: 8,
        shadowOffsetY: 2,
      },
    },

    pie: {
      itemStyle: {
        borderColor: chartTokens.surface,
        borderWidth: 2,
        shadowColor: chartTokens.softShadow,
        shadowBlur: 8,
      },
    },

    scatter: {
      itemStyle: {
        borderWidth: 0,
        shadowColor: chartTokens.softShadow,
        shadowBlur: 6,
      },
    },

    boxplot: {
      itemStyle: {
        borderColor: chartTokens.primarySeries,
      },
    },

    parallel: {
      itemStyle: {
        borderWidth: 0,
      },
    },

    sankey: {
      itemStyle: {
        borderColor: chartTokens.surface,
        borderWidth: 0.5,
      },
    },

    funnel: {
      itemStyle: {
        borderColor: chartTokens.surface,
        borderWidth: 1,
      },
    },

    gauge: {
      itemStyle: {
        borderColor: chartTokens.surface,
        borderWidth: 1,
      },
    },

    candlestick: {
      itemStyle: {
        color: chartTokens.negativeSeries,
        color0: chartTokens.positiveSeries,
        borderColor: chartTokens.negativeSeries,
        borderColor0: chartTokens.positiveSeries,
      },
    },

    graph: {
      itemStyle: {
        borderColor: chartTokens.surface,
        borderWidth: 0,
        shadowColor: chartTokens.softShadow,
        shadowBlur: 6,
      },
      lineStyle: {
        width: 1,
        color: chartTokens.axisLine,
      },
    },

    map: {
      itemStyle: {
        areaColor: chartTokens.canvas,
        borderColor: chartTokens.axisLine,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 10,
        shadowColor: chartTokens.mediumShadow,
      },
    },

    geo: {
      itemStyle: {
        areaColor: chartTokens.canvas,
        borderColor: chartTokens.axisLine,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 10,
        shadowColor: chartTokens.mediumShadow,
      },
    },

    categoryAxis: {
      axisLine: {
        show: true,
        lineStyle: {
          color: chartTokens.axisLine,
          width: 1,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        show: true,
        color: chartTokens.textTertiary,
        fontSize: 12,
      },
      splitLine: {
        show: false,
      },
      splitArea: {
        show: false,
      },
    },

    valueAxis: {
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        show: true,
        color: chartTokens.textTertiary,
        fontSize: 12,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: [chartTokens.gridLine],
          width: 1,
          type: 'solid',
        },
      },
      splitArea: {
        show: false,
      },
    },

    logAxis: {
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        show: true,
        color: chartTokens.textTertiary,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: [chartTokens.gridLine],
        },
      },
      splitArea: {
        show: false,
      },
    },

    timeAxis: {
      axisLine: {
        show: true,
        lineStyle: {
          color: chartTokens.axisLine,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        show: true,
        color: chartTokens.textTertiary,
      },
      splitLine: {
        show: false,
      },
      splitArea: {
        show: false,
      },
    },

    toolbox: {
      iconStyle: {
        borderColor: chartTokens.primarySeries,
      },
      emphasis: {
        iconStyle: {
          borderColor: chartTokens.primarySeries,
        },
      },
    },

    legend: {
      textStyle: {
        color: chartTokens.textSecondary,
      },
    },

    tooltip: {
      backgroundColor: chartTokens.tooltipBackground,
      borderColor: chartTokens.tooltipBorder,
      borderWidth: 1,
      textStyle: {
        color: chartTokens.textInverse,
      },
      axisPointer: {
        lineStyle: {
          color: chartTokens.axisLine,
          width: 1,
        },
        crossStyle: {
          color: chartTokens.axisLine,
          width: 1,
        },
      },
    },
  };

  // 注册自定义主题
  echarts.registerTheme('aios-modern', theme);

  return theme;
};

/**
 * ECharts 配置工厂函数
 */
type EchartsOptionRecord = Record<string, unknown> & {
  grid?: Record<string, unknown>;
};

export const createEchartsOption = <TOption extends EchartsOptionRecord>(
  baseOption: TOption
): TOption & { responsive: boolean } => {
  return {
    ...baseOption,
    // 全局配置
    grid: {
      left: 60,
      right: 20,
      top: 40,
      bottom: 40,
      containLabel: true,
      ...baseOption.grid,
    },
    // 响应式配置
    responsive: true,
  };
};

/**
 * 品牌主色渐变工厂
 */
export const createBrandGradient = (
  direction: 'vertical' | 'horizontal' = 'vertical'
) => {
  const chartTokens = ECHARTS_CHART_TOKENS;
  if (direction === 'vertical') {
    return {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: chartTokens.primarySeries },
        { offset: 0.5, color: chartTokens.primaryAreaStart },
        { offset: 1, color: chartTokens.primaryAreaEnd },
      ],
    };
  }
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 1,
    y2: 0,
    colorStops: [
      { offset: 0, color: chartTokens.primarySeries },
      { offset: 0.5, color: chartTokens.primaryAreaStart },
      { offset: 1, color: chartTokens.primaryAreaEnd },
    ],
  };
};

// 初始化主题
createEchartsTheme();
