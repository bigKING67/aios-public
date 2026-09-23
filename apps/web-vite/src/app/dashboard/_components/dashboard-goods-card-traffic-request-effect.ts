import { useEffect, type Dispatch, type Key, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveGoodsCardTrafficLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardGoodsCardTraffic } from './dashboard-fetchers';
import { collectGoodsCardTrafficExpandedRowKeys } from './dashboard-traffic-model';
import type {
  DashboardGoodsCardRow,
  DashboardGoodsCardTrafficApiResponse,
} from './dashboard-types';

type DashboardGoodsCardTrafficRequestEffectArgs = {
  isEnabled: boolean;
  isDrawerOpen: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  selectedGoodsCardRow: DashboardGoodsCardRow | null;
  setGoodsCardTrafficData: Dispatch<SetStateAction<DashboardGoodsCardTrafficApiResponse | null>>;
  setGoodsCardTrafficLoadError: Dispatch<SetStateAction<string | null>>;
  setGoodsCardTrafficLoading: Dispatch<SetStateAction<boolean>>;
  setExpandedGoodsCardTrafficRowKeys: Dispatch<SetStateAction<Key[]>>;
  resetGoodsCardTrafficDrawerData: () => void;
  resetGoodsCardTrafficRowsData: () => void;
};

export function useDashboardGoodsCardTrafficRequestEffect({
  isEnabled,
  isDrawerOpen,
  messageApi,
  currentRange,
  previousRange,
  selectedGoodsCardRow,
  setGoodsCardTrafficData,
  setGoodsCardTrafficLoadError,
  setGoodsCardTrafficLoading,
  setExpandedGoodsCardTrafficRowKeys,
  resetGoodsCardTrafficDrawerData,
  resetGoodsCardTrafficRowsData,
}: DashboardGoodsCardTrafficRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled || !isDrawerOpen || !selectedGoodsCardRow) {
      setGoodsCardTrafficLoading(false);
      resetGoodsCardTrafficDrawerData();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setGoodsCardTrafficLoading(true);
    setGoodsCardTrafficLoadError(null);
    fetchDashboardGoodsCardTraffic(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'douyin',
        productId: selectedGoodsCardRow.product_id,
        shopId: selectedGoodsCardRow.shop_id,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-goods-card-traffic',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setGoodsCardTrafficLoadError(null);
        setGoodsCardTrafficData(payload);
        setExpandedGoodsCardTrafficRowKeys(collectGoodsCardTrafficExpandedRowKeys(payload.tree));
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetGoodsCardTrafficRowsData();
        setGoodsCardTrafficLoadError(resolveGoodsCardTrafficLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setGoodsCardTrafficLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    currentEnd,
    currentStart,
    isDrawerOpen,
    isEnabled,
    messageApi,
    previousEnd,
    previousStart,
    resetGoodsCardTrafficDrawerData,
    resetGoodsCardTrafficRowsData,
    selectedGoodsCardRow,
    setExpandedGoodsCardTrafficRowKeys,
    setGoodsCardTrafficData,
    setGoodsCardTrafficLoadError,
    setGoodsCardTrafficLoading,
  ]);
}
