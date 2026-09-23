import { useCallback, useState } from 'react';

import type {
  DashboardTrafficApiResponse,
  DashboardTrafficGoodsApiResponse,
} from './dashboard-types';

export function useDashboardTrafficState() {
  const [trafficData, setTrafficData] = useState<DashboardTrafficApiResponse | null>(null);
  const [trafficLoadError, setTrafficLoadError] = useState<string | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficGoodsData, setTrafficGoodsData] = useState<DashboardTrafficGoodsApiResponse | null>(null);
  const [trafficGoodsLoadError, setTrafficGoodsLoadError] = useState<string | null>(null);
  const [trafficGoodsLoading, setTrafficGoodsLoading] = useState(false);

  const resetTrafficData = useCallback(() => {
    setTrafficData(null);
  }, []);

  const resetTrafficGoodsData = useCallback(() => {
    setTrafficGoodsData(null);
  }, []);

  return {
    trafficData,
    setTrafficData,
    trafficLoadError,
    setTrafficLoadError,
    trafficLoading,
    setTrafficLoading,
    trafficGoodsData,
    setTrafficGoodsData,
    trafficGoodsLoadError,
    setTrafficGoodsLoadError,
    trafficGoodsLoading,
    setTrafficGoodsLoading,
    resetTrafficData,
    resetTrafficGoodsData,
  };
}
