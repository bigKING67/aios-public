import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import { buildDashboardGoodsCardTrendOption } from './dashboard-goods-card-trend-option';
import {
  buildDashboardGoodsCardColumns,
  type DashboardGoodsCardTableClassNames,
} from './dashboard-goods-card-columns';
import { buildDashboardGoodsCardMetricCards } from './dashboard-metric-cards';
import { buildDashboardTableEmptyContent } from './dashboard-table-state';
import {
  buildDashboardGoodsCardTrafficColumns,
  type DashboardTrafficTableClassNames,
} from './dashboard-traffic-columns';
import { sortGoodsCardTrafficTreeNodesByExposure } from './dashboard-traffic-model';
import type {
  DashboardGoodsCardApiResponse,
  DashboardGoodsCardRow,
  DashboardGoodsCardTotals,
  DashboardGoodsCardTrafficApiResponse,
  DashboardGoodsCardTrafficTreeNode,
  DashboardGoodsCardTrendRow,
} from './dashboard-types';

type DashboardGoodsCardViewStateArgs = {
  isMobile: boolean;
  goodsCardData: DashboardGoodsCardApiResponse | null;
  goodsCardTrafficData: DashboardGoodsCardTrafficApiResponse | null;
  goodsCardCurrentTotals: DashboardGoodsCardTotals | null;
  goodsCardPreviousTotals: DashboardGoodsCardTotals | null;
  goodsCardDetailLoading: boolean;
  goodsCardLoading: boolean;
  goodsCardLoadError: unknown;
  goodsCardTrafficFallbackAsOfDate: string;
  goodsCardTableClassNames: DashboardGoodsCardTableClassNames;
  trafficTableClassNames: DashboardTrafficTableClassNames;
  onOpenGoodsCardTraffic: (row: DashboardGoodsCardRow) => void;
};

export function useDashboardGoodsCardViewState({
  isMobile,
  goodsCardData,
  goodsCardTrafficData,
  goodsCardCurrentTotals,
  goodsCardPreviousTotals,
  goodsCardDetailLoading,
  goodsCardLoading,
  goodsCardLoadError,
  goodsCardTrafficFallbackAsOfDate,
  goodsCardTableClassNames,
  trafficTableClassNames,
  onOpenGoodsCardTraffic,
}: DashboardGoodsCardViewStateArgs) {
  const goodsCardTrendRows = useMemo<DashboardGoodsCardTrendRow[]>(
    () => (Array.isArray(goodsCardData?.trend) ? goodsCardData.trend : []),
    [goodsCardData?.trend]
  );

  const goodsCardRows = useMemo<DashboardGoodsCardRow[]>(
    () => (Array.isArray(goodsCardData?.rows) ? goodsCardData.rows : []),
    [goodsCardData?.rows]
  );

  const goodsCardTrafficTreeRows = useMemo<DashboardGoodsCardTrafficTreeNode[]>(
    () => sortGoodsCardTrafficTreeNodesByExposure(goodsCardTrafficData?.tree),
    [goodsCardTrafficData?.tree]
  );

  const goodsCardMetricCards = buildDashboardGoodsCardMetricCards(goodsCardCurrentTotals, goodsCardPreviousTotals);
  const goodsCardTopMetricCards = goodsCardMetricCards.slice(0, 6);
  const goodsCardBottomMetricCards = goodsCardMetricCards.slice(6);
  const goodsCardTrafficAsOfDate = goodsCardTrafficData?.asOfDate || goodsCardTrafficFallbackAsOfDate;

  const goodsCardTableEmptyText = buildDashboardTableEmptyContent({
    isLoading: goodsCardDetailLoading || goodsCardLoading,
    hasLoadError: Boolean(goodsCardLoadError),
    loadingText: '商品卡数据加载中',
    errorText: '商品卡维度数据加载失败，请查看上方提示',
    emptyDescription: '当前筛选条件下暂无商品卡数据',
  });

  const goodsCardTrendOption = useMemo<EChartsCoreOption>(
    () =>
      buildDashboardGoodsCardTrendOption({
        rows: goodsCardTrendRows,
        chartTokens: ECHARTS_CHART_TOKENS,
      }),
    [goodsCardTrendRows]
  );

  const goodsCardColumns = useMemo<ColumnsType<DashboardGoodsCardRow>>(
    () =>
      buildDashboardGoodsCardColumns({
        isMobile,
        classNames: goodsCardTableClassNames,
        onOpenTraffic: onOpenGoodsCardTraffic,
      }),
    [isMobile, goodsCardTableClassNames, onOpenGoodsCardTraffic]
  );

  const goodsCardTrafficColumns = useMemo<ColumnsType<DashboardGoodsCardTrafficTreeNode>>(
    () =>
      buildDashboardGoodsCardTrafficColumns({
        isMobile,
        classNames: trafficTableClassNames,
      }),
    [isMobile, trafficTableClassNames]
  );

  return {
    goodsCardRows,
    goodsCardTrafficTreeRows,
    goodsCardTopMetricCards,
    goodsCardBottomMetricCards,
    goodsCardTrafficAsOfDate,
    goodsCardTableEmptyText,
    goodsCardTrendOption,
    goodsCardColumns,
    goodsCardTrafficColumns,
  };
}
