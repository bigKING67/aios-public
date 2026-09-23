import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';

import { DashboardGoodsCardDetailSection } from './dashboard-goods-card-detail-section';
import { DashboardGoodsDetailSection } from './dashboard-goods-detail-section';
import { useDashboardGoodsDerivedViewState } from './dashboard-goods-derived-view-state';
import { useDashboardGoodsDisplayState } from './dashboard-goods-display-state';
import { useDashboardGoodsCardHandlers } from './dashboard-goods-card-handlers';
import { useDashboardGoodsCardDisplayState } from './dashboard-goods-card-display-state';
import { useDashboardGoodsCardViewState } from './dashboard-goods-card-view-state';
import { useDashboardGoodsScoreHandlers } from './dashboard-goods-score-handlers';
import { DashboardTrafficDetailSection } from './dashboard-traffic-detail-section';
import { useDashboardTrafficDerivedState } from './dashboard-traffic-derived-state';
import { useDashboardTrafficTableViewState } from './dashboard-traffic-table-view-state';
import type {
  DashboardCommerceContents,
  DashboardCommerceContentsArgs,
} from './dashboard-commerce-content-types';

export function useDashboardCommerceContents({
  isMobile,
  dashboardRangeLabel,
  dashboardFallbackAsOfDate,
  getTrendClassNameByRate,
  goodsData,
  goodsLoadError,
  goodsLoading,
  goodsMatrixVisibleQuadrants,
  toggleGoodsMatrixQuadrant,
  selectedGoodsScoreDetail,
  openGoodsScoreDrawer,
  closeGoodsScoreDrawer,
  goodsScoreClassNames,
  goodsMatrixClassNames,
  goodsScoreChartClassNames,
  trafficData,
  trafficLoadError,
  trafficLoading,
  trafficGoodsData,
  trafficGoodsLoadError,
  trafficGoodsLoading,
  expandedTrafficRowKeys,
  setExpandedTrafficRowKeys,
  expandedTrafficGoodsRowKeys,
  setExpandedTrafficGoodsRowKeys,
  trafficTableClassNames,
  isDouyinGoodsCardDimension,
  goodsCardData,
  goodsCardLoadError,
  goodsCardLoading,
  goodsCardTrafficData,
  goodsCardTrafficLoadError,
  goodsCardTrafficLoading,
  isGoodsCardTrafficDrawerOpen,
  selectedGoodsCardRow,
  openGoodsCardTrafficDrawer,
  closeGoodsCardTrafficDrawer,
  resetGoodsCardTrafficDrawerData,
  expandedGoodsCardTrafficRowKeys,
  setExpandedGoodsCardTrafficRowKeys,
  goodsCardTableClassNames,
}: DashboardCommerceContentsArgs): DashboardCommerceContents {
  const {
    goodsTableRows,
    goodsScoreRankingRows,
    goodsScoreRankingByProductId,
    goodsMatrixOption,
    goodsScoreOption,
    goodsScoreRadarOption,
    goodsMatrixThresholdDescription,
    goodsMatrixQuadrantSummary,
    goodsColumns,
  } = useDashboardGoodsDerivedViewState({
    goodsData,
    goodsMatrixVisibleQuadrants,
    selectedGoodsScoreDetail,
    isMobile,
    goodsScoreClassNames,
    goodsMatrixClassNames,
    goodsScoreChartClassNames,
  });

  const {
    handleGoodsScoreBarClick,
    handleGoodsScoreRowClick,
    handleCloseGoodsScoreDrawer,
  } = useDashboardGoodsScoreHandlers({
    goodsScoreRankingRows,
    goodsScoreRankingByProductId,
    openGoodsScoreDrawer,
    closeGoodsScoreDrawer,
  });

  const {
    trafficColumns,
    trafficGoodsColumns,
  } = useDashboardTrafficTableViewState({
    isMobile,
    trafficTableClassNames,
  });

  const {
    goodsRangeLabel,
    goodsAsOfDate,
    goodsSummary,
    goodsScorePoolN,
    goodsScoreVisibleCount,
  } = useDashboardGoodsDisplayState({
    goodsData,
    dashboardRangeLabel,
    dashboardFallbackAsOfDate,
    goodsScoreRankingCount: goodsScoreRankingRows.length,
  });
  const { trafficDisplayTree, trafficGoodsDisplayTree } = useDashboardTrafficDerivedState({
    trafficData,
    trafficGoodsData,
  });
  const {
    goodsCardCurrentTotals,
    goodsCardPreviousTotals,
    goodsCardRangeLabel,
    goodsCardDetailLoading,
  } = useDashboardGoodsCardDisplayState({
    goodsCardData,
    dashboardRangeLabel,
    isDouyinGoodsCardDimension,
    goodsCardLoadError,
  });
  const {
    handleOpenGoodsCardTrafficDrawer,
    handleCloseGoodsCardTrafficDrawer,
  } = useDashboardGoodsCardHandlers({
    openGoodsCardTrafficDrawer,
    closeGoodsCardTrafficDrawer,
    resetGoodsCardTrafficDrawerData,
  });
  const {
    goodsCardRows,
    goodsCardTrafficTreeRows,
    goodsCardTopMetricCards,
    goodsCardBottomMetricCards,
    goodsCardTrafficAsOfDate,
    goodsCardTableEmptyText,
    goodsCardTrendOption,
    goodsCardColumns,
    goodsCardTrafficColumns,
  } = useDashboardGoodsCardViewState({
    isMobile,
    goodsCardData,
    goodsCardTrafficData,
    goodsCardCurrentTotals,
    goodsCardPreviousTotals,
    goodsCardDetailLoading,
    goodsCardLoading,
    goodsCardLoadError,
    goodsCardTrafficFallbackAsOfDate: dashboardFallbackAsOfDate,
    goodsCardTableClassNames,
    trafficTableClassNames,
    onOpenGoodsCardTraffic: handleOpenGoodsCardTrafficDrawer,
  });
  const goodsCardDetailSectionProps = {
    isMobile,
    loadError: goodsCardLoadError,
    trendOption: goodsCardTrendOption,
    topMetricCards: goodsCardTopMetricCards,
    bottomMetricCards: goodsCardBottomMetricCards,
    rows: goodsCardRows,
    columns: goodsCardColumns,
    loading: goodsCardDetailLoading || goodsCardLoading,
    emptyText: goodsCardTableEmptyText,
    trafficDrawerOpen: isGoodsCardTrafficDrawerOpen,
    selectedTrafficRow: selectedGoodsCardRow,
    trafficRangeLabel: goodsCardRangeLabel,
    trafficAsOfDate: goodsCardTrafficAsOfDate,
    trafficLoadError: goodsCardTrafficLoadError,
    trafficRows: goodsCardTrafficTreeRows,
    trafficColumns: goodsCardTrafficColumns,
    trafficLoading: goodsCardTrafficLoading,
    expandedTrafficRowKeys: expandedGoodsCardTrafficRowKeys,
    onExpandedTrafficRowKeysChange: setExpandedGoodsCardTrafficRowKeys,
    onCloseTrafficDrawer: handleCloseGoodsCardTrafficDrawer,
    getTrendClassNameByRate,
  };
  const goodsCardContent = <DashboardGoodsCardDetailSection {...goodsCardDetailSectionProps} />;
  const goodsDetailSectionProps = {
    isMobile,
    loadError: goodsLoadError,
    rangeLabel: goodsRangeLabel,
    asOfDate: goodsAsOfDate,
    summary: goodsSummary,
    matrixSummary: goodsMatrixQuadrantSummary,
    visibleQuadrants: goodsMatrixVisibleQuadrants,
    matrixOption: goodsMatrixOption,
    matrixThresholdDescription: goodsMatrixThresholdDescription,
    textInverseColor: ECHARTS_CHART_TOKENS.textInverse,
    scorePoolN: goodsScorePoolN,
    scoreVisibleCount: goodsScoreVisibleCount,
    rows: goodsTableRows,
    columns: goodsColumns,
    loading: goodsLoading,
    selectedScoreDetail: selectedGoodsScoreDetail,
    scoreOption: goodsScoreOption,
    getTrendClassNameByRate,
    onToggleQuadrant: toggleGoodsMatrixQuadrant,
    onScoreRowClick: handleGoodsScoreRowClick,
    onScoreBarClick: handleGoodsScoreBarClick,
  };
  const goodsContent = <DashboardGoodsDetailSection {...goodsDetailSectionProps} />;

  const trafficDetailSectionProps = {
    isMobile,
    trafficLoadError,
    trafficGoodsLoadError,
    trafficRows: trafficDisplayTree,
    trafficColumns,
    trafficLoading,
    expandedTrafficRowKeys,
    onExpandedTrafficRowKeysChange: setExpandedTrafficRowKeys,
    trafficGoodsRows: trafficGoodsDisplayTree,
    trafficGoodsColumns,
    trafficGoodsLoading,
    expandedTrafficGoodsRowKeys,
    onExpandedTrafficGoodsRowKeysChange: setExpandedTrafficGoodsRowKeys,
  };
  const trafficContent = <DashboardTrafficDetailSection {...trafficDetailSectionProps} />;

  return {
    goodsContent,
    trafficContent,
    goodsCardContent,
    goodsScoreRadarOption,
    selectedGoodsScoreDetail,
    handleCloseGoodsScoreDrawer,
  };
}
