import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';

import type { GoodsQuadrantKey } from './dashboard-config';
import {
  buildDashboardGoodsMatrixOption,
  buildGoodsMatrixQuadrantSummary,
  buildGoodsMatrixThresholdDescription,
  getGoodsMatrixShareMedianPct,
  type DashboardGoodsMatrixClassNames,
} from './dashboard-goods-matrix-model';
import {
  buildDashboardGoodsScoreOption,
  buildDashboardGoodsScoreRadarOption,
  type DashboardGoodsScoreChartClassNames,
} from './dashboard-goods-score-chart-option';
import {
  buildDashboardGoodsColumns,
  type DashboardGoodsTableClassNames,
} from './dashboard-goods-columns';
import type {
  DashboardGoodsApiResponse,
  DashboardGoodsMatrixItem,
  DashboardGoodsScoreDetailItem,
  DashboardGoodsScoreRankingItem,
  DashboardGoodsTableItem,
} from './dashboard-types';

type DashboardGoodsDerivedViewStateArgs = {
  goodsData: DashboardGoodsApiResponse | null;
  goodsMatrixVisibleQuadrants: GoodsQuadrantKey[];
  selectedGoodsScoreDetail: DashboardGoodsScoreDetailItem | null;
  isMobile: boolean;
  goodsScoreClassNames: DashboardGoodsTableClassNames;
  goodsMatrixClassNames: DashboardGoodsMatrixClassNames;
  goodsScoreChartClassNames: DashboardGoodsScoreChartClassNames;
};

export function useDashboardGoodsDerivedViewState({
  goodsData,
  goodsMatrixVisibleQuadrants,
  selectedGoodsScoreDetail,
  isMobile,
  goodsScoreClassNames,
  goodsMatrixClassNames,
  goodsScoreChartClassNames,
}: DashboardGoodsDerivedViewStateArgs) {
  const goodsMatrixRows = useMemo<DashboardGoodsMatrixItem[]>(
    () => (Array.isArray(goodsData?.matrix) ? goodsData.matrix : []),
    [goodsData?.matrix]
  );

  const goodsTableRows = useMemo<DashboardGoodsTableItem[]>(
    () => (Array.isArray(goodsData?.table) ? goodsData.table : []),
    [goodsData?.table]
  );

  const goodsScoreRankingRows = useMemo<DashboardGoodsScoreRankingItem[]>(
    () => (Array.isArray(goodsData?.scoreRanking) ? goodsData.scoreRanking : []),
    [goodsData?.scoreRanking]
  );

  const goodsScoreRankingByProductId = useMemo<Map<string, DashboardGoodsScoreRankingItem>>(() => {
    const rowMap = new Map<string, DashboardGoodsScoreRankingItem>();
    goodsScoreRankingRows.forEach((row) => {
      rowMap.set(row.productId, row);
    });
    return rowMap;
  }, [goodsScoreRankingRows]);

  const goodsMatrixShareMedianPct = useMemo<number>(() => {
    return getGoodsMatrixShareMedianPct(goodsMatrixRows);
  }, [goodsMatrixRows]);

  const goodsMatrixOption = useMemo<EChartsCoreOption>(() => {
    return buildDashboardGoodsMatrixOption({
      rows: goodsMatrixRows,
      visibleQuadrants: goodsMatrixVisibleQuadrants,
      scoreRankingByProductId: goodsScoreRankingByProductId,
      chartTokens: ECHARTS_CHART_TOKENS,
      classNames: goodsMatrixClassNames,
    });
  }, [
    goodsMatrixClassNames,
    goodsMatrixRows,
    goodsMatrixVisibleQuadrants,
    goodsScoreRankingByProductId,
  ]);

  const goodsScoreOption = useMemo<EChartsCoreOption>(() => {
    return buildDashboardGoodsScoreOption({
      rows: goodsScoreRankingRows,
      isMobile,
      chartTokens: ECHARTS_CHART_TOKENS,
      classNames: goodsScoreChartClassNames,
    });
  }, [goodsScoreChartClassNames, goodsScoreRankingRows, isMobile]);

  const goodsScoreRadarOption = useMemo<EChartsCoreOption>(() => {
    return buildDashboardGoodsScoreRadarOption({
      detail: selectedGoodsScoreDetail,
      chartTokens: ECHARTS_CHART_TOKENS,
    });
  }, [selectedGoodsScoreDetail]);

  const goodsMatrixThresholdDescription = useMemo(() => {
    return buildGoodsMatrixThresholdDescription({
      rows: goodsMatrixRows,
      shareMedianPct: goodsMatrixShareMedianPct,
    });
  }, [goodsMatrixRows, goodsMatrixShareMedianPct]);

  const goodsMatrixQuadrantSummary = useMemo(() => {
    return buildGoodsMatrixQuadrantSummary({
      rows: goodsMatrixRows,
      shareMedianPct: goodsMatrixShareMedianPct,
    });
  }, [goodsMatrixRows, goodsMatrixShareMedianPct]);

  const goodsColumns = useMemo<ColumnsType<DashboardGoodsTableItem>>(
    () =>
      buildDashboardGoodsColumns({
        isMobile,
        classNames: goodsScoreClassNames,
      }),
    [goodsScoreClassNames, isMobile]
  );

  return {
    goodsTableRows,
    goodsScoreRankingRows,
    goodsScoreRankingByProductId,
    goodsMatrixOption,
    goodsScoreOption,
    goodsScoreRadarOption,
    goodsMatrixThresholdDescription,
    goodsMatrixQuadrantSummary,
    goodsColumns,
  };
}
