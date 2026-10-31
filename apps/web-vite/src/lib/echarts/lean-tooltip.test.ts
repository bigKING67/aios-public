import { describe, expect, it, vi } from 'vitest';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

import { ECHARTS_DARK_COLOR_PAIRS } from '@/lib/echarts-appearance';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';

import {
  disposeLeanEcharts,
  setLeanEchartsOption,
} from './lean-tooltip';

type ChartEventHandler = (params: unknown) => void;

function createChartMock() {
  const host = document.createElement('div');
  const handlers = new Map<string, ChartEventHandler>();
  const chart = {
    dispose: vi.fn(),
    getDom: vi.fn(() => host),
    off: vi.fn((eventName: string, handler: ChartEventHandler) => {
      if (handlers.get(eventName) === handler) {
        handlers.delete(eventName);
      }
    }),
    on: vi.fn((eventName: string, handler: ChartEventHandler) => {
      handlers.set(eventName, handler);
    }),
    setOption: vi.fn(),
    isDisposed: vi.fn(() => false),
  } as unknown as ECharts;

  return {
    chart,
    emit(eventName: string, params: unknown) {
      handlers.get(eventName)?.(params);
    },
    handlers,
    host,
  };
}

describe('lean ECharts tooltip', () => {
  it('builds the complete same-axis formatter payload and excludes hidden helper series', () => {
    const mock = createChartMock();
    const formatter = vi.fn((_params: unknown) => '<div class="axis-tooltip">formatted</div>');
    const option = {
      title: {
        text: 'Rendered by ChartContainer instead',
      },
      tooltip: {
        trigger: 'axis',
        formatter,
      },
      xAxis: {
        type: 'category',
        data: ['07/21', '07/22'],
      },
      series: [
        {
          name: 'GMV',
          type: 'bar',
          itemStyle: { color: 'var(--aios-chart-1)' },
          data: [10, 20],
        },
        {
          name: 'GSV',
          type: 'line',
          lineStyle: { color: 'var(--aios-chart-2)' },
          data: [30, { name: 'custom label', value: 40 }],
        },
        {
          name: 'layout helper',
          type: 'bar',
          tooltip: { show: false },
          data: [100, 200],
        },
      ],
    } satisfies EChartsCoreOption;

    setLeanEchartsOption(mock.chart, option);
    mock.emit('mouseover', {
      color: 'var(--aios-chart-1)',
      dataIndex: 1,
      event: { offsetX: 16, offsetY: 18 },
      name: '07/22',
      seriesName: 'GMV',
      value: 20,
    });

    const formatterParams = formatter.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(formatterParams).toHaveLength(2);
    expect(formatterParams.map((item) => item.seriesName)).toEqual(['GMV', 'GSV']);
    expect(formatterParams.map((item) => item.value)).toEqual([20, 40]);
    expect(formatterParams[0]).toMatchObject({
      axisValueLabel: '07/22',
      dataIndex: 1,
      name: '07/22',
    });
    expect(formatterParams[1]).toMatchObject({
      axisValueLabel: '07/22',
      dataIndex: 1,
      name: 'custom label',
    });
    expect(mock.host.querySelector('.axis-tooltip')).toHaveTextContent('formatted');

    const nativeOption = (mock.chart.setOption as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(nativeOption).not.toHaveProperty('title');
    expect(nativeOption).not.toHaveProperty('tooltip');
  });

  it('sanitizes formatter HTML while preserving the delegated note-link contract', () => {
    const mock = createChartMock();
    setLeanEchartsOption(mock.chart, {
      tooltip: {
        trigger: 'item',
        formatter: () => [
          '<div class="dashboard-note-tooltip-link" data-note-date="2026-07-22"',
          ' style="cursor:pointer;color:red;background-image:url(https://invalid.test/x)" onclick="alert(1)">',
          '<img src="x" onerror="alert(2)">',
          '<script>alert(3)</script>',
          '<span title="safe title">safe content</span>',
          '</div>',
        ].join(''),
      },
      series: [{ type: 'bar', data: [1] }],
    });

    mock.emit('mouseover', {
      dataIndex: 0,
      event: { offsetX: 4, offsetY: 6 },
      name: 'safe',
      value: 1,
    });

    const noteLink = mock.host.querySelector<HTMLElement>('.dashboard-note-tooltip-link');
    expect(noteLink).not.toBeNull();
    expect(noteLink).toHaveAttribute('data-note-date', '2026-07-22');
    expect(noteLink).not.toHaveAttribute('onclick');
    expect(noteLink).not.toHaveAttribute('style');
    expect(noteLink?.style.backgroundImage).toBe('');
    expect(noteLink?.querySelector('img')).toBeNull();
    expect(noteLink?.querySelector('script')).toBeNull();
    expect(noteLink?.querySelector('span')).toHaveAttribute('title', 'safe title');
  });

  it('clamps position, moves only while visible, hides on globalout, and fully cleans up', () => {
    const mock = createChartMock();
    Object.defineProperties(mock.host, {
      clientHeight: { configurable: true, value: 80 },
      clientWidth: { configurable: true, value: 100 },
    });
    const option = {
      tooltip: { trigger: 'item' },
      series: [{ type: 'bar', data: [1] }],
    } satisfies EChartsCoreOption;

    setLeanEchartsOption(mock.chart, option);
    const firstNode = mock.host.querySelector<HTMLDivElement>('[role="tooltip"]');
    expect(firstNode).not.toBeNull();
    Object.defineProperties(firstNode as HTMLDivElement, {
      offsetHeight: { configurable: true, value: 20 },
      offsetWidth: { configurable: true, value: 20 },
    });

    mock.emit('mousemove', { event: { offsetX: 90, offsetY: 70 } });
    expect(firstNode?.style.transform).toBe('');
    mock.emit('mouseover', { event: { offsetX: 90, offsetY: 70 }, name: 'A', value: 1 });
    expect(firstNode?.style.transform).toBe('translate(72px, 52px)');
    mock.emit('mousemove', { event: { offsetX: 1, offsetY: 2 } });
    expect(firstNode?.style.transform).toBe('translate(15px, 16px)');
    mock.emit('globalout', {});
    expect(firstNode).toHaveAttribute('hidden');

    setLeanEchartsOption(mock.chart, option);
    expect(firstNode).not.toBeInTheDocument();
    expect(mock.host.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(mock.chart.off).toHaveBeenCalledTimes(3);

    disposeLeanEcharts(mock.chart);
    expect(mock.host.querySelector('[role="tooltip"]')).toBeNull();
    expect(mock.host).not.toHaveClass('aios-echarts-tooltip-host');
    expect(mock.handlers.size).toBe(0);
    expect(mock.chart.off).toHaveBeenCalledTimes(6);
    expect(mock.chart.dispose).toHaveBeenCalledTimes(1);
  });

  it('draws in the current appearance and redraws live charts when the theme changes', async () => {
    const darkPrimary = ECHARTS_DARK_COLOR_PAIRS.find(([light]) => light === ECHARTS_CHART_TOKENS.primarySeries)?.[1];
    const lastColor = (chart: ECharts) => {
      const calls = vi.mocked(chart.setOption).mock.calls;
      return (calls[calls.length - 1][0] as { color: string[] }).color[0];
    };
    const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    const live = createChartMock();
    const disposed = createChartMock();
    const option = { color: [ECHARTS_CHART_TOKENS.primarySeries] } as EChartsCoreOption;

    try {
      setLeanEchartsOption(live.chart, option);
      setLeanEchartsOption(disposed.chart, option);
      expect(lastColor(live.chart)).toBe(darkPrimary);

      vi.mocked(disposed.chart.isDisposed).mockReturnValue(true);
      root.setAttribute('data-theme', 'light');
      await settle();
      expect(lastColor(live.chart)).toBe(ECHARTS_CHART_TOKENS.primarySeries);
      expect(disposed.chart.setOption).toHaveBeenCalledTimes(1);

      disposeLeanEcharts(live.chart);
      root.setAttribute('data-theme', 'dark');
      await settle();
      expect(live.chart.setOption).toHaveBeenCalledTimes(2);
    } finally {
      root.removeAttribute('data-theme');
    }
  });
});
