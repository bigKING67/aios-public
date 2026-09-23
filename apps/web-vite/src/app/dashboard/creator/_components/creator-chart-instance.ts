'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from '@/lib/echarts/lean-tooltip';

export interface UseCreatorChartInstanceParams {
  option?: EChartsCoreOption;
  onChartClick?: (params: unknown) => void;
}

export function useCreatorChartInstance({ option, onChartClick }: UseCreatorChartInstanceParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!containerRef.current || chartRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current, undefined, {
      renderer: 'canvas',
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chartRef.current?.resize();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      try {
        if (chartRef.current) {
          disposeLeanEcharts(chartRef.current);
        }
      } catch {
        // Ignore dispose race when container is being reconciled by React.
      }
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    if (!option) {
      chartRef.current.clear();
      return;
    }
    setLeanEchartsOption(chartRef.current, option, {
      notMerge: true,
      lazyUpdate: true,
    });
    chartRef.current.resize();
  }, [option]);

  useEffect(() => {
    const chartInstance = chartRef.current;
    if (!chartInstance || !onChartClick) {
      return;
    }

    const handleClick = (params: unknown) => {
      onChartClick(params);
    };

    chartInstance.on('click', handleClick);
    return () => {
      chartInstance.off('click', handleClick);
    };
  }, [onChartClick]);

  return containerRef;
}
