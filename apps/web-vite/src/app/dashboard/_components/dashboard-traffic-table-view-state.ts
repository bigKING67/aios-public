import { useMemo } from 'react';
import type { TableColumnsType } from '@lobehub/ui';

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
  const trafficColumns = useMemo<TableColumnsType<DashboardTrafficTreeNode>>(
    () =>
      buildDashboardTrafficColumns({
        isMobile,
        classNames: trafficTableClassNames,
      }),
    [isMobile, trafficTableClassNames]
  );

  const trafficGoodsColumns = useMemo<TableColumnsType<DashboardTrafficGoodsTreeNode>>(
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
