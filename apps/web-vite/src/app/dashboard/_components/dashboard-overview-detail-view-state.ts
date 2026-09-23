import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';

import {
  buildDashboardOverviewDetailColumns,
  type DashboardOverviewDetailTableClassNames,
} from './dashboard-overview-detail-columns';
import { buildDashboardOverviewShareOption } from './dashboard-overview-share-option';
import { buildDashboardDetailTablePagination } from './dashboard-table-state';
import type {
  DashboardOverviewDetailRow,
  ShareItem,
} from './dashboard-types';

type DashboardOverviewDetailViewStateArgs = {
  isMobile: boolean;
  share: ShareItem[];
  overviewDetailTableClassNames: DashboardOverviewDetailTableClassNames;
};

export function useDashboardOverviewDetailViewState({
  isMobile,
  share,
  overviewDetailTableClassNames,
}: DashboardOverviewDetailViewStateArgs) {
  const detailColumns = useMemo<ColumnsType<DashboardOverviewDetailRow>>(
    () =>
      buildDashboardOverviewDetailColumns({
        isMobile,
        classNames: overviewDetailTableClassNames,
      }),
    [isMobile, overviewDetailTableClassNames]
  );

  const detailTablePagination = useMemo(
    () => buildDashboardDetailTablePagination({ isMobile, mobilePageSize: 10 }),
    [isMobile]
  );

  const shareOption = useMemo<EChartsCoreOption>(
    () => buildDashboardOverviewShareOption({ share, isMobile }),
    [isMobile, share]
  );

  return {
    detailColumns,
    detailTablePagination,
    shareOption,
  };
}
