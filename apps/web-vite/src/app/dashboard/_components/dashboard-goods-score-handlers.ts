import { useCallback } from 'react';

import {
  buildGoodsScoreDetailFromRanking,
  buildGoodsScoreDetailFromTable,
} from './dashboard-goods-score-model';
import type {
  DashboardGoodsScoreDetailItem,
  DashboardGoodsScoreRankingItem,
  DashboardGoodsTableItem,
} from './dashboard-types';

type DashboardGoodsScoreHandlersArgs = {
  goodsScoreRankingRows: DashboardGoodsScoreRankingItem[];
  goodsScoreRankingByProductId: Map<string, DashboardGoodsScoreRankingItem>;
  openGoodsScoreDrawer: (detail: DashboardGoodsScoreDetailItem | null) => void;
  closeGoodsScoreDrawer: () => void;
};

export function useDashboardGoodsScoreHandlers({
  goodsScoreRankingRows,
  goodsScoreRankingByProductId,
  openGoodsScoreDrawer,
  closeGoodsScoreDrawer,
}: DashboardGoodsScoreHandlersArgs) {
  const handleOpenGoodsScoreDrilldown = useCallback(
    (detail: DashboardGoodsScoreDetailItem | null) => {
      openGoodsScoreDrawer(detail);
    },
    [openGoodsScoreDrawer]
  );

  const handleGoodsScoreBarClick = useCallback((params: unknown) => {
    const payload = params as {
      dataIndex?: unknown;
    };

    if (typeof payload.dataIndex !== 'number') {
      return;
    }

    const row = goodsScoreRankingRows[payload.dataIndex];
    if (!row) {
      return;
    }

    handleOpenGoodsScoreDrilldown(buildGoodsScoreDetailFromRanking(row));
  }, [goodsScoreRankingRows, handleOpenGoodsScoreDrilldown]);

  const handleGoodsScoreRowClick = useCallback((row: DashboardGoodsTableItem) => {
    const rankingRow = goodsScoreRankingByProductId.get(row.productId);
    if (rankingRow) {
      handleOpenGoodsScoreDrilldown(buildGoodsScoreDetailFromRanking(rankingRow));
      return;
    }

    handleOpenGoodsScoreDrilldown(buildGoodsScoreDetailFromTable(row));
  }, [goodsScoreRankingByProductId, handleOpenGoodsScoreDrilldown]);

  const handleCloseGoodsScoreDrawer = useCallback(() => {
    closeGoodsScoreDrawer();
  }, [closeGoodsScoreDrawer]);

  return {
    handleGoodsScoreBarClick,
    handleGoodsScoreRowClick,
    handleCloseGoodsScoreDrawer,
  };
}
