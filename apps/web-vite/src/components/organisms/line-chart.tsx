'use client';

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart as LineChartType } from 'echarts/charts';
import { GridSimpleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartContainer } from '../molecules/chart-container';
import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from '@/lib/echarts/lean-tooltip';
import { useCSSColors } from '@/theme/use-css-colors';
import { buildLineChartOption, createDebouncedResize } from './line-chart-model';
import type { LineChartProps as LineChartComponentProps } from './line-chart-model';

echarts.use([LineChartType, GridSimpleComponent, LegendComponent, CanvasRenderer]);

export type { ChartSeries, LineChartData, LineChartProps } from './line-chart-model';

/**
 * 有机体组件：折线图
 *
 * 用于展示时间序列数据（如 7 天趋势）
 *
 * 特性：
 * - 自动响应窗口尺寸变化（ResizeObserver）
 * - 支持移动端交互（点击 Tooltip）
 * - 使用项目设计系统图表色
 *
 * @example
 * <LineChart
 *   data={{
 *     series: [
 *       { name: 'GMV', data: [1000, 2000, 3000, ...] }
 *     ],
 *     xAxis: ['2026-02-10', '2026-02-11', ...]
 *   }}
 *   height={300}
 * />
 */
export const LineChart: React.FC<LineChartComponentProps> = ({
  title,
  data,
  theme = 'light',
  loading = false,
  height = 300,
  className = '',
  colors,
  showDataLabel = true,
  smooth = true,
  showArea = true,
  showPointSymbol = true,
  yAxisMinInterval,
  lineStep,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const cachedCssColors = useCSSColors();
  const chartHeight = resolveLineChartHeight(height);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    setLeanEchartsOption(
      chartInstance.current,
      buildLineChartOption({
        title,
        data,
        colors,
        showDataLabel,
        smooth,
        showArea,
        showPointSymbol,
        yAxisMinInterval,
        lineStep,
        cssColors: cachedCssColors,
        isDesktop,
      }),
    );

    const { fn: debouncedResize, cleanup: cleanupResize } = createDebouncedResize(() => {
      chartInstance.current?.resize();
    }, 300);

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      cleanupResize();
      if (chartInstance.current) {
        disposeLeanEcharts(chartInstance.current);
      }
      chartInstance.current = null;
    };
  }, [
    data,
    theme,
    title,
    colors,
    showDataLabel,
    smooth,
    showArea,
    showPointSymbol,
    yAxisMinInterval,
    lineStep,
    cachedCssColors,
  ]);

  return (
    <ChartContainer title={title} loading={loading} height={height}>
      <div
        ref={chartRef}
        className={`w-full ${className}`}
        style={{ height: chartHeight }}
      />
    </ChartContainer>
  );
};

export default LineChart;

function resolveLineChartHeight(height: number | string): string {
  return typeof height === 'number' ? `${height}px` : height;
}
