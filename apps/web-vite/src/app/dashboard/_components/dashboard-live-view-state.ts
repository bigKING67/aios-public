import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import {
  buildDashboardLiveTrendOption,
  type DashboardLiveChartClassNames,
} from './dashboard-live-trend-option';
import {
  buildDashboardLiveDetailColumns,
  type DashboardLiveDetailTableClassNames,
} from './dashboard-live-detail-columns';
import {
  buildDashboardDetailTablePagination,
  buildDashboardTableEmptyContent,
} from './dashboard-table-state';
import type { DashboardLiveDetailRow, DashboardLiveTrendRow } from './dashboard-types';

type DashboardLiveViewStateArgs = {
  isMobile: boolean;
  activeLiveTrendRows: DashboardLiveTrendRow[];
  liveRowsByDate: Map<string, DashboardLiveDetailRow[]>;
  liveGoodsLoading: boolean;
  liveGoodsLoadError: unknown;
  liveDetailLoading: boolean;
  liveLoadError: unknown;
  liveChartClassNames: DashboardLiveChartClassNames;
  liveDetailTableClassNames: DashboardLiveDetailTableClassNames;
  onOpenLiveMetrics: (row: DashboardLiveDetailRow) => void;
};

export function useDashboardLiveViewState({
  isMobile,
  activeLiveTrendRows,
  liveRowsByDate,
  liveGoodsLoading,
  liveGoodsLoadError,
  liveDetailLoading,
  liveLoadError,
  liveChartClassNames,
  liveDetailTableClassNames,
  onOpenLiveMetrics,
}: DashboardLiveViewStateArgs) {
  const liveGoodsEmptyContent = buildDashboardTableEmptyContent({
    isLoading: liveGoodsLoading,
    hasLoadError: Boolean(liveGoodsLoadError),
    loadingText: '直播商品表现加载中',
    errorText: '直播商品维度数据加载失败，请查看上方提示',
    emptyDescription: '当前筛选条件下暂无直播商品数据',
  });

  const liveDetailEmptyText = buildDashboardTableEmptyContent({
    isLoading: liveDetailLoading,
    hasLoadError: Boolean(liveLoadError),
    loadingText: '直播明细加载中',
    errorText: '直播维度数据加载失败，请查看上方提示',
    emptyDescription: '当前筛选条件下暂无直播明细',
  });

  const liveDetailTablePagination = useMemo(
    () => buildDashboardDetailTablePagination({ isMobile, mobilePageSize: 8 }),
    [isMobile]
  );

  const liveDetailColumns = useMemo<ColumnsType<DashboardLiveDetailRow>>(
    () =>
      buildDashboardLiveDetailColumns({
        isMobile,
        classNames: liveDetailTableClassNames,
        onOpenMetrics: onOpenLiveMetrics,
      }),
    [isMobile, liveDetailTableClassNames, onOpenLiveMetrics]
  );

  const liveTrendOption = useMemo<EChartsCoreOption>(
    () =>
      buildDashboardLiveTrendOption({
        rows: activeLiveTrendRows,
        rowsByDate: liveRowsByDate,
        chartTokens: ECHARTS_CHART_TOKENS,
        classNames: liveChartClassNames,
      }),
    [activeLiveTrendRows, liveRowsByDate, liveChartClassNames]
  );

  return {
    liveGoodsEmptyContent,
    liveDetailEmptyText,
    liveDetailTablePagination,
    liveDetailColumns,
    liveTrendOption,
  };
}
