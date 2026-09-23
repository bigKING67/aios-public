import { useMemo } from 'react';
import type { DashboardGoodsCardApiResponse } from './dashboard-types';

type DashboardGoodsCardDisplayStateArgs = {
  goodsCardData: DashboardGoodsCardApiResponse | null;
  dashboardRangeLabel: string;
  isDouyinGoodsCardDimension: boolean;
  goodsCardLoadError: unknown;
};

export function useDashboardGoodsCardDisplayState({
  goodsCardData,
  dashboardRangeLabel,
  isDouyinGoodsCardDimension,
  goodsCardLoadError,
}: DashboardGoodsCardDisplayStateArgs) {
  return useMemo(
    () => ({
      goodsCardCurrentTotals: goodsCardData?.currentTotals || null,
      goodsCardPreviousTotals: goodsCardData?.previousTotals || null,
      goodsCardRangeLabel: dashboardRangeLabel,
      goodsCardDetailLoading: isDouyinGoodsCardDimension && !goodsCardData && !goodsCardLoadError,
    }),
    [
      dashboardRangeLabel,
      goodsCardData,
      goodsCardLoadError,
      isDouyinGoodsCardDimension,
    ]
  );
}
