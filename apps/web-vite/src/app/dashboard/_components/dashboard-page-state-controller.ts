import { useMemo, useRef } from 'react';
import { message } from 'antd';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useIsMobile } from '@/hooks/use-media-query';
import { selectHasSessionChecked, selectIsAuthenticated, useAuthStore } from '@/stores/auth.store';
import { useDashboardAccessState } from './dashboard-access-state';
import { useDashboardDetailDrawerStates } from './dashboard-detail-drawer-states';
import { useDashboardExportState } from './dashboard-export-state';
import { useDashboardFilterState } from './dashboard-filter-state';
import { useDashboardGoodsCardResetHandlers } from './dashboard-goods-card-handlers';
import { useDashboardGoodsCardState } from './dashboard-goods-card-state';
import { useDashboardGoodsMatrixState } from './dashboard-goods-matrix-state';
import { useDashboardGoodsState } from './dashboard-goods-state';
import {
  useDashboardDateBounds,
  useDashboardDateBoundsClampEffect,
} from './dashboard-date-bounds-state';
import { useDashboardLiveResetHandlers } from './dashboard-live-reset-handlers';
import { useDashboardLiveState } from './dashboard-live-state';
import {
  useDashboardCreateNoteDraftState,
  useDashboardEditNoteDraftState,
} from './dashboard-note-draft-state';
import { useDashboardNoteResetHandlers } from './dashboard-note-drawer-handlers';
import { useDashboardNoteDrawerState } from './dashboard-note-drawer-state';
import {
  useDashboardDailyNoteCountsState,
  useDashboardSelectedDateNotesState,
} from './dashboard-note-data-state';
import { useDashboardNoteMutationState } from './dashboard-note-mutation-state';
import { useDashboardNoteViewState } from './dashboard-note-view-state';
import { useDashboardOverviewCacheFetcher } from './dashboard-overview-cache-fetcher';
import { useDashboardOverviewState } from './dashboard-overview-state';
import { useDashboardQianchuanState } from './dashboard-qianchuan-state';
import { useDashboardRangeDerivedState } from './dashboard-range-derived-state';
import { resolveDashboardRenderContext } from './dashboard-render-context';
import { resolveInitialDashboardState } from './dashboard-date-range';
import { useDashboardShellHandlers } from './dashboard-shell-handlers';
import { useDashboardShortVideoState } from './dashboard-short-video-state';
import { useDashboardTableUiState } from './dashboard-table-ui-state';
import { useDashboardTrafficResetHandlers } from './dashboard-traffic-reset-handlers';
import { useDashboardTrafficState } from './dashboard-traffic-state';
import type { DashboardPageClientProps } from './dashboard-types';

export function useDashboardPageStateController({ initialFilters }: DashboardPageClientProps) {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [messageApi, messageContextHolder] = message.useMessage();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasSessionChecked = useAuthStore(selectHasSessionChecked);
  const user = useAuthStore((state) => state.user);
  const access = useDashboardAccessState({ user, isAuthenticated });
  const initialState = useMemo(() => resolveInitialDashboardState(initialFilters), [initialFilters]);
  // Keep platform deep links stable; users can still return to Overview explicitly.
  const filter = useDashboardFilterState(initialState, access.allowedTabs, {
    enforceAllowedTabs: hasSessionChecked,
    preserveDisallowedInitialTab: initialState.activeTab !== 'overview',
  });
  const overview = useDashboardOverviewState();
  const live = useDashboardLiveState();
  const shortVideo = useDashboardShortVideoState();
  const qianchuan = useDashboardQianchuanState();
  const goodsCard = useDashboardGoodsCardState();
  const goods = useDashboardGoodsState();
  const traffic = useDashboardTrafficState();
  const tableUi = useDashboardTableUiState();
  const goodsMatrix = useDashboardGoodsMatrixState();
  const detailDrawers = useDashboardDetailDrawerStates();
  const liveResets = useDashboardLiveResetHandlers({
    resetLiveData: live.resetLiveData,
    resetLiveGoodsRowsData: live.resetLiveGoodsRowsData,
    resetLiveGoodsExpansionState: tableUi.resetLiveGoodsExpansionState,
    resetLiveMetricsDrawerState: detailDrawers.resetLiveMetricsDrawerState,
    resetLiveFunnelDrawerState: detailDrawers.resetLiveFunnelDrawerState,
    setLiveLoadError: live.setLiveLoadError,
    setLiveGoodsLoadError: live.setLiveGoodsLoadError,
    setLiveGoodsLoading: live.setLiveGoodsLoading,
  });
  const trafficResets = useDashboardTrafficResetHandlers({
    resetTrafficData: traffic.resetTrafficData,
    resetTrafficGoodsData: traffic.resetTrafficGoodsData,
    resetTrafficExpansionState: tableUi.resetTrafficExpansionState,
    resetTrafficGoodsExpansionState: tableUi.resetTrafficGoodsExpansionState,
    setTrafficLoadError: traffic.setTrafficLoadError,
    setTrafficLoading: traffic.setTrafficLoading,
    setTrafficGoodsLoadError: traffic.setTrafficGoodsLoadError,
    setTrafficGoodsLoading: traffic.setTrafficGoodsLoading,
  });
  const goodsCardResets = useDashboardGoodsCardResetHandlers({
    resetGoodsCardData: goodsCard.resetGoodsCardData,
    resetGoodsCardTrafficData: goodsCard.resetGoodsCardTrafficData,
    resetExpandedGoodsCardTrafficRowKeys: detailDrawers.resetExpandedGoodsCardTrafficRowKeys,
    resetGoodsCardTrafficDrawerBaseState: detailDrawers.resetGoodsCardTrafficDrawerBaseState,
    setGoodsCardLoadError: goodsCard.setGoodsCardLoadError,
    setGoodsCardLoading: goodsCard.setGoodsCardLoading,
    setGoodsCardTrafficLoadError: goodsCard.setGoodsCardTrafficLoadError,
    setGoodsCardTrafficLoading: goodsCard.setGoodsCardTrafficLoading,
  });
  const exportState = useDashboardExportState();
  const noteView = useDashboardNoteViewState();
  const dailyNoteCounts = useDashboardDailyNoteCountsState();
  const selectedDateNotes = useDashboardSelectedDateNotesState();
  const noteDrawer = useDashboardNoteDrawerState();
  const createNoteDraft = useDashboardCreateNoteDraftState();
  const editNoteDraft = useDashboardEditNoteDraftState();
  const noteMutation = useDashboardNoteMutationState();
  const noteResets = useDashboardNoteResetHandlers({
    closeNoteDrawer: noteDrawer.closeNoteDrawer,
    resetEditingNoteDraftState: editNoteDraft.resetEditingNoteDraftState,
    resetUpdatingNoteState: noteMutation.resetUpdatingNoteState,
    resetSelectedDateNotesBaseState: selectedDateNotes.resetSelectedDateNotesBaseState,
    resetDeletingNoteState: noteMutation.resetDeletingNoteState,
  });
  const hasShownInitialCustomRangeLimitHintRef = useRef(false);
  const renderContext = useMemo(
    () =>
      resolveDashboardRenderContext({
        activeTab: filter.activeTab,
        activeDimension: filter.activeDimension,
        allowedTabs: access.allowedTabs,
        dateMode: filter.dateMode,
      }),
    [access.allowedTabs, filter.activeDimension, filter.activeTab, filter.dateMode]
  );
  const canWriteDailyNote = Boolean(
    access.canWriteDailyNoteByRole &&
      renderContext.dimensionContentKindFlags.isBusinessDimension &&
      isAuthenticated &&
      renderContext.activeQueryPlatform !== 'overview'
  );
  const fetchOverviewWithCache = useDashboardOverviewCacheFetcher();
  const dateBoundsState = useDashboardDateBounds({
    dimension: renderContext.effectiveDimension,
    platform: renderContext.activeQueryPlatform,
  });
  useDashboardDateBoundsClampEffect({
    dateBounds: dateBoundsState.dateBounds,
    isDateBoundsReady: dateBoundsState.isDateBoundsReady,
    dayValue: filter.dayValue,
    weekValue: filter.weekValue,
    monthValue: filter.monthValue,
    yearValue: filter.yearValue,
    customRange: filter.customRange,
    setDayValue: filter.setDayValue,
    setWeekValue: filter.setWeekValue,
    setMonthValue: filter.setMonthValue,
    setYearValue: filter.setYearValue,
    setCustomRange: filter.setCustomRange,
  });
  const range = useDashboardRangeDerivedState({
    dateMode: filter.dateMode,
    dayValue: filter.dayValue,
    weekValue: filter.weekValue,
    monthValue: filter.monthValue,
    yearValue: filter.yearValue,
    customRange: filter.customRange,
    dateBounds: dateBoundsState.isDateBoundsReady ? dateBoundsState.dateBounds : null,
  });
  const shellHandlers = useDashboardShellHandlers({
    activeDimension: filter.activeDimension,
    activeTab: filter.activeTab,
    dateMode: filter.dateMode,
    dayValue: filter.dayValue,
    weekValue: filter.weekValue,
    monthValue: filter.monthValue,
    yearValue: filter.yearValue,
    customRange: filter.customRange,
    messageApi,
    navigate,
  });
  const detailSectionShellProps = useMemo(
    () => ({
      isAuthenticated,
      isMobile,
      onNavigateLogin: shellHandlers.handleNavigateToLogin,
    }),
    [isAuthenticated, isMobile, shellHandlers.handleNavigateToLogin]
  );

  return {
    navigation: {
      navigate,
      pathname,
      searchParams,
    },
    viewport: {
      isMobile,
    },
    messageState: {
      messageApi,
      messageContextHolder,
    },
    auth: {
      isAuthenticated,
      user,
    },
    access,
    initialState,
    filter,
    overview,
    live,
    shortVideo,
    qianchuan,
    goodsCard,
    goods,
    traffic,
    tableUi,
    goodsMatrix,
    detailDrawers,
    liveResets,
    trafficResets,
    goodsCardResets,
    exportState,
    noteView,
    dailyNoteCounts,
    selectedDateNotes,
    noteDrawer,
    createNoteDraft,
    editNoteDraft,
    noteMutation,
    noteResets,
    hasShownInitialCustomRangeLimitHintRef,
    renderContext,
    canWriteDailyNote,
    fetchOverviewWithCache,
    dateBounds: dateBoundsState.dateBounds,
    dateBoundsState,
    range,
    shellHandlers,
    detailSectionShellProps,
  } as const;
}

export type DashboardPageStateController = ReturnType<typeof useDashboardPageStateController>;
