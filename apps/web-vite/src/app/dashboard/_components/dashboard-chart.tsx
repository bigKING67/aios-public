'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ECharts } from 'echarts/core';
import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from '@/lib/echarts/lean-tooltip';
import { DATE_LITERAL_PATTERN } from './dashboard-config';
import { loadDashboardEchartsRuntime } from './dashboard-echarts-runtime';
import { createDashboardChartResizeScheduler } from './dashboard-chart-resize-scheduler';
import type { DashboardChartProps } from './dashboard-types';
import chartHeaderStyles from './dashboard-chart-header.module.css';
import chartPanelStyles from './dashboard-chart-panel.module.css';

function getTooltipNoteDate(source: Element | null) {
  const noteDate = ((source as HTMLElement | null)?.getAttribute('data-note-date') || '').trim();
  return DATE_LITERAL_PATTERN.test(noteDate) ? noteDate : null;
}

export function DashboardChart({
  title,
  subtitle,
  option,
  headerExtra,
  footerNote,
  onPointClick,
  onNoteLinkClick,
  chartHeight,
  className,
}: DashboardChartProps) {
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const scheduleChartResizeRef = useRef<() => void>(() => undefined);
  const latestOptionRef = useRef(option);
  const latestPointClickRef = useRef(onPointClick);
  const latestNoteLinkClickRef = useRef(onNoteLinkClick);
  const [chartLoadError, setChartLoadError] = useState(false);
  const chartCanvasStyle = chartHeight ? ({ height: `${chartHeight}px` } as CSSProperties) : undefined;
  const hasSubtitle = subtitle !== null && subtitle !== undefined && subtitle !== false && subtitle !== '';

  latestOptionRef.current = option;
  latestPointClickRef.current = onPointClick;
  latestNoteLinkClickRef.current = onNoteLinkClick;

  const resizeChartToContainer = useCallback(() => {
    const chart = chartRef.current;
    const container = containerRef.current;

    if (!chart || !container) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width > 0 && height > 0) {
      chart.resize({ width, height });
      return;
    }

    chart.resize();
  }, []);

  const scheduleChartResize = useCallback(() => {
    scheduleChartResizeRef.current();
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || chartRef.current) {
      return;
    }

    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let chart: ECharts | null = null;
    const resizeScheduler = createDashboardChartResizeScheduler(
      resizeChartToContainer,
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
        setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimer: (timerId) => window.clearTimeout(timerId),
      },
    );
    scheduleChartResizeRef.current = resizeScheduler.schedule;
    const passiveListenerOptions = { passive: true } as const;
    const handleChartClick = (params: unknown) => {
      latestPointClickRef.current?.(params);
    };
    const handleWindowResize = () => {
      scheduleChartResize();
    };
    loadDashboardEchartsRuntime()
      .then((echarts) => {
        if (isCancelled || !containerRef.current) {
          return;
        }

        setChartLoadError(false);
        chart = echarts.init(containerRef.current);
        chartRef.current = chart;
        setLeanEchartsOption(chart, latestOptionRef.current, {
          notMerge: true,
          lazyUpdate: true,
        });
        chart.on('click', handleChartClick);

        resizeObserver = new ResizeObserver(() => {
          scheduleChartResize();
        });
        resizeObserver.observe(containerRef.current);
        if (panelRef.current && panelRef.current !== containerRef.current) {
          resizeObserver.observe(panelRef.current);
        }
        window.addEventListener('resize', handleWindowResize, passiveListenerOptions);
        window.visualViewport?.addEventListener('resize', handleWindowResize, passiveListenerOptions);
        scheduleChartResize();
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        console.error('[DashboardChart] failed to load ECharts runtime', error);
        setChartLoadError(true);
      });

    return () => {
      isCancelled = true;
      scheduleChartResizeRef.current = () => undefined;
      resizeScheduler.cancel();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.visualViewport?.removeEventListener('resize', handleWindowResize);
      if (chart) {
        disposeLeanEcharts(chart);
      }

      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [resizeChartToContainer, scheduleChartResize]);


  useEffect(() => {
    if (chartRef.current) {
      setLeanEchartsOption(chartRef.current, option, {
        notMerge: true,
        lazyUpdate: true,
      });
    }
    scheduleChartResize();
  }, [option, scheduleChartResize]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const noteLinkHandler = latestNoteLinkClickRef.current;
      if (!noteLinkHandler) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const clickable = target.closest('.dashboard-note-tooltip-link') as HTMLElement | null;
      if (!clickable) {
        return;
      }

      const noteDate = getTooltipNoteDate(clickable);
      if (!noteDate) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      noteLinkHandler(noteDate);
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);

  return (
    <section ref={panelRef} className={`${chartPanelStyles.panel}${className ? ` ${className}` : ''}`}>
      <header className={chartHeaderStyles.head}>
        <div className={chartHeaderStyles.headMain}>
          <h3 className={chartHeaderStyles.title}>{title}</h3>
          {hasSubtitle ? (
            typeof subtitle === 'string' ? (
              <p className={chartHeaderStyles.subtitleText}>{subtitle}</p>
            ) : (
              <div className={chartHeaderStyles.subtitleNode}>{subtitle}</div>
            )
          ) : null}
        </div>
        {headerExtra ? <div className={chartHeaderStyles.headActions}>{headerExtra}</div> : null}
      </header>
      <div ref={containerRef} className={chartPanelStyles.canvas} style={chartCanvasStyle} />
      {chartLoadError ? (
        <div className={chartPanelStyles.footerNote} role="alert">
          图表加载失败，请刷新页面重试。
        </div>
      ) : null}
      {footerNote ? <div className={chartPanelStyles.footerNote}>{footerNote}</div> : null}
    </section>
  );
}
