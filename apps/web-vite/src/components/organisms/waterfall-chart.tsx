'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart as BarChartType } from 'echarts/charts';
import { GridSimpleComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartContainer } from '../molecules/chart-container';
import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from '@/lib/echarts/lean-tooltip';
import { useCSSColors } from '@/theme/use-css-colors';
import {
  buildWaterfallChartComputedModel,
} from './waterfall-chart-model';
import type { WaterfallChartProps as WaterfallChartComponentProps } from './waterfall-chart-model';
import {
  buildWaterfallChartOption,
  type WaterfallRootStyleVars,
  type WaterfallLegendStyleVars,
} from './waterfall-chart-option';
import styles from './waterfall-chart.module.css';

echarts.use([BarChartType, GridSimpleComponent, MarkLineComponent, CanvasRenderer]);

export type { WaterfallChartProps, WaterfallStepItem } from './waterfall-chart-model';

export const WaterfallChart: React.FC<WaterfallChartComponentProps> = ({
  title,
  startLabel = '上周同期',
  endLabel = '本周同期',
  startValue,
  endValue,
  steps,
  totalColor,
  showBoundaryTotals = true,
  loading = false,
  height = 360,
  gridBottomPx,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const cachedCssColors = useCSSColors();
  const primaryColor = cachedCssColors.primary;
  const boundaryTotalColor = totalColor || primaryColor;

  const computed = useMemo(
    () =>
      buildWaterfallChartComputedModel({
        startLabel,
        endLabel,
        startValue,
        endValue,
        steps,
        primaryColor,
        boundaryTotalColor,
        showBoundaryTotals,
      }),
    [
      startValue,
      endValue,
      steps,
      startLabel,
      endLabel,
      boundaryTotalColor,
      showBoundaryTotals,
      primaryColor,
    ]
  );

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option: echarts.EChartsCoreOption = buildWaterfallChartOption({
      cachedCssColors,
      computed,
      endLabel,
      gridBottomPx,
      startLabel,
    });

    setLeanEchartsOption(chartInstance.current, option);

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstance.current) {
        disposeLeanEcharts(chartInstance.current);
      }
      chartInstance.current = null;
    };
  }, [cachedCssColors, computed, startLabel, endLabel, gridBottomPx]);

  const rootStyleVars: WaterfallRootStyleVars = {
    '--waterfall-chart-height': `${height}px`,
  };

  return (
    <ChartContainer title={title} loading={loading} height={height}>
      <div className={styles.root} style={rootStyleVars}>
        {computed.legendItems.length > 0 && (
          <div className={styles.legend}>
            {computed.legendItems.map((item) => (
              <div
                key={item.name}
                className={styles.legendItem}
                style={{ '--waterfall-legend-color': item.color } as WaterfallLegendStyleVars}
              >
                <span
                  className={styles.legendMarker}
                />
                <span className={styles.legendLabel}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        )}
        <div ref={chartRef} className={styles.chartCanvas} />
      </div>
    </ChartContainer>
  );
};

export default WaterfallChart;
