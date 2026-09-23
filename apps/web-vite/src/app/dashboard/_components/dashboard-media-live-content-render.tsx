import type { ReactNode } from 'react';

import type { useDashboardLiveDerivedState } from './dashboard-live-derived-state';
import type {
  useDashboardLiveFunnelDerivedState,
} from './dashboard-live-funnel-derived-state';
import type {
  useDashboardLiveGoodsDerivedState,
} from './dashboard-live-goods-derived-state';
import type { useDashboardLiveHandlers } from './dashboard-live-handlers';
import type { useDashboardLiveViewState } from './dashboard-live-view-state';
import { DashboardLiveContentSection } from './dashboard-live-content-section';
import type { useDashboardMediaDetailExportActions } from './dashboard-media-detail-export-actions';
import type { useDashboardMediaDisplayState } from './dashboard-media-display-state';
import type {
  DashboardMediaContentsArgs,
} from './dashboard-media-content-types';
import type {
  useDashboardLiveMetricCardGroupState,
} from './dashboard-metric-card-derived-state';

type DashboardMediaLiveContentRenderArgs = {
  args: DashboardMediaContentsArgs;
  liveDerivedState: ReturnType<typeof useDashboardLiveDerivedState>;
  liveGoodsDerivedState: ReturnType<typeof useDashboardLiveGoodsDerivedState>;
  liveFunnelDerivedState: ReturnType<typeof useDashboardLiveFunnelDerivedState>;
  displayState: ReturnType<typeof useDashboardMediaDisplayState>;
  liveHandlers: ReturnType<typeof useDashboardLiveHandlers>;
  liveViewState: ReturnType<typeof useDashboardLiveViewState>;
  liveMetricCardGroupState: ReturnType<typeof useDashboardLiveMetricCardGroupState>;
  exportActions: ReturnType<typeof useDashboardMediaDetailExportActions>;
};

export function renderDashboardLiveContent({
  args,
  liveDerivedState,
  liveGoodsDerivedState,
  liveFunnelDerivedState,
  displayState,
  liveHandlers,
  liveViewState,
  liveMetricCardGroupState,
  exportActions,
}: DashboardMediaLiveContentRenderArgs): ReactNode {
  return (
    <DashboardLiveContentSection
      liveLoadError={args.liveLoadError}
      liveGoodsLoadError={args.liveGoodsLoadError}
      liveScope={args.liveScope}
      topMetricCards={liveMetricCardGroupState.topMetricCards}
      bottomMetricCards={liveMetricCardGroupState.bottomMetricCards}
      trendOption={liveViewState.liveTrendOption}
      onLiveScopeChange={args.setLiveScope}
      onTrendPointClick={liveHandlers.handleLiveTrendPointClick}
      getTrendClassNameByRate={args.getTrendClassNameByRate}
      goodsBoardProps={{
        loading: args.liveGoodsLoading,
        loadError: args.liveGoodsLoadError,
        emptyContent: liveViewState.liveGoodsEmptyContent,
        sessionGroups: liveGoodsDerivedState.paginatedLiveGoodsSessionGroups,
        sessionCount: liveGoodsDerivedState.liveGoodsSessionCount,
        expandedSessionKeys: args.expandedLiveGoodsSessionKeys,
        expandedProductKeys: args.expandedLiveGoodsRowKeys,
        page: args.liveGoodsSessionPage,
        pageSize: args.liveGoodsSessionPageSize,
        isMobile: args.isMobile,
        isAuthenticated: args.isAuthenticated,
        isExporting: args.isExportingLiveGoodsDetails,
        disableExport: exportActions.disableLiveGoodsDetailExport,
        onExport: exportActions.handleExportLiveGoodsDetailsAction,
        onNavigateLogin: args.detailSectionShellProps.onNavigateLogin,
        onToggleSession: args.toggleLiveGoodsSession,
        onToggleProduct: args.toggleLiveGoodsProduct,
        onPageChange: args.changeLiveGoodsPage,
      }}
      detailSectionProps={{
        ...args.detailSectionShellProps,
        isExporting: args.isExportingLiveDetails,
        disableExport: exportActions.disableLiveDetailExport,
        rows: liveDerivedState.activeLiveDetailRows,
        loading: displayState.liveDetailLoading,
        columns: liveViewState.liveDetailColumns,
        pagination: liveViewState.liveDetailTablePagination,
        emptyText: liveViewState.liveDetailEmptyText,
        onExport: exportActions.handleExportLiveDetailsAction,
      }}
      detailDrawerProps={{
        open: args.isLiveMetricsDrawerOpen,
        isMobile: args.isMobile,
        selectedRow: args.selectedLiveMetricsRow,
        onClose: liveHandlers.handleCloseLiveMetricsDrawer,
      }}
      funnelDrawerProps={{
        open: args.isLiveFunnelDrawerOpen,
        isMobile: args.isMobile,
        selectedRow: args.selectedLiveFunnelRow,
        dateKey: liveFunnelDerivedState.selectedLiveFunnelDateKey,
        sessionCount: liveFunnelDerivedState.selectedLiveFunnelDayRows.length,
        sessionOptions: liveFunnelDerivedState.selectedLiveFunnelSessionOptions,
        selectedSessionKey: liveFunnelDerivedState.selectedLiveFunnelSessionKey,
        overallRate: liveFunnelDerivedState.selectedLiveFunnelOverallRate,
        steps: liveFunnelDerivedState.selectedLiveFunnelSteps,
        onSessionChange: liveHandlers.handleLiveFunnelSessionChange,
        onClose: liveHandlers.handleCloseLiveFunnelDrawer,
      }}
    />
  );
}
