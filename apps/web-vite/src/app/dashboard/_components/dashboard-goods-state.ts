import { useCallback, useState } from 'react';

import type { DashboardGoodsApiResponse } from './dashboard-types';

export function useDashboardGoodsState() {
  const [goodsData, setGoodsData] = useState<DashboardGoodsApiResponse | null>(null);
  const [goodsLoadError, setGoodsLoadError] = useState<string | null>(null);
  const [goodsLoading, setGoodsLoading] = useState(false);

  const resetGoodsData = useCallback(() => {
    setGoodsData(null);
  }, []);

  const resetGoodsState = useCallback(() => {
    resetGoodsData();
    setGoodsLoadError(null);
    setGoodsLoading(false);
  }, [resetGoodsData]);

  return {
    goodsData,
    setGoodsData,
    goodsLoadError,
    setGoodsLoadError,
    goodsLoading,
    setGoodsLoading,
    resetGoodsData,
    resetGoodsState,
  };
}
