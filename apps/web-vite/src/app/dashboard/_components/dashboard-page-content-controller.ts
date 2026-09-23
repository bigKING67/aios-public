import { createElement } from 'react';

import {
  DashboardBusinessContentBoundary,
  DashboardCommerceContentBoundary,
  DashboardMediaContentBoundary,
  DashboardQianchuanContentBoundary,
} from './dashboard-dimension-lazy-boundary';
import type { DashboardPageShellProps } from './dashboard-page-shell';
import type { DashboardPageStateController } from './dashboard-page-state-controller';

export function useDashboardPageShellProps(controller: DashboardPageStateController): DashboardPageShellProps {
  const {
    access,
    auth,
    canWriteDailyNote,
    createNoteDraft,
    dailyNoteCounts,
    detailDrawers,
    detailSectionShellProps,
    editNoteDraft,
    exportState,
    filter,
    goods,
    goodsCard,
    goodsCardResets,
    goodsMatrix,
    live,
    messageState,
    noteDrawer,
    noteMutation,
    noteResets,
    noteView,
    overview,
    qianchuan,
    range,
    renderContext,
    selectedDateNotes,
    shellHandlers,
    shortVideo,
    tableUi,
    traffic,
  } = controller;
  const {
    isBusinessDimension,
    isDouyinGoodsCardDimension,
    isDouyinLiveDimension,
    isDouyinQianchuanDimension,
    isDouyinShortVideoDimension,
  } = renderContext.dimensionContentKindFlags;

  const createBusinessContent = () => createElement(DashboardBusinessContentBoundary, {
    isAuthenticated: auth.isAuthenticated,
    isMobile: controller.viewport.isMobile,
    isBusinessDimension,
    isDayMode: renderContext.isDayMode,
    dateMode: filter.dateMode,
    currentRange: range.currentRange,
    activeTab: filter.activeTab,
    activeQueryPlatform: renderContext.activeQueryPlatform,
    canWriteDailyNote,
    messageApi: messageState.messageApi,
    dayValue: renderContext.isDayMode ? range.currentRange.end : filter.dayValue,
    detailSectionShellProps,
    overviewLoadError: overview.overviewLoadError,
    realSnapshot: overview.realSnapshot,
    fallbackSnapshot: range.fallbackSnapshot,
    detailNowcastAsOfDate: overview.detailNowcastAsOfDate,
    overviewNowcastAsOfDate: overview.overviewNowcastAsOfDate,
    overviewNowcastQuality: overview.overviewNowcastQuality,
    dayYearTrendSeries: overview.dayYearTrendSeries,
    weekYearTrendSeries: overview.weekYearTrendSeries,
    monthYearTrendSeries: overview.monthYearTrendSeries,
    detailRows: overview.detailRows,
    detailLoading: overview.detailLoading,
    isExportingDetails: exportState.isExportingDetails,
    setIsExportingDetails: exportState.setIsExportingDetails,
    dailyNoteCountsByDate: dailyNoteCounts.dailyNoteCountsByDate,
    dailyNotes: selectedDateNotes.dailyNotes,
    dailyNotesLoading: dailyNoteCounts.dailyNotesLoading,
    selectedDateNotesLoading: selectedDateNotes.selectedDateNotesLoading,
    showNoteMarkers: noteView.showNoteMarkers,
    toggleNoteMarkers: noteView.toggleNoteMarkers,
    overviewNotePlatformFilter: noteView.overviewNotePlatformFilter,
    setOverviewNotePlatformFilter: noteView.setOverviewNotePlatformFilter,
    isNoteDrawerOpen: noteDrawer.isNoteDrawerOpen,
    selectedNoteDate: noteDrawer.selectedNoteDate,
    setSelectedNoteDate: noteDrawer.setSelectedNoteDate,
    openNoteDrawer: noteDrawer.openNoteDrawer,
    closeDailyNoteDrawer: noteResets.closeDailyNoteDrawer,
    noteDraftDate: createNoteDraft.noteDraftDate,
    setNoteDraftDate: createNoteDraft.setNoteDraftDate,
    noteMetricKey: createNoteDraft.noteMetricKey,
    setNoteMetricKey: createNoteDraft.setNoteMetricKey,
    noteActionText: createNoteDraft.noteActionText,
    setNoteActionText: createNoteDraft.setNoteActionText,
    noteReasonText: createNoteDraft.noteReasonText,
    setNoteReasonText: createNoteDraft.setNoteReasonText,
    noteSummaryText: createNoteDraft.noteSummaryText,
    setNoteSummaryText: createNoteDraft.setNoteSummaryText,
    resetNoteDraftText: createNoteDraft.resetNoteDraftText,
    editingNoteId: editNoteDraft.editingNoteId,
    editMetricKey: editNoteDraft.editMetricKey,
    setEditMetricKey: editNoteDraft.setEditMetricKey,
    editActionText: editNoteDraft.editActionText,
    setEditActionText: editNoteDraft.setEditActionText,
    editReasonText: editNoteDraft.editReasonText,
    setEditReasonText: editNoteDraft.setEditReasonText,
    editSummaryText: editNoteDraft.editSummaryText,
    setEditSummaryText: editNoteDraft.setEditSummaryText,
    clearEditingNoteId: editNoteDraft.clearEditingNoteId,
    startEditingNoteDraft: editNoteDraft.startEditingNoteDraft,
    isSavingNote: noteMutation.isSavingNote,
    setIsSavingNote: noteMutation.setIsSavingNote,
    isUpdatingNote: noteMutation.isUpdatingNote,
    setIsUpdatingNote: noteMutation.setIsUpdatingNote,
    deletingNoteId: noteMutation.deletingNoteId,
    setDeletingNoteId: noteMutation.setDeletingNoteId,
    requestNotesReload: noteMutation.requestNotesReload,
    resetEditingNoteState: noteResets.resetEditingNoteState,
    resetUpdatingNoteState: noteMutation.resetUpdatingNoteState,
    resetDeletingNoteState: noteMutation.resetDeletingNoteState,
  });

  const mediaContentBoundaryProps = {
    isAuthenticated: auth.isAuthenticated,
    isMobile: controller.viewport.isMobile,
    currentRange: range.currentRange,
    messageApi: messageState.messageApi,
    detailSectionShellProps,
    isDouyinLiveDimension,
    liveData: live.liveData,
    liveLoadError: live.liveLoadError,
    liveGoodsData: live.liveGoodsData,
    liveGoodsLoadError: live.liveGoodsLoadError,
    liveGoodsLoading: live.liveGoodsLoading,
    liveScope: live.liveScope,
    setLiveScope: live.setLiveScope,
    expandedLiveGoodsRowKeys: tableUi.expandedLiveGoodsRowKeys,
    expandedLiveGoodsSessionKeys: tableUi.expandedLiveGoodsSessionKeys,
    liveGoodsSessionPage: tableUi.liveGoodsSessionPage,
    liveGoodsSessionPageSize: tableUi.liveGoodsSessionPageSize,
    setLiveGoodsSessionPage: tableUi.setLiveGoodsSessionPage,
    toggleLiveGoodsSession: tableUi.toggleLiveGoodsSession,
    toggleLiveGoodsProduct: tableUi.toggleLiveGoodsProduct,
    changeLiveGoodsPage: tableUi.changeLiveGoodsPage,
    isLiveMetricsDrawerOpen: detailDrawers.isLiveMetricsDrawerOpen,
    selectedLiveMetricsRow: detailDrawers.selectedLiveMetricsRow,
    openLiveMetricsDrawer: detailDrawers.openLiveMetricsDrawer,
    closeLiveMetricsDrawer: detailDrawers.closeLiveMetricsDrawer,
    isLiveFunnelDrawerOpen: detailDrawers.isLiveFunnelDrawerOpen,
    selectedLiveFunnelRow: detailDrawers.selectedLiveFunnelRow,
    setSelectedLiveFunnelRow: detailDrawers.setSelectedLiveFunnelRow,
    openLiveFunnelDrawer: detailDrawers.openLiveFunnelDrawer,
    closeLiveFunnelDrawer: detailDrawers.closeLiveFunnelDrawer,
    isExportingLiveDetails: exportState.isExportingLiveDetails,
    setIsExportingLiveDetails: exportState.setIsExportingLiveDetails,
    isExportingLiveGoodsDetails: exportState.isExportingLiveGoodsDetails,
    setIsExportingLiveGoodsDetails: exportState.setIsExportingLiveGoodsDetails,
    isDouyinShortVideoDimension,
    shortVideoData: shortVideo.shortVideoData,
    shortVideoLoadError: shortVideo.shortVideoLoadError,
    shortVideoScope: shortVideo.shortVideoScope,
    setShortVideoScope: shortVideo.setShortVideoScope,
    isExportingShortVideoDetails: exportState.isExportingShortVideoDetails,
    setIsExportingShortVideoDetails: exportState.setIsExportingShortVideoDetails,
  };
  const createMediaContent = (contentKind: 'live' | 'shortVideo') => (
    createElement(DashboardMediaContentBoundary, {
      ...mediaContentBoundaryProps,
      contentKind,
    })
  );

  const createQianchuanContent = () =>
    createElement(DashboardQianchuanContentBoundary, {
      isAuthenticated: auth.isAuthenticated,
      isMobile: controller.viewport.isMobile,
      currentRange: range.currentRange,
      messageApi: messageState.messageApi,
      qianchuanData: qianchuan.qianchuanData,
      qianchuanLoadError: qianchuan.qianchuanLoadError,
      qianchuanLoading: qianchuan.qianchuanLoading,
    });

  const commerceContentBoundaryProps = {
    isMobile: controller.viewport.isMobile,
    dashboardRangeLabel: range.dashboardRangeLabel,
    dashboardFallbackAsOfDate: range.dashboardFallbackAsOfDate,
    goodsData: goods.goodsData,
    goodsLoadError: goods.goodsLoadError,
    goodsLoading: goods.goodsLoading,
    goodsMatrixVisibleQuadrants: goodsMatrix.goodsMatrixVisibleQuadrants,
    toggleGoodsMatrixQuadrant: goodsMatrix.toggleGoodsMatrixQuadrant,
    selectedGoodsScoreDetail: detailDrawers.selectedGoodsScoreDetail,
    openGoodsScoreDrawer: detailDrawers.openGoodsScoreDrawer,
    closeGoodsScoreDrawer: detailDrawers.closeGoodsScoreDrawer,
    trafficData: traffic.trafficData,
    trafficLoadError: traffic.trafficLoadError,
    trafficLoading: traffic.trafficLoading,
    trafficGoodsData: traffic.trafficGoodsData,
    trafficGoodsLoadError: traffic.trafficGoodsLoadError,
    expandedTrafficRowKeys: tableUi.expandedTrafficRowKeys,
    trafficGoodsLoading: traffic.trafficGoodsLoading,
    expandedTrafficGoodsRowKeys: tableUi.expandedTrafficGoodsRowKeys,
    setExpandedTrafficRowKeys: tableUi.setExpandedTrafficRowKeys,
    setExpandedTrafficGoodsRowKeys: tableUi.setExpandedTrafficGoodsRowKeys,
    isDouyinGoodsCardDimension,
    goodsCardData: goodsCard.goodsCardData,
    goodsCardLoadError: goodsCard.goodsCardLoadError,
    goodsCardLoading: goodsCard.goodsCardLoading,
    goodsCardTrafficData: goodsCard.goodsCardTrafficData,
    goodsCardTrafficLoadError: goodsCard.goodsCardTrafficLoadError,
    goodsCardTrafficLoading: goodsCard.goodsCardTrafficLoading,
    isGoodsCardTrafficDrawerOpen: detailDrawers.isGoodsCardTrafficDrawerOpen,
    selectedGoodsCardRow: detailDrawers.selectedGoodsCardRow,
    openGoodsCardTrafficDrawer: detailDrawers.openGoodsCardTrafficDrawer,
    closeGoodsCardTrafficDrawer: detailDrawers.closeGoodsCardTrafficDrawer,
    resetGoodsCardTrafficDrawerData: goodsCardResets.resetGoodsCardTrafficDrawerData,
    expandedGoodsCardTrafficRowKeys: detailDrawers.expandedGoodsCardTrafficRowKeys,
    setExpandedGoodsCardTrafficRowKeys: detailDrawers.setExpandedGoodsCardTrafficRowKeys,
  };
  const createCommerceContent = (contentKind: 'goods' | 'traffic' | 'goodsCard') => (
    createElement(DashboardCommerceContentBoundary, {
      ...commerceContentBoundaryProps,
      contentKind,
      isGoodsScoreDrawerOpen: detailDrawers.isGoodsScoreDrawerOpen,
    })
  );

  const activeContentKind = renderContext.isOverviewTab ? 'business' : renderContext.dimensionContentKind;
  const dimensionContent = (() => {
    switch (activeContentKind) {
      case 'business':
        return createBusinessContent();
      case 'live':
        return createMediaContent('live');
      case 'shortVideo':
        return createMediaContent('shortVideo');
      case 'qianchuan':
        return isDouyinQianchuanDimension ? createQianchuanContent() : null;
      case 'goods':
        return createCommerceContent('goods');
      case 'traffic':
        return createCommerceContent('traffic');
      case 'goodsCard':
        return createCommerceContent('goodsCard');
      default:
        return null;
    }
  })();

  return {
    messageContextHolder: messageState.messageContextHolder,
    activeTab: filter.activeTab,
    allowedTabs: access.allowedTabs,
    visibleTabs: renderContext.visibleTabs,
    dateMode: filter.dateMode,
    dayValue: filter.dayValue,
    weekValue: filter.weekValue,
    monthValue: filter.monthValue,
    yearValue: filter.yearValue,
    customRange: filter.customRange,
    dateBounds: controller.dateBounds,
    isDateBoundsReady: controller.dateBoundsState.isDateBoundsReady,
    dateBoundsStatus: controller.dateBoundsState.dateBoundsStatus,
    onActiveTabChange: filter.setActiveTab,
    onDateModeChange: filter.setDateMode,
    onDayValueChange: filter.setDayValue,
    onWeekValueChange: filter.setWeekValue,
    onMonthValueChange: filter.setMonthValue,
    onYearValueChange: filter.setYearValue,
    onCustomRangeChange: filter.setCustomRange,
    onCustomRangeLimitExceeded: shellHandlers.handleCustomRangeLimitExceeded,
    isOverviewTab: renderContext.isOverviewTab,
    activeDimension: filter.activeDimension,
    effectiveDimension: renderContext.effectiveDimension,
    activeDimensionItems: renderContext.activeDimensionItems,
    dimensionContentKind: renderContext.dimensionContentKind,
    dimensionContent,
    onDimensionChange: filter.setActiveDimension,
  };
}
