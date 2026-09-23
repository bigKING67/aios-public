'use client';

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart as BarChartType } from 'echarts/charts';
import { GridSimpleComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartContainer } from '../molecules/chart-container';
import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from '@/lib/echarts/lean-tooltip';
import { useCSSColors } from '@/theme/use-css-colors';
import { buildBarChartOption, createDebouncedResize } from './bar-chart-model';
import type { BarChartProps as BarChartComponentProps } from './bar-chart-model';

echarts.use([BarChartType, GridSimpleComponent, LegendComponent, CanvasRenderer]);

export type { BarChartProps, BarDataItem } from './bar-chart-model';

/**
 * 有机体 - 柱状图
 * 使用 ECharts 实现的柱状图表
 * 与后端 PDF 生成的图表样式完全一致
 */
export const BarChart: React.FC<BarChartComponentProps> = ({
  title,
  data,
  barColor = 'var(--chart-series-1)',
  secondaryBarColor = 'var(--chart-series-2)',
  primarySeriesName = 'GMV',
  secondarySeriesName = 'GSV',
  primaryAxisName = 'GMV',
  secondaryAxisName = 'GSV',
  loading = false,
  height = 300,
  className = '',
  showValueLabel = true,
  singleAxis = false,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const cachedCssColors = useCSSColors();

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    setLeanEchartsOption(
      chartInstance.current,
      buildBarChartOption({
        data,
        barColor,
        secondaryBarColor,
        primarySeriesName,
        secondarySeriesName,
        primaryAxisName,
        secondaryAxisName,
        showValueLabel,
        singleAxis,
        cssColors: cachedCssColors,
      }),
    );
    chartInstance.current.resize();

    const { fn: debouncedResize, cleanup: cleanupResize } = createDebouncedResize(() => {
      chartInstance.current?.resize();
    }, 300);

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(chartRef.current);
    window.addEventListener('resize', debouncedResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', debouncedResize);
      cleanupResize();
      if (chartInstance.current) {
        disposeLeanEcharts(chartInstance.current);
      }
      chartInstance.current = null;
    };
  }, [
    barColor,
    cachedCssColors,
    data,
    primaryAxisName,
    primarySeriesName,
    secondaryAxisName,
    secondaryBarColor,
    secondarySeriesName,
    showValueLabel,
    singleAxis,
  ]);

  return (
    <ChartContainer title={title} loading={loading} height={height} className={className}>
      <div ref={chartRef} className="w-full" style={{ height: `${height}px` }} />
    </ChartContainer>
  );
};

export default BarChart;
