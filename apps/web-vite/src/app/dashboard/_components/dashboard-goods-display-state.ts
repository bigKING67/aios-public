import { useMemo } from 'react';
import type { DashboardGoodsApiResponse } from './dashboard-types';

type DashboardGoodsDisplayStateArgs = {
  goodsData: DashboardGoodsApiResponse | null;
  dashboardRangeLabel: string;
  dashboardFallbackAsOfDate: string;
  goodsScoreRankingCount: number;
};

export function useDashboardGoodsDisplayState({
  goodsData,
  dashboardRangeLabel,
  dashboardFallbackAsOfDate,
  goodsScoreRankingCount,
}: DashboardGoodsDisplayStateArgs) {
  return useMemo(
    () => ({
      goodsRangeLabel: dashboardRangeLabel,
      goodsAsOfDate: goodsData?.asOfDate || dashboardFallbackAsOfDate,
      goodsSummary: goodsData?.summary,
      goodsScorePoolN: goodsData?.scorePoolN || 0,
      goodsScoreVisibleCount: goodsScoreRankingCount,
    }),
    [
      dashboardFallbackAsOfDate,
      dashboardRangeLabel,
      goodsData?.asOfDate,
      goodsData?.scorePoolN,
      goodsData?.summary,
      goodsScoreRankingCount,
    ]
  );
}
