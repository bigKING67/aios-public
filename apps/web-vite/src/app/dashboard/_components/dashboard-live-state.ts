import { useCallback, useState } from 'react';

import type {
  DashboardLiveApiResponse,
  DashboardLiveGoodsApiResponse,
  LiveScope,
} from './dashboard-types';

export function useDashboardLiveState() {
  const [liveData, setLiveData] = useState<DashboardLiveApiResponse | null>(null);
  const [liveLoadError, setLiveLoadError] = useState<string | null>(null);
  const [liveGoodsData, setLiveGoodsData] = useState<DashboardLiveGoodsApiResponse | null>(null);
  const [liveGoodsLoadError, setLiveGoodsLoadError] = useState<string | null>(null);
  const [liveGoodsLoading, setLiveGoodsLoading] = useState(false);
  const [liveScope, setLiveScope] = useState<LiveScope>('all');

  const resetLiveData = useCallback(() => {
    setLiveData(null);
  }, []);

  const resetLiveGoodsRowsData = useCallback(() => {
    setLiveGoodsData(null);
  }, []);

  return {
    liveData,
    setLiveData,
    liveLoadError,
    setLiveLoadError,
    liveGoodsData,
    setLiveGoodsData,
    liveGoodsLoadError,
    setLiveGoodsLoadError,
    liveGoodsLoading,
    setLiveGoodsLoading,
    liveScope,
    setLiveScope,
    resetLiveData,
    resetLiveGoodsRowsData,
  };
}
