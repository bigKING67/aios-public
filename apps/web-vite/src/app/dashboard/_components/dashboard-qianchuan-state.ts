import { useCallback, useState } from 'react';

import type { DashboardQianchuanApiResponse } from './dashboard-types';

export function useDashboardQianchuanState() {
  const [qianchuanData, setQianchuanData] = useState<DashboardQianchuanApiResponse | null>(null);
  const [qianchuanLoadError, setQianchuanLoadError] = useState<string | null>(null);
  const [qianchuanLoading, setQianchuanLoading] = useState(false);

  const resetQianchuanData = useCallback(() => {
    setQianchuanData(null);
  }, []);

  const resetQianchuanState = useCallback(() => {
    resetQianchuanData();
    setQianchuanLoadError(null);
    setQianchuanLoading(false);
  }, [resetQianchuanData]);

  return {
    qianchuanData,
    setQianchuanData,
    qianchuanLoadError,
    setQianchuanLoadError,
    qianchuanLoading,
    setQianchuanLoading,
    resetQianchuanData,
    resetQianchuanState,
  };
}
