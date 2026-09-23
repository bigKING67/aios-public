import {
  useDashboardExpandableNullableDrawerState,
  useDashboardNullableDrawerState,
} from './dashboard-drawer-state';
import type {
  DashboardGoodsCardRow,
  DashboardGoodsScoreDetailItem,
  DashboardLiveDetailRow,
} from './dashboard-types';

export function useDashboardDetailDrawerStates() {
  const goodsScore = useDashboardNullableDrawerState<DashboardGoodsScoreDetailItem>();
  const goodsCardTraffic = useDashboardExpandableNullableDrawerState<DashboardGoodsCardRow>();
  const liveMetrics = useDashboardNullableDrawerState<DashboardLiveDetailRow>();
  const liveFunnel = useDashboardNullableDrawerState<DashboardLiveDetailRow>();

  return {
    isGoodsScoreDrawerOpen: goodsScore.isOpen,
    selectedGoodsScoreDetail: goodsScore.selectedItem,
    openGoodsScoreDrawer: goodsScore.openDrawer,
    closeGoodsScoreDrawer: goodsScore.closeDrawer,
    resetGoodsScoreDrawerState: goodsScore.resetDrawer,

    isGoodsCardTrafficDrawerOpen: goodsCardTraffic.isOpen,
    selectedGoodsCardRow: goodsCardTraffic.selectedItem,
    openGoodsCardTrafficDrawer: goodsCardTraffic.openDrawer,
    closeGoodsCardTrafficDrawer: goodsCardTraffic.closeDrawer,
    resetGoodsCardTrafficDrawerBaseState: goodsCardTraffic.resetDrawer,
    expandedGoodsCardTrafficRowKeys: goodsCardTraffic.expandedRowKeys,
    setExpandedGoodsCardTrafficRowKeys: goodsCardTraffic.setExpandedRowKeys,
    resetExpandedGoodsCardTrafficRowKeys: goodsCardTraffic.resetExpandedRowKeys,

    isLiveMetricsDrawerOpen: liveMetrics.isOpen,
    selectedLiveMetricsRow: liveMetrics.selectedItem,
    openLiveMetricsDrawer: liveMetrics.openDrawer,
    closeLiveMetricsDrawer: liveMetrics.closeDrawer,
    resetLiveMetricsDrawerState: liveMetrics.resetDrawer,

    isLiveFunnelDrawerOpen: liveFunnel.isOpen,
    selectedLiveFunnelRow: liveFunnel.selectedItem,
    setSelectedLiveFunnelRow: liveFunnel.setSelectedItem,
    openLiveFunnelDrawer: liveFunnel.openDrawer,
    closeLiveFunnelDrawer: liveFunnel.closeDrawer,
    resetLiveFunnelDrawerState: liveFunnel.resetDrawer,
  };
}
