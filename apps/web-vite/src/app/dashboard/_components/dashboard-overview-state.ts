import { useCallback, useState } from 'react';

import type {
  DashboardOverviewDetailRow,
  DashboardOverviewNowcastQuality,
  DashboardOverviewSeriesRow,
  DashboardSnapshot,
} from './dashboard-types';

export function useDashboardOverviewState() {
  const [realSnapshot, setRealSnapshot] = useState<DashboardSnapshot | null>(null);
  const [overviewLoadError, setOverviewLoadError] = useState<string | null>(null);
  const [dayYearTrendSeries, setDayYearTrendSeries] = useState<DashboardOverviewSeriesRow[]>([]);
  const [weekYearTrendSeries, setWeekYearTrendSeries] = useState<DashboardOverviewSeriesRow[]>([]);
  const [monthYearTrendSeries, setMonthYearTrendSeries] = useState<DashboardOverviewSeriesRow[]>([]);
  const [overviewNowcastAsOfDate, setOverviewNowcastAsOfDate] = useState<string | null>(null);
  const [overviewNowcastQuality, setOverviewNowcastQuality] =
    useState<DashboardOverviewNowcastQuality | null>(null);
  const [detailNowcastAsOfDate, setDetailNowcastAsOfDate] = useState<string | null>(null);
  const [detailRows, setDetailRows] = useState<DashboardOverviewDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const resetOverviewState = useCallback(() => {
    setRealSnapshot(null);
    setOverviewNowcastAsOfDate(null);
    setOverviewNowcastQuality(null);
    setOverviewLoadError(null);
  }, []);

  const resetDayYearTrendSeriesState = useCallback(() => {
    setDayYearTrendSeries([]);
  }, []);

  const resetWeekYearTrendSeriesState = useCallback(() => {
    setWeekYearTrendSeries([]);
  }, []);

  const resetMonthYearTrendSeriesState = useCallback(() => {
    setMonthYearTrendSeries([]);
  }, []);

  const resetDetailRowsState = useCallback(() => {
    setDetailNowcastAsOfDate(null);
    setDetailRows([]);
  }, []);

  const resetDetailState = useCallback(() => {
    resetDetailRowsState();
    setDetailLoading(false);
  }, [resetDetailRowsState]);

  return {
    realSnapshot,
    setRealSnapshot,
    overviewLoadError,
    setOverviewLoadError,
    dayYearTrendSeries,
    setDayYearTrendSeries,
    weekYearTrendSeries,
    setWeekYearTrendSeries,
    monthYearTrendSeries,
    setMonthYearTrendSeries,
    overviewNowcastAsOfDate,
    setOverviewNowcastAsOfDate,
    overviewNowcastQuality,
    setOverviewNowcastQuality,
    detailNowcastAsOfDate,
    setDetailNowcastAsOfDate,
    detailRows,
    setDetailRows,
    detailLoading,
    setDetailLoading,
    resetOverviewState,
    resetDayYearTrendSeriesState,
    resetWeekYearTrendSeriesState,
    resetMonthYearTrendSeriesState,
    resetDetailRowsState,
    resetDetailState,
  };
}
