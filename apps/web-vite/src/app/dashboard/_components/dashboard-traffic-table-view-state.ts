import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';

import {
  buildDashboardTrafficColumns,
  buildDashboardTrafficGoodsColumns,
  type DashboardTrafficTableClassNames,
} from './dashboard-traffic-columns';
import type {
  DashboardTrafficGoodsTreeNode,
  DashboardTrafficTreeNode,
} from './dashboard-types';

type DashboardTrafficTableViewStateArgs = {
  isMobile: boolean;
  trafficTableClassNames: DashboardTrafficTableClassNames;
};

export function useDashboardTrafficTableViewState({
  isMobile,
  trafficTableClassNames,
}: DashboardTrafficTableViewStateArgs) {
  const trafficColumns = useMemo<ColumnsType<DashboardTrafficTreeNode>>(
    () =>
      buildDashboardTrafficColumns({
        isMobile,
        classNames: trafficTableClassNames,
      }),
    [isMobile, trafficTableClassNames]
  );

  const trafficGoodsColumns = useMemo<ColumnsType<DashboardTrafficGoodsTreeNode>>(
    () =>
      buildDashboardTrafficGoodsColumns({
        isMobile,
        classNames: trafficTableClassNames,
      }),
    [isMobile, trafficTableClassNames]
  );

  return {
    trafficColumns,
    trafficGoodsColumns,
  };
}
