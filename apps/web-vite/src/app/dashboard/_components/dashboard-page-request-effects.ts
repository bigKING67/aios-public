import { useDashboardGoodsCardRequestEffect } from './dashboard-goods-card-request-effect';
import { useDashboardGoodsCardTrafficRequestEffect } from './dashboard-goods-card-traffic-request-effect';
import { useDashboardGoodsRequestEffect } from './dashboard-goods-request-effect';
import { useDashboardLiveGoodsRequestEffect } from './dashboard-live-goods-request-effect';
import { useDashboardLiveRequestEffect } from './dashboard-live-request-effect';
import { useDashboardNoteCountsRequestEffect } from './dashboard-note-counts-request-effect';
import { useDashboardOverviewDayTrendRequestEffect } from './dashboard-overview-day-trend-request-effect';
import { useDashboardOverviewDetailsRequestEffect } from './dashboard-overview-details-request-effect';
import { useDashboardOverviewMainRequestEffect } from './dashboard-overview-main-request-effect';
import { useDashboardOverviewMonthTrendRequestEffect } from './dashboard-overview-month-trend-request-effect';
import { useDashboardOverviewWeekTrendRequestEffect } from './dashboard-overview-week-trend-request-effect';
import { useDashboardSelectedDateNotesRequestEffect } from './dashboard-selected-date-notes-request-effect';
import { useDashboardQianchuanRequestEffect } from './dashboard-qianchuan-request-effect';
import { useDashboardShortVideoRequestEffect } from './dashboard-short-video-request-effect';
import { useDashboardTrafficGoodsRequestEffect } from './dashboard-traffic-goods-request-effect';
import { useDashboardTrafficRequestEffect } from './dashboard-traffic-request-effect';
import type { DashboardGoodsCardRow } from './dashboard-types';

type DashboardPageRequestEffectsArgs = {
  isDateBoundsReady: boolean;
  isBusinessDimension: boolean;
  isDouyinLiveDimension: boolean;
  isDouyinShortVideoDimension: boolean;
  isDouyinGoodsCardDimension: boolean;
  isDouyinQianchuanDimension: boolean;
  isTmallGoodsDimension: boolean;
  isTmallTrafficDimension: boolean;
  isGoodsCardTrafficDrawerOpen: boolean;
  selectedGoodsCardRow: DashboardGoodsCardRow | null;
} & Omit<Parameters<typeof useDashboardOverviewMainRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardOverviewDayTrendRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardOverviewWeekTrendRequestEffect>[0], 'isEnabled'>
  & Parameters<typeof useDashboardNoteCountsRequestEffect>[0]
  & Parameters<typeof useDashboardSelectedDateNotesRequestEffect>[0]
  & Omit<Parameters<typeof useDashboardOverviewDetailsRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardLiveRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardLiveGoodsRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardShortVideoRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardQianchuanRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardGoodsCardRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardGoodsCardTrafficRequestEffect>[0], 'isEnabled' | 'isDrawerOpen'>
  & Omit<Parameters<typeof useDashboardGoodsRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardTrafficRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardTrafficGoodsRequestEffect>[0], 'isEnabled'>
  & Omit<Parameters<typeof useDashboardOverviewMonthTrendRequestEffect>[0], 'isEnabled'>;

export function useDashboardPageRequestEffects(args: DashboardPageRequestEffectsArgs) {
  const canRequestDashboardData = args.isDateBoundsReady;
  const effectiveDayValue = args.dateMode === 'day' ? args.currentRange.end : args.dayValue;

  useDashboardOverviewMainRequestEffect({
    isEnabled: canRequestDashboardData && args.isBusinessDimension,
    activeTab: args.activeTab,
    dateMode: args.dateMode,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    fetchOverviewWithCache: args.fetchOverviewWithCache,
    setRealSnapshot: args.setRealSnapshot,
    setOverviewLoadError: args.setOverviewLoadError,
    setOverviewNowcastAsOfDate: args.setOverviewNowcastAsOfDate,
    setOverviewNowcastQuality: args.setOverviewNowcastQuality,
    resetOverviewState: args.resetOverviewState,
  });

  useDashboardOverviewDayTrendRequestEffect({
    isEnabled: canRequestDashboardData && args.isBusinessDimension,
    activeTab: args.activeTab,
    dateMode: args.dateMode,
    dayValue: effectiveDayValue,
    fetchOverviewWithCache: args.fetchOverviewWithCache,
    setDayYearTrendSeries: args.setDayYearTrendSeries,
    resetDayYearTrendSeriesState: args.resetDayYearTrendSeriesState,
  });

  useDashboardOverviewWeekTrendRequestEffect({
    isEnabled: canRequestDashboardData && args.isBusinessDimension,
    activeTab: args.activeTab,
    dateMode: args.dateMode,
    currentRange: args.currentRange,
    fetchOverviewWithCache: args.fetchOverviewWithCache,
    setWeekYearTrendSeries: args.setWeekYearTrendSeries,
    resetWeekYearTrendSeriesState: args.resetWeekYearTrendSeriesState,
  });

  useDashboardNoteCountsRequestEffect({
    isAuthenticated: canRequestDashboardData && args.isAuthenticated,
    isBusinessDimension: args.isBusinessDimension,
    isDayMode: args.isDayMode,
    activeQueryPlatform: args.activeQueryPlatform,
    dayValue: effectiveDayValue,
    notesReloadToken: args.notesReloadToken,
    setDailyNoteCountsByDate: args.setDailyNoteCountsByDate,
    setDailyNotesLoading: args.setDailyNotesLoading,
    resetDailyNoteCountsData: args.resetDailyNoteCountsData,
    resetDailyNoteCountsState: args.resetDailyNoteCountsState,
  });

  useDashboardSelectedDateNotesRequestEffect({
    isAuthenticated: canRequestDashboardData && args.isAuthenticated,
    isBusinessDimension: args.isBusinessDimension,
    isDayMode: args.isDayMode,
    activeQueryPlatform: args.activeQueryPlatform,
    selectedNoteDate: args.selectedNoteDate,
    notesReloadToken: args.notesReloadToken,
    setDailyNotes: args.setDailyNotes,
    setSelectedDateNotesLoading: args.setSelectedDateNotesLoading,
    resetSelectedDateNotesData: args.resetSelectedDateNotesData,
    resetSelectedDateNotesState: args.resetSelectedDateNotesState,
  });

  useDashboardOverviewDetailsRequestEffect({
    isEnabled: canRequestDashboardData && args.isBusinessDimension,
    activeTab: args.activeTab,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    setDetailNowcastAsOfDate: args.setDetailNowcastAsOfDate,
    setDetailRows: args.setDetailRows,
    setDetailLoading: args.setDetailLoading,
    resetDetailRowsState: args.resetDetailRowsState,
    resetDetailState: args.resetDetailState,
  });

  useDashboardLiveRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinLiveDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setLiveData: args.setLiveData,
    setLiveLoadError: args.setLiveLoadError,
    resetLiveData: args.resetLiveData,
    resetLiveState: args.resetLiveState,
  });

  useDashboardLiveGoodsRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinLiveDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    liveScope: args.liveScope,
    setLiveGoodsData: args.setLiveGoodsData,
    setLiveGoodsLoadError: args.setLiveGoodsLoadError,
    setLiveGoodsLoading: args.setLiveGoodsLoading,
    resetLiveGoodsData: args.resetLiveGoodsData,
    resetLiveGoodsExpansionState: args.resetLiveGoodsExpansionState,
    resetLiveGoodsState: args.resetLiveGoodsState,
  });

  useDashboardShortVideoRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinShortVideoDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setShortVideoData: args.setShortVideoData,
    setShortVideoLoadError: args.setShortVideoLoadError,
    resetShortVideoData: args.resetShortVideoData,
    resetShortVideoState: args.resetShortVideoState,
  });

  useDashboardQianchuanRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinQianchuanDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setQianchuanData: args.setQianchuanData,
    setQianchuanLoadError: args.setQianchuanLoadError,
    setQianchuanLoading: args.setQianchuanLoading,
    resetQianchuanData: args.resetQianchuanData,
    resetQianchuanState: args.resetQianchuanState,
  });

  useDashboardGoodsCardRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinGoodsCardDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setGoodsCardData: args.setGoodsCardData,
    setGoodsCardLoadError: args.setGoodsCardLoadError,
    setGoodsCardLoading: args.setGoodsCardLoading,
    resetGoodsCardData: args.resetGoodsCardData,
    resetGoodsCardState: args.resetGoodsCardState,
  });

  useDashboardGoodsCardTrafficRequestEffect({
    isEnabled: canRequestDashboardData && args.isDouyinGoodsCardDimension,
    isDrawerOpen: args.isGoodsCardTrafficDrawerOpen,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    selectedGoodsCardRow: args.selectedGoodsCardRow,
    setGoodsCardTrafficData: args.setGoodsCardTrafficData,
    setGoodsCardTrafficLoadError: args.setGoodsCardTrafficLoadError,
    setGoodsCardTrafficLoading: args.setGoodsCardTrafficLoading,
    setExpandedGoodsCardTrafficRowKeys: args.setExpandedGoodsCardTrafficRowKeys,
    resetGoodsCardTrafficDrawerData: args.resetGoodsCardTrafficDrawerData,
    resetGoodsCardTrafficRowsData: args.resetGoodsCardTrafficRowsData,
  });

  useDashboardGoodsRequestEffect({
    isEnabled: canRequestDashboardData && args.isTmallGoodsDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setGoodsData: args.setGoodsData,
    setGoodsLoadError: args.setGoodsLoadError,
    setGoodsLoading: args.setGoodsLoading,
    resetGoodsData: args.resetGoodsData,
    resetGoodsState: args.resetGoodsState,
  });

  useDashboardTrafficRequestEffect({
    isEnabled: canRequestDashboardData && args.isTmallTrafficDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setTrafficData: args.setTrafficData,
    setTrafficLoadError: args.setTrafficLoadError,
    setTrafficLoading: args.setTrafficLoading,
    resetTrafficExpansionState: args.resetTrafficExpansionState,
    resetTrafficRowsData: args.resetTrafficRowsData,
    resetTrafficState: args.resetTrafficState,
    resetTrafficGoodsState: args.resetTrafficGoodsState,
  });

  useDashboardTrafficGoodsRequestEffect({
    isEnabled: canRequestDashboardData && args.isTmallTrafficDimension,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    previousRange: args.previousRange,
    setTrafficGoodsData: args.setTrafficGoodsData,
    setTrafficGoodsLoadError: args.setTrafficGoodsLoadError,
    setTrafficGoodsLoading: args.setTrafficGoodsLoading,
    resetTrafficGoodsExpansionState: args.resetTrafficGoodsExpansionState,
    resetTrafficGoodsRowsData: args.resetTrafficGoodsRowsData,
    resetTrafficGoodsState: args.resetTrafficGoodsState,
  });

  useDashboardOverviewMonthTrendRequestEffect({
    isEnabled: canRequestDashboardData && args.isBusinessDimension,
    activeTab: args.activeTab,
    dateMode: args.dateMode,
    currentRange: args.currentRange,
    fetchOverviewWithCache: args.fetchOverviewWithCache,
    setMonthYearTrendSeries: args.setMonthYearTrendSeries,
    resetMonthYearTrendSeriesState: args.resetMonthYearTrendSeriesState,
  });
}
