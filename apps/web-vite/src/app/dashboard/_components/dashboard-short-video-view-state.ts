import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import { buildDashboardShortVideoTrendOption } from './dashboard-short-video-trend-option';
import {
  buildDashboardShortVideoDetailColumns,
  type DashboardShortVideoDetailTableClassNames,
} from './dashboard-short-video-detail-columns';
import {
  buildDashboardDetailTablePagination,
  buildDashboardTableEmptyContent,
} from './dashboard-table-state';
import type { DashboardShortVideoDetailRow, DashboardShortVideoTrendRow } from './dashboard-types';

type DashboardShortVideoViewStateArgs = {
  isMobile: boolean;
  activeShortVideoTrendRows: DashboardShortVideoTrendRow[];
  shortVideoDetailLoading: boolean;
  shortVideoLoadError: unknown;
  shortVideoDetailTableClassNames: DashboardShortVideoDetailTableClassNames;
};

export function useDashboardShortVideoViewState({
  isMobile,
  activeShortVideoTrendRows,
  shortVideoDetailLoading,
  shortVideoLoadError,
  shortVideoDetailTableClassNames,
}: DashboardShortVideoViewStateArgs) {
  const shortVideoDetailEmptyText = buildDashboardTableEmptyContent({
    isLoading: shortVideoDetailLoading,
    hasLoadError: Boolean(shortVideoLoadError),
    loadingText: '短视频明细加载中',
    errorText: '短视频维度数据加载失败，请查看上方提示',
    emptyDescription: '当前筛选条件下暂无短视频明细',
  });

  const shortVideoDetailTablePagination = useMemo(
    () => buildDashboardDetailTablePagination({ isMobile, mobilePageSize: 8 }),
    [isMobile]
  );

  const shortVideoDetailColumns = useMemo<ColumnsType<DashboardShortVideoDetailRow>>(
    () =>
      buildDashboardShortVideoDetailColumns({
        isMobile,
        classNames: shortVideoDetailTableClassNames,
      }),
    [isMobile, shortVideoDetailTableClassNames]
  );

  const shortVideoTrendOption = useMemo<EChartsCoreOption>(
    () =>
      buildDashboardShortVideoTrendOption({
        rows: activeShortVideoTrendRows,
        chartTokens: ECHARTS_CHART_TOKENS,
      }),
    [activeShortVideoTrendRows]
  );

  return {
    shortVideoDetailEmptyText,
    shortVideoDetailTablePagination,
    shortVideoDetailColumns,
    shortVideoTrendOption,
  };
}
