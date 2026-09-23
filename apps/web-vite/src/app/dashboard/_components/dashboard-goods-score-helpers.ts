import type { GoodsQuadrantKey } from './dashboard-config';
import type {
  DashboardGoodsScoreDetailItem,
  DashboardGoodsScoreRankingItem,
  DashboardGoodsTableItem,
  TrendTone,
} from './dashboard-types';
import type { DashboardGoodsScoreClassNames } from './dashboard-goods-score-class-names';

type TrendClassNames = {
  trendUp: string;
  trendDown: string;
  trendNeutral: string;
};

type GoodsScoreConfidenceClassNames = Pick<
  DashboardGoodsScoreClassNames,
  'goodsScoreConfidenceHigh' | 'goodsScoreConfidenceMedium' | 'goodsScoreConfidenceLow'
>;

export function getTrendToneByRate(value: number | null | undefined): TrendTone {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    Math.abs(value) < 0.000001
  ) {
    return 'neutral';
  }
  return value > 0 ? 'up' : 'down';
}

export function computeMedian(values: number[]): number {
  const finiteValues = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (finiteValues.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 0) {
    return (finiteValues[middleIndex - 1] + finiteValues[middleIndex]) / 2;
  }
  return finiteValues[middleIndex];
}

export function classifyGoodsQuadrant(
  sharePct: number,
  wowPct: number,
  shareThresholdPct: number,
  wowThresholdPct: number
): GoodsQuadrantKey {
  if (sharePct >= shareThresholdPct) {
    return wowPct >= wowThresholdPct ? 'star' : 'stable';
  }
  return wowPct >= wowThresholdPct ? 'opportunity' : 'longtail';
}

export function getTrendClassNameByRate(
  value: number | null | undefined,
  classNames: TrendClassNames
): string {
  const tone = getTrendToneByRate(value);
  if (tone === 'up') {
    return classNames.trendUp;
  }
  if (tone === 'down') {
    return classNames.trendDown;
  }
  return classNames.trendNeutral;
}

export function getGoodsScoreConfidenceLabel(
  value: DashboardGoodsTableItem['scoreConfidence']
): string {
  if (value === 'high') {
    return '高样本';
  }
  if (value === 'medium') {
    return '中样本';
  }
  if (value === 'low') {
    return '低样本';
  }
  return '--';
}

export function getGoodsScoreConfidenceClassName(
  value: DashboardGoodsTableItem['scoreConfidence'],
  classNames: GoodsScoreConfidenceClassNames
): string {
  if (value === 'high') {
    return classNames.goodsScoreConfidenceHigh;
  }
  if (value === 'medium') {
    return classNames.goodsScoreConfidenceMedium;
  }
  return classNames.goodsScoreConfidenceLow;
}

export function buildGoodsScoreDetailFromRanking(
  row: DashboardGoodsScoreRankingItem
): DashboardGoodsScoreDetailItem {
  return {
    productId: row.productId,
    productName: row.productName,
    currGmv: row.currGmv,
    gmvWow: row.gmvWow,
    topsisScore: row.topsisScore,
    topsisRank: row.topsisRank,
    scoreConfidence: row.scoreConfidence,
    scoreBreakdown: row.scoreBreakdown,
  };
}

export function buildGoodsScoreDetailFromTable(
  row: DashboardGoodsTableItem
): DashboardGoodsScoreDetailItem | null {
  if (!row.scoreBreakdown) {
    return null;
  }
  return {
    productId: row.productId,
    productName: row.productName,
    currGmv: row.currGmv,
    gmvWow: row.gmvWow,
    topsisScore: row.topsisScore,
    topsisRank: row.topsisRank,
    scoreConfidence: row.scoreConfidence,
    scoreBreakdown: row.scoreBreakdown,
  };
}
