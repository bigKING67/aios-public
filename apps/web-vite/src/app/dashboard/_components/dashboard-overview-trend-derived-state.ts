import { useMemo } from 'react';
import type { Dayjs } from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';

import type { DateMode } from './dashboard-config';
import type { DashboardNoteMarkPoint } from './dashboard-note-markers';
import type {
  DashboardOverviewSeriesRow,
  DashboardSnapshot,
} from './dashboard-types';
import {
  buildDashboardCustomMonthTrend,
  buildDashboardDayMiniTrendWindow,
  buildDashboardMonthYtdTrend,
  buildDashboardTrendContext,
  buildDashboardWeekYtdTrend,
  type DashboardTrendContext,
  type DashboardCustomTrendGranularity,
} from './dashboard-trend-context';
import { buildDashboardTrendOption } from './dashboard-trend-option';

type DashboardOverviewTrendDerivedStateArgs = {
  dateMode: DateMode;
  customTrendGranularity: DashboardCustomTrendGranularity;
  currentRangeStart: Dayjs;
  currentRangeEnd: Dayjs;
  snapshot: DashboardSnapshot;
  dayYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  weekYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  monthYearTrendSeries: readonly DashboardOverviewSeriesRow[];
};

export function useDashboardOverviewTrendDerivedState({
  dateMode,
  customTrendGranularity,
  currentRangeStart,
  currentRangeEnd,
  snapshot,
  dayYearTrendSeries,
  weekYearTrendSeries,
  monthYearTrendSeries,
}: DashboardOverviewTrendDerivedStateArgs) {
  const snapshotGsvSeries = useMemo(() => {
    const gsvSpotlight = snapshot.spotlight.find((item) => item.key === 'gsv');
    const gsvTrend = gsvSpotlight?.trend;
    if (Array.isArray(gsvTrend) && gsvTrend.length > 0) {
      return gsvTrend;
    }
    return snapshot.trendCurrent.map(() => 0);
  }, [snapshot.spotlight, snapshot.trendCurrent]);

  const weekYtdTrend = useMemo(
    () => buildDashboardWeekYtdTrend(weekYearTrendSeries),
    [weekYearTrendSeries]
  );

  const monthYtdTrend = useMemo(
    () =>
      buildDashboardMonthYtdTrend({
        dateMode,
        rows: monthYearTrendSeries,
        currentRangeEnd,
      }),
    [currentRangeEnd, dateMode, monthYearTrendSeries]
  );

  const customMonthTrend = useMemo(
    () =>
      dateMode === 'custom' && customTrendGranularity === 'month'
        ? buildDashboardCustomMonthTrend({
            rows: snapshot.trendRows,
            rangeStart: currentRangeStart,
            rangeEnd: currentRangeEnd,
          })
        : null,
    [customTrendGranularity, currentRangeEnd, currentRangeStart, dateMode, snapshot.trendRows]
  );

  const trendContext = useMemo(
    () =>
      buildDashboardTrendContext({
        dateMode,
        customTrendGranularity,
        customTrendRows: snapshot.trendRows,
        customMonthTrend,
        dayYearTrendSeries,
        snapshotTrendLabels: snapshot.trendLabels,
        snapshotTrendCurrent: snapshot.trendCurrent,
        snapshotGsvSeries,
        weekYtdTrend,
        monthYtdTrend,
      }),
    [
      dateMode,
      customMonthTrend,
      customTrendGranularity,
      dayYearTrendSeries,
      snapshot.trendCurrent,
      snapshot.trendLabels,
      snapshot.trendRows,
      snapshotGsvSeries,
      monthYtdTrend,
      weekYtdTrend,
    ]
  );

  const dayMiniTrendWindow = useMemo(
    () =>
      buildDashboardDayMiniTrendWindow({
        dateMode,
        dayYearTrendSeries,
      }),
    [dateMode, dayYearTrendSeries]
  );

  return {
    trendContext,
    dayMiniTrendWindow,
  };
}

type DashboardOverviewTrendOptionArgs = {
  trendContext: DashboardTrendContext;
  dailyNoteCountsByDate: Record<string, number>;
  isDayMode: boolean;
  showNoteMarkers: boolean;
  noteMarkPointData: DashboardNoteMarkPoint[];
};

export function useDashboardOverviewTrendOption({
  trendContext,
  dailyNoteCountsByDate,
  isDayMode,
  showNoteMarkers,
  noteMarkPointData,
}: DashboardOverviewTrendOptionArgs): EChartsCoreOption {
  return useMemo<EChartsCoreOption>(() => {
    const primaryAreaColor = {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: ECHARTS_CHART_TOKENS.primaryAreaStart },
        { offset: 1, color: ECHARTS_CHART_TOKENS.primaryAreaEnd },
      ],
    };

    return buildDashboardTrendOption({
      trendContext,
      dailyNoteCountsByDate,
      isDayMode,
      showNoteMarkers,
      noteMarkPointData,
      primaryAreaColor,
    });
  }, [dailyNoteCountsByDate, isDayMode, noteMarkPointData, showNoteMarkers, trendContext]);
}
