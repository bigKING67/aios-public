import {
  GOODS_MATRIX_WOW_BASELINE,
  GOODS_QUADRANT_META,
  GOODS_QUADRANT_ORDER,
} from './dashboard-config';
import type { GoodsQuadrantKey } from './dashboard-config';
import {
  classifyGoodsQuadrant,
  computeMedian,
} from './dashboard-goods-score-model';
import type { DashboardGoodsMatrixItem } from './dashboard-types';

export interface DashboardGoodsMatrixQuadrantSummaryItem {
  key: GoodsQuadrantKey;
  label: string;
  color: string;
  count: number;
  gmvShare: number | null;
}

export function getGoodsMatrixShareMedianPct(rows: DashboardGoodsMatrixItem[]): number {
  const shareValues = rows
    .map((row) => (row.salesShare ?? 0) * 100)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return computeMedian(shareValues);
}

export function buildGoodsMatrixThresholdDescription({
  rows,
  shareMedianPct,
}: {
  rows: DashboardGoodsMatrixItem[];
  shareMedianPct: number;
}): string {
  if (!rows.length) {
    return '象限阈值：占比中位数 -- ｜ 环比 0%';
  }
  return `象限阈值：占比中位数 ${shareMedianPct.toFixed(2)}% ｜ 环比 0%`;
}

export function buildGoodsMatrixQuadrantSummary({
  rows,
  shareMedianPct,
}: {
  rows: DashboardGoodsMatrixItem[];
  shareMedianPct: number;
}): DashboardGoodsMatrixQuadrantSummaryItem[] {
  const totalGmv = rows.reduce((sum, row) => sum + row.currGmv, 0);
  const base = GOODS_QUADRANT_ORDER.reduce<Record<GoodsQuadrantKey, { count: number; gmv: number }>>(
    (accumulator, key) => ({
      ...accumulator,
      [key]: { count: 0, gmv: 0 },
    }),
    {
      star: { count: 0, gmv: 0 },
      stable: { count: 0, gmv: 0 },
      opportunity: { count: 0, gmv: 0 },
      longtail: { count: 0, gmv: 0 },
    }
  );

  for (const row of rows) {
    const sharePct = (row.salesShare ?? 0) * 100;
    const wowPct = (row.gmvWow ?? 0) * 100;
    const quadrant = classifyGoodsQuadrant(sharePct, wowPct, shareMedianPct, GOODS_MATRIX_WOW_BASELINE);
    base[quadrant].count += 1;
    base[quadrant].gmv += row.currGmv;
  }

  return GOODS_QUADRANT_ORDER.map((key) => {
    const detail = base[key];
    const gmvShare = totalGmv > Number.EPSILON ? detail.gmv / totalGmv : null;
    return {
      key,
      label: GOODS_QUADRANT_META[key].label,
      color: GOODS_QUADRANT_META[key].color,
      count: detail.count,
      gmvShare,
    };
  });
}
