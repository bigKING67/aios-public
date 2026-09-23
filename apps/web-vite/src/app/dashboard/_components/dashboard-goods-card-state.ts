import { useCallback, useState } from 'react';

import type {
  DashboardGoodsCardApiResponse,
  DashboardGoodsCardTrafficApiResponse,
} from './dashboard-types';

export function useDashboardGoodsCardState() {
  const [goodsCardData, setGoodsCardData] = useState<DashboardGoodsCardApiResponse | null>(null);
  const [goodsCardLoadError, setGoodsCardLoadError] = useState<string | null>(null);
  const [goodsCardLoading, setGoodsCardLoading] = useState(false);
  const [goodsCardTrafficData, setGoodsCardTrafficData] =
    useState<DashboardGoodsCardTrafficApiResponse | null>(null);
  const [goodsCardTrafficLoadError, setGoodsCardTrafficLoadError] = useState<string | null>(null);
  const [goodsCardTrafficLoading, setGoodsCardTrafficLoading] = useState(false);

  const resetGoodsCardData = useCallback(() => {
    setGoodsCardData(null);
  }, []);

  const resetGoodsCardTrafficData = useCallback(() => {
    setGoodsCardTrafficData(null);
  }, []);

  return {
    goodsCardData,
    setGoodsCardData,
    goodsCardLoadError,
    setGoodsCardLoadError,
    goodsCardLoading,
    setGoodsCardLoading,
    goodsCardTrafficData,
    setGoodsCardTrafficData,
    goodsCardTrafficLoadError,
    setGoodsCardTrafficLoadError,
    goodsCardTrafficLoading,
    setGoodsCardTrafficLoading,
    resetGoodsCardData,
    resetGoodsCardTrafficData,
  };
}
