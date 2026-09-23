import type { GoodsQuadrantKey } from './dashboard-config';
import { formatSignedRatePercent, formatTableNumber } from './dashboard-formatters';
import { escapeTooltipHtml } from './dashboard-html-formatters';
import type {
  DashboardGoodsScoreRankingItem,
  DashboardGoodsTableItem,
  GoodsMatrixTooltipData,
} from './dashboard-types';
import type { DashboardGoodsScoreClassNames } from './dashboard-goods-score-class-names';
import {
  getGoodsScoreConfidenceLabel,
  getTrendToneByRate,
} from './dashboard-goods-score-helpers';

function getGoodsScoreTooltipConfidenceClassName(
  value: DashboardGoodsTableItem['scoreConfidence'],
  classNames: DashboardGoodsScoreClassNames
): string {
  if (value === 'high') {
    return classNames.goodsScoreTooltipConfidenceHigh;
  }
  if (value === 'medium') {
    return classNames.goodsScoreTooltipConfidenceMedium;
  }
  if (value === 'low') {
    return classNames.goodsScoreTooltipConfidenceLow;
  }
  return classNames.goodsScoreTooltipConfidenceNeutral;
}

function getGoodsMatrixTooltipQuadrantClassName(
  value: GoodsQuadrantKey | null | undefined,
  classNames: DashboardGoodsScoreClassNames
): string {
  if (value === 'star') {
    return classNames.goodsMatrixTooltipQuadrantStar;
  }
  if (value === 'stable') {
    return classNames.goodsMatrixTooltipQuadrantStable;
  }
  if (value === 'opportunity') {
    return classNames.goodsMatrixTooltipQuadrantOpportunity;
  }
  if (value === 'longtail') {
    return classNames.goodsMatrixTooltipQuadrantLongtail;
  }
  return classNames.goodsMatrixTooltipQuadrantNeutral;
}

export function buildGoodsMatrixTooltipHtml({
  item,
  classNames,
}: {
  item: GoodsMatrixTooltipData;
  classNames: DashboardGoodsScoreClassNames;
}): string {
  const trendClassName = (() => {
    const trendTone = getTrendToneByRate(item.gmvWow);
    if (trendTone === 'up') {
      return classNames.goodsScoreTooltipTrendUp;
    }
    if (trendTone === 'down') {
      return classNames.goodsScoreTooltipTrendDown;
    }
    return classNames.goodsScoreTooltipTrendNeutral;
  })();
  const shareValue =
    item.salesShare !== null &&
    item.salesShare !== undefined &&
    Number.isFinite(item.salesShare)
      ? (item.salesShare * 100).toFixed(2)
      : '--';
  const hasShare = shareValue !== '--';
  const hasTopsisScore =
    item.topsisScore !== null &&
    item.topsisScore !== undefined &&
    Number.isFinite(item.topsisScore);
  const hasTopsisRank =
    item.topsisRank !== null &&
    item.topsisRank !== undefined &&
    Number.isFinite(item.topsisRank);
  const hasConfidence =
    item.scoreConfidence === 'high' ||
    item.scoreConfidence === 'medium' ||
    item.scoreConfidence === 'low';
  const confidenceClassName = getGoodsScoreTooltipConfidenceClassName(
    item.scoreConfidence || null,
    classNames
  );
  const confidenceLabel = hasConfidence ? getGoodsScoreConfidenceLabel(item.scoreConfidence || null) : '';
  const quadrantClassName = getGoodsMatrixTooltipQuadrantClassName(item.quadrant, classNames);
  const safeProductName = escapeTooltipHtml(item.productName || '--');
  const safeProductId = escapeTooltipHtml(item.productId || '--');
  const safeQuadrantLabel = escapeTooltipHtml(item.quadrantLabel || '--');

  return [
    `<div class="${classNames.goodsScoreTooltipCard}">`,
    `<div class="${classNames.goodsScoreTooltipTitle}" title="${safeProductName}">${safeProductName}</div>`,
    `<div class="${classNames.goodsScoreTooltipSub}">商品ID：${safeProductId}</div>`,
    `<div class="${classNames.goodsScoreTooltipKpis}">`,
    `<div class="${classNames.goodsScoreTooltipScoreWrap}">`,
    `<span class="${classNames.goodsScoreTooltipScoreLabel}">销售额占比</span>`,
    `<span class="${classNames.goodsScoreTooltipScoreValue}">${shareValue}${
      hasShare ? `<span class="${classNames.goodsScoreTooltipScoreMax}">%</span>` : ''
    }</span>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipMetaWrap}">`,
    `<span class="${classNames.goodsMatrixTooltipQuadrantTag} ${quadrantClassName}">${safeQuadrantLabel}</span>`,
    hasTopsisRank
      ? `<span class="${classNames.goodsScoreTooltipRank}">TOPSIS 排名 #${Math.round(Number(item.topsisRank))}</span>`
      : '',
    '</div>',
    '</div>',
    `<div class="${classNames.goodsScoreTooltipRow}">`,
    '<span>本期销售额</span>',
    `<strong class="${classNames.goodsScoreTooltipRowValue}">¥${formatTableNumber(item.currGmv ?? 0, 2)}</strong>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipRow}">`,
    '<span>GMV同期环比</span>',
    `<strong class="${classNames.goodsScoreTooltipRowValue} ${trendClassName}">${formatSignedRatePercent(item.gmvWow, 1)}</strong>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipRow}">`,
    '<span>上期销售额</span>',
    `<strong class="${classNames.goodsScoreTooltipRowValue}">¥${formatTableNumber(item.prevGmv ?? 0, 2)}</strong>`,
    '</div>',
    hasTopsisScore
      ? `<div class="${classNames.goodsScoreTooltipRow}"><span>综合分</span><strong class="${classNames.goodsScoreTooltipRowValue}">${Number(item.topsisScore).toFixed(1)} / 10</strong></div>`
      : '',
    hasConfidence
      ? `<div class="${classNames.goodsScoreTooltipRow}"><span>样本稳定性</span><span class="${classNames.goodsScoreTooltipConfidence} ${confidenceClassName}">${escapeTooltipHtml(confidenceLabel)}</span></div>`
      : '',
    '</div>',
  ].join('');
}

export function buildGoodsScoreTooltipHtml({
  row,
  classNames,
}: {
  row: DashboardGoodsScoreRankingItem;
  classNames: DashboardGoodsScoreClassNames;
}): string {
  const trendTone = getTrendToneByRate(row.gmvWow);
  const confidenceClassName = getGoodsScoreTooltipConfidenceClassName(row.scoreConfidence, classNames);
  const trendClassName = (() => {
    if (trendTone === 'up') {
      return classNames.goodsScoreTooltipTrendUp;
    }
    if (trendTone === 'down') {
      return classNames.goodsScoreTooltipTrendDown;
    }
    return classNames.goodsScoreTooltipTrendNeutral;
  })();
  const breakdown = row.scoreBreakdown;

  return [
    `<div class="${classNames.goodsScoreTooltipCard}">`,
    `<div class="${classNames.goodsScoreTooltipTitle}" title="${escapeTooltipHtml(row.productName)}">${escapeTooltipHtml(row.productName)}</div>`,
    `<div class="${classNames.goodsScoreTooltipSub}">商品ID：${escapeTooltipHtml(row.productId)}</div>`,
    `<div class="${classNames.goodsScoreTooltipKpis}">`,
    `<div class="${classNames.goodsScoreTooltipScoreWrap}">`,
    `<span class="${classNames.goodsScoreTooltipScoreLabel}">综合分</span>`,
    `<span class="${classNames.goodsScoreTooltipScoreValue}">${row.topsisScore.toFixed(1)}<span class="${classNames.goodsScoreTooltipScoreMax}"> / 10</span></span>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipMetaWrap}">`,
    `<span class="${classNames.goodsScoreTooltipConfidence} ${confidenceClassName}">${escapeTooltipHtml(
      getGoodsScoreConfidenceLabel(row.scoreConfidence)
    )}</span>`,
    `<span class="${classNames.goodsScoreTooltipRank}">排名 #${row.topsisRank}</span>`,
    '</div>',
    '</div>',
    `<div class="${classNames.goodsScoreTooltipRow}">`,
    '<span>本期销售额</span>',
    `<strong class="${classNames.goodsScoreTooltipRowValue}">¥${formatTableNumber(row.currGmv, 2)}</strong>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipRow}">`,
    '<span>GMV同期环比</span>',
    `<strong class="${classNames.goodsScoreTooltipRowValue} ${trendClassName}">${formatSignedRatePercent(row.gmvWow, 1)}</strong>`,
    '</div>',
    `<div class="${classNames.goodsScoreTooltipGrid}">`,
    `<div class="${classNames.goodsScoreTooltipGridItem}"><span>规模分</span><strong class="${classNames.goodsScoreTooltipGridValue}">${breakdown.scale.toFixed(1)}</strong></div>`,
    `<div class="${classNames.goodsScoreTooltipGridItem}"><span>效率分</span><strong class="${classNames.goodsScoreTooltipGridValue}">${breakdown.efficiency.toFixed(1)}</strong></div>`,
    `<div class="${classNames.goodsScoreTooltipGridItem}"><span>增长分</span><strong class="${classNames.goodsScoreTooltipGridValue}">${breakdown.growth.toFixed(1)}</strong></div>`,
    `<div class="${classNames.goodsScoreTooltipGridItem}"><span>风险分</span><strong class="${classNames.goodsScoreTooltipGridValue}">${breakdown.risk.toFixed(1)}</strong></div>`,
    '</div>',
    '</div>',
  ].join('');
}
