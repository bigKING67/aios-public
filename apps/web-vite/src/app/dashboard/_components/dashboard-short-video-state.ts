import { useCallback, useState } from 'react';

import type { DashboardShortVideoApiResponse, ShortVideoScope } from './dashboard-types';

export function useDashboardShortVideoState() {
  const [shortVideoData, setShortVideoData] = useState<DashboardShortVideoApiResponse | null>(null);
  const [shortVideoLoadError, setShortVideoLoadError] = useState<string | null>(null);
  const [shortVideoScope, setShortVideoScope] = useState<ShortVideoScope>('all');

  const resetShortVideoData = useCallback(() => {
    setShortVideoData(null);
  }, []);

  const resetShortVideoState = useCallback(() => {
    resetShortVideoData();
    setShortVideoLoadError(null);
  }, [resetShortVideoData]);

  return {
    shortVideoData,
    setShortVideoData,
    shortVideoLoadError,
    setShortVideoLoadError,
    shortVideoScope,
    setShortVideoScope,
    resetShortVideoData,
    resetShortVideoState,
  };
}
