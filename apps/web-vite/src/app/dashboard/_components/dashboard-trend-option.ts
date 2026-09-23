import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import type { EChartsCoreOption } from 'echarts/core';
import { toCompactNumber } from './dashboard-formatters';
import type { DashboardNoteMarkPoint } from './dashboard-note-markers';
import { formatDashboardTrendTooltip } from './dashboard-trend-tooltip';

export interface DashboardTrendOptionContext {
  chartType: 'bar' | 'line';
  labels: readonly string[];
  tooltipLabels?: readonly string[];
  primarySeries: readonly number[];
  secondarySeries: readonly number[];
  dateKeys: readonly string[];
  primaryLabel: string;
  secondaryLabel: string;
  secondaryColor: string;
}

export function buildDashboardTrendOption(params: {
  trendContext: DashboardTrendOptionContext;
  dailyNoteCountsByDate: Record<string, number>;
  isDayMode: boolean;
  showNoteMarkers: boolean;
  noteMarkPointData: DashboardNoteMarkPoint[];
  primaryAreaColor: unknown;
}): EChartsCoreOption {
  const tokens = ECHARTS_CHART_TOKENS;
  const isBarTrend = params.trendContext.chartType === 'bar';
  const primary = tokens.primarySeries;
  const secondary = params.trendContext.secondaryColor;
  const hasDayNoteLayer = params.isDayMode && params.showNoteMarkers && params.noteMarkPointData.length > 0;
  const noteMarkPoint = hasDayNoteLayer
    ? {
        symbol: 'circle',
        symbolSize: 16,
        data: params.noteMarkPointData,
        itemStyle: {
          color: tokens.warningSeries,
          borderColor: tokens.surface,
          borderWidth: 1,
        },
        label: {
          show: true,
          formatter: '{@value}',
          color: tokens.textInverse,
          fontSize: 10,
          fontWeight: 700,
        },
      }
    : undefined;

  return {
    grid: {
      left: '3%',
      right: '4%',
      top: '12%',
      bottom: '6%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      enterable: true,
      formatter: (tooltipParams: unknown) => {
        return formatDashboardTrendTooltip({
          tooltipParams,
          tooltipLabels: params.trendContext.tooltipLabels,
          dateKeys: params.trendContext.dateKeys,
          countsByDate: params.dailyNoteCountsByDate,
          showNoteMarkers: params.showNoteMarkers,
          warningColor: tokens.warningSeries,
        });
      },
    },
    legend: {
      left: 'center',
      top: 4,
      textStyle: {
        color: tokens.textSecondary,
        fontSize: 12,
      },
    },
    xAxis: {
      type: 'category',
      data: params.trendContext.labels,
      boundaryGap: isBarTrend,
      axisLine: { lineStyle: { color: tokens.axisLine } },
      axisLabel: {
        color: tokens.textTertiary,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: tokens.gridLine, type: 'dashed' } },
      axisLabel: {
        color: tokens.textTertiary,
        formatter: (value: number) => toCompactNumber(value),
      },
    },
    series: isBarTrend
      ? [
          {
            name: params.trendContext.primaryLabel,
            type: 'bar',
            barWidth: 18,
            data: params.trendContext.primarySeries,
            itemStyle: {
              color: primary,
              borderRadius: [8, 8, 0, 0],
            },
            markPoint: noteMarkPoint,
          },
          {
            name: params.trendContext.secondaryLabel,
            type: 'bar',
            barWidth: 18,
            data: params.trendContext.secondarySeries,
            itemStyle: {
              color: secondary,
              borderRadius: [8, 8, 0, 0],
            },
          },
        ]
      : [
          {
            name: params.trendContext.primaryLabel,
            type: 'line',
            smooth: true,
            showSymbol: false,
            symbol: 'none',
            symbolSize: 0,
            data: params.trendContext.primarySeries,
            lineStyle: {
              width: 2.4,
              color: primary,
            },
            areaStyle: {
              color: params.primaryAreaColor,
            },
            markPoint: noteMarkPoint,
          },
          {
            name: params.trendContext.secondaryLabel,
            type: 'line',
            smooth: true,
            showSymbol: false,
            symbol: 'none',
            symbolSize: 0,
            data: params.trendContext.secondarySeries,
            lineStyle: {
              width: 2,
              color: secondary,
              type: 'solid',
            },
          },
        ],
  };
}
