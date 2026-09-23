import { useMemo } from 'react';

import {
  filterTrafficGoodsTreeNodes,
  filterTrafficTreeNodes,
} from './dashboard-traffic-model';
import type {
  DashboardTrafficApiResponse,
  DashboardTrafficGoodsApiResponse,
  DashboardTrafficGoodsTreeNode,
  DashboardTrafficTreeNode,
} from './dashboard-types';

type DashboardTrafficDerivedStateArgs = {
  trafficData: DashboardTrafficApiResponse | null;
  trafficGoodsData: DashboardTrafficGoodsApiResponse | null;
};

type DashboardTrafficDerivedState = {
  trafficDisplayTree: DashboardTrafficTreeNode[];
  trafficGoodsDisplayTree: DashboardTrafficGoodsTreeNode[];
};

export function useDashboardTrafficDerivedState({
  trafficData,
  trafficGoodsData,
}: DashboardTrafficDerivedStateArgs): DashboardTrafficDerivedState {
  const trafficDisplayTree = useMemo(
    () => filterTrafficTreeNodes(trafficData?.tree),
    [trafficData?.tree]
  );
  const trafficGoodsDisplayTree = useMemo(
    () => filterTrafficGoodsTreeNodes(trafficGoodsData?.tree),
    [trafficGoodsData?.tree]
  );

  return {
    trafficDisplayTree,
    trafficGoodsDisplayTree,
  };
}
