import { useMemo } from 'react';
import type {
  DashboardLiveApiResponse,
  DashboardShortVideoApiResponse,
} from './dashboard-types';

type DashboardMediaDisplayStateArgs = {
  isDouyinLiveDimension: boolean;
  liveData: DashboardLiveApiResponse | null;
  liveLoadError: unknown;
  isDouyinShortVideoDimension: boolean;
  shortVideoData: DashboardShortVideoApiResponse | null;
  shortVideoLoadError: unknown;
};

export function useDashboardMediaDisplayState({
  isDouyinLiveDimension,
  liveData,
  liveLoadError,
  isDouyinShortVideoDimension,
  shortVideoData,
  shortVideoLoadError,
}: DashboardMediaDisplayStateArgs) {
  return useMemo(
    () => ({
      liveDetailLoading: isDouyinLiveDimension && !liveData && !liveLoadError,
      shortVideoDetailLoading:
        isDouyinShortVideoDimension && !shortVideoData && !shortVideoLoadError,
    }),
    [
      isDouyinLiveDimension,
      isDouyinShortVideoDimension,
      liveData,
      liveLoadError,
      shortVideoData,
      shortVideoLoadError,
    ]
  );
}
