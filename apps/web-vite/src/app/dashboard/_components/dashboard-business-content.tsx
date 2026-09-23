import { useCallback, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';

import { DashboardBusinessOverviewSection } from './dashboard-business-overview-section';
import type {
  DashboardBusinessContent,
  DashboardBusinessContentArgs,
} from './dashboard-business-content-types';
import { useDashboardOverviewDetailExportActions } from './dashboard-overview-detail-export-actions';
import { useDashboardOverviewDetailViewState } from './dashboard-overview-detail-view-state';
import {
  useDashboardOverviewTrendDerivedState,
  useDashboardOverviewTrendOption,
} from './dashboard-overview-trend-derived-state';
import {
  resolveDefaultCustomTrendGranularity,
  type DashboardCustomTrendGranularity,
} from './dashboard-trend-context';
import { useDashboardOverviewNoteDerivedState } from './dashboard-overview-note-derived-state';
import { useDashboardNoteMutationHandlers } from './dashboard-note-mutation-handlers';
import { useDashboardNoteDrawerHandlers } from './dashboard-note-drawer-handlers';

export function useDashboardBusinessContent({
  isAuthenticated,
  isMobile,
  isBusinessDimension,
  isDayMode,
  dateMode,
  currentRange,
  activeTab,
  activeQueryPlatform,
  canWriteDailyNote,
  messageApi,
  dayValue,
  detailSectionShellProps,
  overviewLoadError,
  realSnapshot,
  fallbackSnapshot,
  detailNowcastAsOfDate,
  overviewNowcastAsOfDate,
  overviewNowcastQuality,
  dayYearTrendSeries,
  weekYearTrendSeries,
  monthYearTrendSeries,
  detailRows,
  detailLoading,
  isExportingDetails,
  setIsExportingDetails,
  dailyNoteCountsByDate,
  dailyNotes,
  dailyNotesLoading,
  selectedDateNotesLoading,
  showNoteMarkers,
  toggleNoteMarkers,
  overviewNotePlatformFilter,
  setOverviewNotePlatformFilter,
  isNoteDrawerOpen,
  selectedNoteDate,
  setSelectedNoteDate,
  openNoteDrawer,
  closeDailyNoteDrawer,
  noteDraftDate,
  setNoteDraftDate,
  noteMetricKey,
  setNoteMetricKey,
  noteActionText,
  setNoteActionText,
  noteReasonText,
  setNoteReasonText,
  noteSummaryText,
  setNoteSummaryText,
  resetNoteDraftText,
  editingNoteId,
  editMetricKey,
  setEditMetricKey,
  editActionText,
  setEditActionText,
  editReasonText,
  setEditReasonText,
  editSummaryText,
  setEditSummaryText,
  clearEditingNoteId,
  startEditingNoteDraft,
  isSavingNote,
  setIsSavingNote,
  isUpdatingNote,
  setIsUpdatingNote,
  deletingNoteId,
  setDeletingNoteId,
  requestNotesReload,
  resetEditingNoteState,
  resetUpdatingNoteState,
  resetDeletingNoteState,
  overviewDetailTableClassNames,
}: DashboardBusinessContentArgs): DashboardBusinessContent {
  const snapshot = realSnapshot ?? fallbackSnapshot;
  const showPlatformShare = activeTab === 'overview';
  const customTrendRangeKey = `${currentRange.start.format('YYYY-MM-DD')}|${currentRange.end.format('YYYY-MM-DD')}`;
  const defaultCustomTrendGranularity = resolveDefaultCustomTrendGranularity({
    rangeStart: currentRange.start,
    rangeEnd: currentRange.end,
  });
  const [customTrendState, setCustomTrendState] = useState<{
    rangeKey: string;
    granularity: DashboardCustomTrendGranularity;
  }>(() => ({
    rangeKey: customTrendRangeKey,
    granularity: defaultCustomTrendGranularity,
  }));
  const customTrendGranularity = customTrendState.rangeKey === customTrendRangeKey
    ? customTrendState.granularity
    : defaultCustomTrendGranularity;
  const handleCustomTrendGranularityChange = useCallback(
    (granularity: DashboardCustomTrendGranularity) => {
      setCustomTrendState({
        rangeKey: customTrendRangeKey,
        granularity,
      });
    },
    [customTrendRangeKey]
  );
  const showCustomTrendGranularity = dateMode === 'custom';
  const customMonthIsPartial = !currentRange.start.isSame(currentRange.start.startOf('month'), 'day')
    || !currentRange.end.isSame(currentRange.end.endOf('month'), 'day');
  const trendSubtitle = showCustomTrendGranularity && customTrendGranularity === 'month'
    ? customMonthIsPartial
      ? '按自然月汇总；不完整月份按所选日期范围统计'
      : '按自然月汇总'
    : undefined;
  const nowcastAsOfDateForDisplay = detailNowcastAsOfDate || overviewNowcastAsOfDate;
  const selectedNoteCount = selectedNoteDate ? dailyNoteCountsByDate[selectedNoteDate] || 0 : 0;
  const {
    trendContext,
    dayMiniTrendWindow,
  } = useDashboardOverviewTrendDerivedState({
    dateMode,
    customTrendGranularity,
    currentRangeStart: currentRange.start,
    currentRangeEnd: currentRange.end,
    snapshot,
    dayYearTrendSeries,
    weekYearTrendSeries,
    monthYearTrendSeries,
  });

  const {
    noteMarkPointData,
    overviewNotesByPlatform,
    visibleNotesForSelectedDate,
  } = useDashboardOverviewNoteDerivedState({
    showNoteMarkers,
    isDayMode,
    trendDateKeys: trendContext.dateKeys,
    trendPrimarySeries: trendContext.primarySeries,
    dailyNoteCountsByDate,
    dailyNotes,
    activeQueryPlatform,
    overviewNotePlatformFilter,
  });

  const trendOption = useDashboardOverviewTrendOption({
    trendContext,
    dailyNoteCountsByDate,
    isDayMode,
    showNoteMarkers,
    noteMarkPointData,
  });

  const {
    handleCreateDailyNote,
    handleCancelEditDailyNote,
    handleSaveEditDailyNote,
    handleDeleteDailyNote,
  } = useDashboardNoteMutationHandlers({
    activeQueryPlatform,
    canWriteDailyNote,
    messageApi,
    noteDraftDate,
    selectedNoteDate,
    noteMetricKey,
    noteActionText,
    noteReasonText,
    noteSummaryText,
    editMetricKey,
    editActionText,
    editReasonText,
    editSummaryText,
    editingNoteId,
    isSavingNote,
    isUpdatingNote,
    deletingNoteId,
    setIsSavingNote,
    setIsUpdatingNote,
    setDeletingNoteId,
    setSelectedNoteDate,
    requestNotesReload,
    resetNoteDraftText,
    resetEditingNoteState,
    resetUpdatingNoteState,
    resetDeletingNoteState,
  });

  const {
    handleTrendPointClick,
    handleCloseDailyNoteDrawer,
    handleNoteDraftDateChange,
    handleSaveEditDailyNoteAction,
    handleDeleteDailyNoteAction,
    handleCreateDailyNoteAction,
    handleOpenDailyNoteDrawerAction,
  } = useDashboardNoteDrawerHandlers({
    isBusinessDimension,
    isDayMode,
    showNoteMarkers,
    dayValue,
    selectedNoteDate,
    dailyNoteCountsByDate,
    trendDateKeys: trendContext.dateKeys,
    clearEditingNoteId,
    setNoteDraftDate,
    setSelectedNoteDate,
    openNoteDrawer,
    closeDailyNoteDrawer,
    handleCreateDailyNote,
    handleSaveEditDailyNote,
    handleDeleteDailyNote,
  });

  const { handleExportOverviewDetailsAction, disableDetailExport } = useDashboardOverviewDetailExportActions({
    isAuthenticated,
    messageApi,
    currentRange,
    activeTab,
    detailRows,
    detailLoading,
    isExportingDetails,
    setIsExportingDetails,
  });

  const {
    detailColumns,
    detailTablePagination,
    shareOption,
  } = useDashboardOverviewDetailViewState({
    isMobile,
    share: snapshot.share,
    overviewDetailTableClassNames,
  });

  const overviewDetailProps = {
    ...detailSectionShellProps,
    isExporting: isExportingDetails,
    disableExport: disableDetailExport,
    rows: detailRows,
    loading: detailLoading,
    columns: detailColumns,
    pagination: detailTablePagination,
    nowcastAsOfDate: nowcastAsOfDateForDisplay,
    nowcastQuality: overviewNowcastQuality,
    onExport: handleExportOverviewDetailsAction,
  };
  const noteDrawerProps = {
    open: isNoteDrawerOpen,
    isMobile,
    isDayMode,
    onClose: handleCloseDailyNoteDrawer,
    selectedNoteDate,
    noteDraftDate,
    selectedNoteCount,
    onNoteDraftDateChange: handleNoteDraftDateChange,
    activeQueryPlatform,
    overviewNotePlatformFilter,
    overviewNotesByPlatform,
    visibleNotesForSelectedDate,
    selectedDateNotesLoading,
    canWriteDailyNote,
    deletingNoteId,
    onOverviewNotePlatformFilterChange: setOverviewNotePlatformFilter,
    onStartEditDailyNote: startEditingNoteDraft,
    onDeleteDailyNote: handleDeleteDailyNoteAction,
    editingNoteId,
    editMetricKey,
    editActionText,
    editReasonText,
    editSummaryText,
    isUpdatingNote,
    onEditMetricKeyChange: setEditMetricKey,
    onEditActionTextChange: setEditActionText,
    onEditReasonTextChange: setEditReasonText,
    onEditSummaryTextChange: setEditSummaryText,
    onSaveEditDailyNote: handleSaveEditDailyNoteAction,
    onCancelEditDailyNote: handleCancelEditDailyNote,
    noteMetricKey,
    noteActionText,
    noteReasonText,
    noteSummaryText,
    isSavingNote,
    onNoteMetricKeyChange: setNoteMetricKey,
    onNoteActionTextChange: setNoteActionText,
    onNoteReasonTextChange: setNoteReasonText,
    onNoteSummaryTextChange: setNoteSummaryText,
    onCreateDailyNote: handleCreateDailyNoteAction,
  };
  const businessOverviewSectionProps = {
    overviewLoadError,
    hasRealSnapshot: Boolean(realSnapshot),
    snapshot,
    dayMiniTrendWindow,
    showPlatformShare,
    trendTitle: trendContext.title,
    trendSubtitle,
    trendOption,
    shareOption: shareOption as EChartsCoreOption,
    isDayMode,
    showCustomTrendGranularity,
    customTrendGranularity,
    showNoteMarkers,
    dailyNotesLoading,
    activeQueryPlatform,
    canWriteDailyNote,
    overviewDetailProps,
    noteDrawerProps,
    onToggleNoteMarkers: toggleNoteMarkers,
    onOpenDailyNoteDrawer: handleOpenDailyNoteDrawerAction,
    onTrendPointClick: handleTrendPointClick,
    onCustomTrendGranularityChange: handleCustomTrendGranularityChange,
  };

  return {
    businessContent: <DashboardBusinessOverviewSection {...businessOverviewSectionProps} />,
    snapshot,
  };
}
