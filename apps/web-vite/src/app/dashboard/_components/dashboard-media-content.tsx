import { useDashboardLiveDerivedState } from './dashboard-live-derived-state';
import {
  useDashboardLiveFunnelDerivedState,
  useDashboardLiveFunnelSelectedRowReconcileEffect,
} from './dashboard-live-funnel-derived-state';
import {
  useDashboardLiveGoodsDerivedState,
  useDashboardLiveGoodsPageClampEffect,
} from './dashboard-live-goods-derived-state';
import { useDashboardLiveHandlers } from './dashboard-live-handlers';
import { useDashboardLiveViewState } from './dashboard-live-view-state';
import { useDashboardMediaDetailExportActions } from './dashboard-media-detail-export-actions';
import { useDashboardMediaDisplayState } from './dashboard-media-display-state';
import {
  renderDashboardLiveContent,
} from './dashboard-media-live-content-render';
import type {
  DashboardMediaContents,
  DashboardMediaContentsArgs,
} from './dashboard-media-content-types';
import {
  renderDashboardShortVideoContent,
} from './dashboard-media-short-video-content-render';
import {
  useDashboardLiveMetricCardGroupState,
  useDashboardShortVideoMetricCardGroupState,
} from './dashboard-metric-card-derived-state';
import { useDashboardShortVideoDerivedState } from './dashboard-short-video-derived-state';
import { useDashboardShortVideoViewState } from './dashboard-short-video-view-state';

export type {
  DashboardDetailSectionShellProps,
  DashboardMediaContents,
  DashboardMediaContentsArgs,
} from './dashboard-media-content-types';

export function useDashboardMediaContents(args: DashboardMediaContentsArgs): DashboardMediaContents {
  const liveDerivedState = useDashboardLiveDerivedState({
    liveData: args.liveData,
    liveScope: args.liveScope,
  });
  const liveGoodsDerivedState = useDashboardLiveGoodsDerivedState({
    liveGoodsData: args.liveGoodsData,
    liveGoodsSessionPage: args.liveGoodsSessionPage,
    liveGoodsSessionPageSize: args.liveGoodsSessionPageSize,
  });
  const liveFunnelDerivedState = useDashboardLiveFunnelDerivedState({
    activeLiveDetailRows: liveDerivedState.activeLiveDetailRows,
    selectedLiveFunnelRow: args.selectedLiveFunnelRow,
  });
  const displayState = useDashboardMediaDisplayState({
    isDouyinLiveDimension: args.isDouyinLiveDimension,
    liveData: args.liveData,
    liveLoadError: args.liveLoadError,
    isDouyinShortVideoDimension: args.isDouyinShortVideoDimension,
    shortVideoData: args.shortVideoData,
    shortVideoLoadError: args.shortVideoLoadError,
  });
  useDashboardLiveGoodsPageClampEffect({
    liveGoodsSessionCount: liveGoodsDerivedState.liveGoodsSessionCount,
    liveGoodsSessionPage: args.liveGoodsSessionPage,
    liveGoodsSessionPageSize: args.liveGoodsSessionPageSize,
    setLiveGoodsSessionPage: args.setLiveGoodsSessionPage,
  });
  const liveHandlers = useDashboardLiveHandlers({
    messageApi: args.messageApi,
    liveRowsByDate: liveFunnelDerivedState.liveRowsByDate,
    selectedLiveFunnelDayRows: liveFunnelDerivedState.selectedLiveFunnelDayRows,
    activeLiveTrendRows: liveDerivedState.activeLiveTrendRows,
    openLiveMetricsDrawer: args.openLiveMetricsDrawer,
    closeLiveMetricsDrawer: args.closeLiveMetricsDrawer,
    openLiveFunnelDrawer: args.openLiveFunnelDrawer,
    closeLiveFunnelDrawer: args.closeLiveFunnelDrawer,
    setSelectedLiveFunnelRow: args.setSelectedLiveFunnelRow,
  });
  useDashboardLiveFunnelSelectedRowReconcileEffect({
    activeLiveDetailRowsCount: liveDerivedState.activeLiveDetailRows.length,
    isLiveFunnelDrawerOpen: args.isLiveFunnelDrawerOpen,
    liveRowsByDate: liveFunnelDerivedState.liveRowsByDate,
    selectedLiveFunnelRow: args.selectedLiveFunnelRow,
    setSelectedLiveFunnelRow: args.setSelectedLiveFunnelRow,
  });
  const liveViewState = useDashboardLiveViewState({
    isMobile: args.isMobile,
    activeLiveTrendRows: liveDerivedState.activeLiveTrendRows,
    liveRowsByDate: liveFunnelDerivedState.liveRowsByDate,
    liveGoodsLoading: args.liveGoodsLoading,
    liveGoodsLoadError: args.liveGoodsLoadError,
    liveDetailLoading: displayState.liveDetailLoading,
    liveLoadError: args.liveLoadError,
    liveChartClassNames: args.liveChartClassNames,
    liveDetailTableClassNames: args.liveDetailTableClassNames,
    onOpenLiveMetrics: liveHandlers.handleOpenLiveMetricsDrawer,
  });
  const liveMetricCardGroupState = useDashboardLiveMetricCardGroupState(
    liveDerivedState.activeLiveMetricCards
  );
  const shortVideoDerivedState = useDashboardShortVideoDerivedState({
    shortVideoData: args.shortVideoData,
    shortVideoScope: args.shortVideoScope,
  });
  const exportActions = useDashboardMediaDetailExportActions({
    isAuthenticated: args.isAuthenticated,
    messageApi: args.messageApi,
    currentRange: args.currentRange,
    activeLiveDetailRows: liveDerivedState.activeLiveDetailRows,
    liveScope: args.liveScope,
    isExportingLiveDetails: args.isExportingLiveDetails,
    setIsExportingLiveDetails: args.setIsExportingLiveDetails,
    liveDetailLoading: displayState.liveDetailLoading,
    liveGoodsSessionCount: liveGoodsDerivedState.liveGoodsSessionCount,
    isExportingLiveGoodsDetails: args.isExportingLiveGoodsDetails,
    setIsExportingLiveGoodsDetails: args.setIsExportingLiveGoodsDetails,
    liveGoodsLoading: args.liveGoodsLoading,
    activeShortVideoDetailRows: shortVideoDerivedState.activeShortVideoDetailRows,
    shortVideoScope: args.shortVideoScope,
    isExportingShortVideoDetails: args.isExportingShortVideoDetails,
    setIsExportingShortVideoDetails: args.setIsExportingShortVideoDetails,
    shortVideoDetailLoading: displayState.shortVideoDetailLoading,
  });
  const shortVideoViewState = useDashboardShortVideoViewState({
    isMobile: args.isMobile,
    activeShortVideoTrendRows: shortVideoDerivedState.activeShortVideoTrendRows,
    shortVideoDetailLoading: displayState.shortVideoDetailLoading,
    shortVideoLoadError: args.shortVideoLoadError,
    shortVideoDetailTableClassNames: args.shortVideoDetailTableClassNames,
  });
  const shortVideoMetricCardGroupState = useDashboardShortVideoMetricCardGroupState(
    shortVideoDerivedState.activeShortVideoMetricCards
  );

  return {
    liveContent: renderDashboardLiveContent({
      args,
      liveDerivedState,
      liveGoodsDerivedState,
      liveFunnelDerivedState,
      displayState,
      liveHandlers,
      liveViewState,
      liveMetricCardGroupState,
      exportActions,
    }),
    shortVideoContent: renderDashboardShortVideoContent({
      args,
      shortVideoDerivedState,
      displayState,
      shortVideoViewState,
      shortVideoMetricCardGroupState,
      exportActions,
    }),
  };
}
