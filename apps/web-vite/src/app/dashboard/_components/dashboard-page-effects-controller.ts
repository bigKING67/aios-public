import { useDashboardPageRequestEffects } from './dashboard-page-request-effects';
import {
  useDashboardDimensionSearchParamsSyncEffect,
  useDashboardInitialCustomRangeLimitWarningEffect,
} from './dashboard-shell-effects';
import {
  useDashboardEditingNoteStateEffect,
  useDashboardNoteDrawerScopeEffect,
  useDashboardNoteDraftDateSyncEffect,
  useDashboardOverviewNotePlatformFilterSyncEffect,
  useDashboardSelectedNoteDateStateEffect,
} from './dashboard-note-state-effects';
import { useDashboardGoodsScoreDrawerScopeEffect } from './dashboard-goods-score-state-effects';
import type { DashboardPageStateController } from './dashboard-page-state-controller';

export function useDashboardPageEffects(controller: DashboardPageStateController) {
  const {
    auth,
    dailyNoteCounts,
    detailDrawers,
    editNoteDraft,
    fetchOverviewWithCache,
    filter,
    goods,
    goodsCard,
    goodsCardResets,
    hasShownInitialCustomRangeLimitHintRef,
    initialState,
    live,
    liveResets,
    messageState,
    navigation,
    noteDrawer,
    noteMutation,
    noteResets,
    noteView,
    overview,
    qianchuan,
    range,
    renderContext,
    selectedDateNotes,
    shortVideo,
    tableUi,
    traffic,
    trafficResets,
  } = controller;
  const {
    isBusinessDimension,
    isDouyinGoodsCardDimension,
    isDouyinLiveDimension,
    isDouyinQianchuanDimension,
    isDouyinShortVideoDimension,
    isTmallGoodsDimension,
    isTmallTrafficDimension,
  } = renderContext.dimensionContentKindFlags;

  useDashboardInitialCustomRangeLimitWarningEffect({
    dateMode: filter.dateMode,
    customRangeExceededLimit: initialState.customRangeExceededLimit,
    hasShownInitialCustomRangeLimitHintRef,
    messageApi: messageState.messageApi,
  });

  useDashboardDimensionSearchParamsSyncEffect({
    activeDimension: filter.activeDimension,
    activeTab: filter.activeTab,
    pathname: navigation.pathname,
    navigate: navigation.navigate,
    searchParams: navigation.searchParams,
  });

  useDashboardNoteDrawerScopeEffect({
    isBusinessDimension,
    closeDailyNoteDrawer: noteResets.closeDailyNoteDrawer,
  });

  useDashboardGoodsScoreDrawerScopeEffect({
    isTmallGoodsDimension,
    resetGoodsScoreDrawerState: detailDrawers.resetGoodsScoreDrawerState,
  });

  useDashboardPageRequestEffects({
    isDateBoundsReady: controller.dateBoundsState.isDateBoundsReady,
    isBusinessDimension,
    isDouyinLiveDimension,
    isDouyinShortVideoDimension,
    isDouyinGoodsCardDimension,
    isDouyinQianchuanDimension,
    isTmallGoodsDimension,
    isTmallTrafficDimension,
    isGoodsCardTrafficDrawerOpen: detailDrawers.isGoodsCardTrafficDrawerOpen,
    selectedGoodsCardRow: detailDrawers.selectedGoodsCardRow,
    isAuthenticated: auth.isAuthenticated,
    isDayMode: renderContext.isDayMode,
    activeQueryPlatform: renderContext.activeQueryPlatform,
    activeTab: filter.activeTab,
    dateMode: filter.dateMode,
    dayValue: filter.dayValue,
    messageApi: messageState.messageApi,
    currentRange: range.currentRange,
    previousRange: range.previousRange,
    fetchOverviewWithCache,
    notesReloadToken: noteMutation.notesReloadToken,
    liveScope: live.liveScope,
    selectedNoteDate: noteDrawer.selectedNoteDate,
    setRealSnapshot: overview.setRealSnapshot,
    setOverviewLoadError: overview.setOverviewLoadError,
    setOverviewNowcastAsOfDate: overview.setOverviewNowcastAsOfDate,
    setOverviewNowcastQuality: overview.setOverviewNowcastQuality,
    setDayYearTrendSeries: overview.setDayYearTrendSeries,
    setWeekYearTrendSeries: overview.setWeekYearTrendSeries,
    setMonthYearTrendSeries: overview.setMonthYearTrendSeries,
    setDailyNoteCountsByDate: dailyNoteCounts.setDailyNoteCountsByDate,
    setDailyNotesLoading: dailyNoteCounts.setDailyNotesLoading,
    setDailyNotes: selectedDateNotes.setDailyNotes,
    setSelectedDateNotesLoading: selectedDateNotes.setSelectedDateNotesLoading,
    setDetailNowcastAsOfDate: overview.setDetailNowcastAsOfDate,
    setDetailRows: overview.setDetailRows,
    setDetailLoading: overview.setDetailLoading,
    setLiveData: live.setLiveData,
    setLiveLoadError: live.setLiveLoadError,
    setLiveGoodsData: live.setLiveGoodsData,
    setLiveGoodsLoadError: live.setLiveGoodsLoadError,
    setLiveGoodsLoading: live.setLiveGoodsLoading,
    setShortVideoData: shortVideo.setShortVideoData,
    setShortVideoLoadError: shortVideo.setShortVideoLoadError,
    setQianchuanData: qianchuan.setQianchuanData,
    setQianchuanLoadError: qianchuan.setQianchuanLoadError,
    setQianchuanLoading: qianchuan.setQianchuanLoading,
    setGoodsCardData: goodsCard.setGoodsCardData,
    setGoodsCardLoadError: goodsCard.setGoodsCardLoadError,
    setGoodsCardLoading: goodsCard.setGoodsCardLoading,
    setGoodsCardTrafficData: goodsCard.setGoodsCardTrafficData,
    setGoodsCardTrafficLoadError: goodsCard.setGoodsCardTrafficLoadError,
    setGoodsCardTrafficLoading: goodsCard.setGoodsCardTrafficLoading,
    setExpandedGoodsCardTrafficRowKeys: detailDrawers.setExpandedGoodsCardTrafficRowKeys,
    setGoodsData: goods.setGoodsData,
    setGoodsLoadError: goods.setGoodsLoadError,
    setGoodsLoading: goods.setGoodsLoading,
    setTrafficData: traffic.setTrafficData,
    setTrafficLoadError: traffic.setTrafficLoadError,
    setTrafficLoading: traffic.setTrafficLoading,
    setTrafficGoodsData: traffic.setTrafficGoodsData,
    setTrafficGoodsLoadError: traffic.setTrafficGoodsLoadError,
    setTrafficGoodsLoading: traffic.setTrafficGoodsLoading,
    resetOverviewState: overview.resetOverviewState,
    resetDayYearTrendSeriesState: overview.resetDayYearTrendSeriesState,
    resetWeekYearTrendSeriesState: overview.resetWeekYearTrendSeriesState,
    resetMonthYearTrendSeriesState: overview.resetMonthYearTrendSeriesState,
    resetDailyNoteCountsData: dailyNoteCounts.resetDailyNoteCountsData,
    resetDailyNoteCountsState: dailyNoteCounts.resetDailyNoteCountsState,
    resetSelectedDateNotesData: selectedDateNotes.resetSelectedDateNotesData,
    resetSelectedDateNotesState: noteResets.resetSelectedDateNotesState,
    resetDetailRowsState: overview.resetDetailRowsState,
    resetDetailState: overview.resetDetailState,
    resetLiveData: live.resetLiveData,
    resetLiveGoodsData: liveResets.resetLiveGoodsData,
    resetLiveGoodsExpansionState: tableUi.resetLiveGoodsExpansionState,
    resetLiveGoodsState: liveResets.resetLiveGoodsState,
    resetLiveState: liveResets.resetLiveState,
    resetShortVideoData: shortVideo.resetShortVideoData,
    resetShortVideoState: shortVideo.resetShortVideoState,
    resetQianchuanData: qianchuan.resetQianchuanData,
    resetQianchuanState: qianchuan.resetQianchuanState,
    resetGoodsCardData: goodsCard.resetGoodsCardData,
    resetGoodsCardTrafficDrawerData: goodsCardResets.resetGoodsCardTrafficDrawerData,
    resetGoodsCardTrafficRowsData: goodsCardResets.resetGoodsCardTrafficRowsData,
    resetGoodsCardState: goodsCardResets.resetGoodsCardState,
    resetGoodsData: goods.resetGoodsData,
    resetGoodsState: goods.resetGoodsState,
    resetTrafficExpansionState: tableUi.resetTrafficExpansionState,
    resetTrafficGoodsExpansionState: tableUi.resetTrafficGoodsExpansionState,
    resetTrafficGoodsRowsData: trafficResets.resetTrafficGoodsRowsData,
    resetTrafficGoodsState: trafficResets.resetTrafficGoodsState,
    resetTrafficRowsData: trafficResets.resetTrafficRowsData,
    resetTrafficState: trafficResets.resetTrafficState,
  });

  useDashboardSelectedNoteDateStateEffect({
    isBusinessDimension,
    isDayMode: renderContext.isDayMode,
    dayValue: renderContext.isDayMode ? range.currentRange.end : filter.dayValue,
    dateBounds: controller.dateBoundsState.dateBounds,
    isDateBoundsReady: controller.dateBoundsState.isDateBoundsReady,
    selectedNoteDate: noteDrawer.selectedNoteDate,
    closeDailyNoteDrawer: noteResets.closeDailyNoteDrawer,
    resetSelectedNoteDate: noteDrawer.resetSelectedNoteDate,
    setSelectedNoteDate: noteDrawer.setSelectedNoteDate,
  });

  useDashboardNoteDraftDateSyncEffect({
    selectedNoteDate: noteDrawer.selectedNoteDate,
    setNoteDraftDate: controller.createNoteDraft.setNoteDraftDate,
  });

  useDashboardOverviewNotePlatformFilterSyncEffect({
    activeQueryPlatform: renderContext.activeQueryPlatform,
    dailyNotes: selectedDateNotes.dailyNotes,
    overviewNotePlatformFilter: noteView.overviewNotePlatformFilter,
    setOverviewNotePlatformFilter: noteView.setOverviewNotePlatformFilter,
  });

  useDashboardEditingNoteStateEffect({
    dailyNotes: selectedDateNotes.dailyNotes,
    editingNoteId: editNoteDraft.editingNoteId,
    clearEditingNoteId: editNoteDraft.clearEditingNoteId,
    resetUpdatingNoteState: noteMutation.resetUpdatingNoteState,
  });
}
