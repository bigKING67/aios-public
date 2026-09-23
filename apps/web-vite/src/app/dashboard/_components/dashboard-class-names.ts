import {
  getTrendClassNameByRate as resolveTrendClassNameByRate,
} from './dashboard-goods-score-model';
import type { DashboardGoodsTableClassNames } from './dashboard-goods-columns';
import type { DashboardGoodsMatrixClassNames } from './dashboard-goods-matrix-model';
import type { DashboardGoodsScoreChartClassNames } from './dashboard-goods-score-chart-option';
import type { DashboardTrafficTableClassNames } from './dashboard-traffic-columns';
import type { DashboardGoodsCardTableClassNames } from './dashboard-goods-card-columns';
import type { DashboardLiveChartClassNames } from './dashboard-live-trend-option';
import type { DashboardLiveDetailTableClassNames } from './dashboard-live-detail-columns';
import type { DashboardShortVideoDetailTableClassNames } from './dashboard-short-video-detail-columns';
import type { DashboardOverviewDetailTableClassNames } from './dashboard-overview-detail-columns';

export type DashboardStyleModule = Readonly<Record<string, string>>;

export function buildDashboardGoodsClassNames({
  goodsScoreTooltipStyles,
  goodsTableStyles,
}: {
  goodsScoreTooltipStyles: DashboardStyleModule;
  goodsTableStyles: DashboardStyleModule;
}) {
  const goodsScoreClassNames = {
    goodsScoreTooltipCard: goodsScoreTooltipStyles.card,
    goodsScoreTooltipTitle: goodsScoreTooltipStyles.title,
    goodsScoreTooltipSub: goodsScoreTooltipStyles.sub,
    goodsScoreTooltipKpis: goodsScoreTooltipStyles.kpis,
    goodsScoreTooltipScoreWrap: goodsScoreTooltipStyles.scoreWrap,
    goodsScoreTooltipScoreLabel: goodsScoreTooltipStyles.scoreLabel,
    goodsScoreTooltipScoreValue: goodsScoreTooltipStyles.scoreValue,
    goodsScoreTooltipScoreMax: goodsScoreTooltipStyles.scoreMax,
    goodsScoreTooltipMetaWrap: goodsScoreTooltipStyles.metaWrap,
    goodsMatrixTooltipQuadrantTag: goodsScoreTooltipStyles.quadrantTag,
    goodsMatrixTooltipQuadrantStar: goodsScoreTooltipStyles.quadrantStar,
    goodsMatrixTooltipQuadrantStable: goodsScoreTooltipStyles.quadrantStable,
    goodsMatrixTooltipQuadrantOpportunity: goodsScoreTooltipStyles.quadrantOpportunity,
    goodsMatrixTooltipQuadrantLongtail: goodsScoreTooltipStyles.quadrantLongtail,
    goodsMatrixTooltipQuadrantNeutral: goodsScoreTooltipStyles.quadrantNeutral,
    goodsScoreTooltipRank: goodsScoreTooltipStyles.rank,
    goodsScoreTooltipRow: goodsScoreTooltipStyles.row,
    goodsScoreTooltipTrendUp: goodsScoreTooltipStyles.trendUp,
    goodsScoreTooltipTrendDown: goodsScoreTooltipStyles.trendDown,
    goodsScoreTooltipTrendNeutral: goodsScoreTooltipStyles.trendNeutral,
    goodsScoreTooltipGrid: goodsScoreTooltipStyles.grid,
    goodsScoreTooltipGridItem: goodsScoreTooltipStyles.gridItem,
    goodsScoreTooltipGridValue: goodsScoreTooltipStyles.gridValue,
    goodsScoreTooltipRowValue: goodsScoreTooltipStyles.rowValue,
    goodsScoreTooltipConfidence: goodsScoreTooltipStyles.confidence,
    goodsScoreTooltipConfidenceHigh: goodsScoreTooltipStyles.confidenceHigh,
    goodsScoreTooltipConfidenceMedium: goodsScoreTooltipStyles.confidenceMedium,
    goodsScoreTooltipConfidenceLow: goodsScoreTooltipStyles.confidenceLow,
    goodsScoreTooltipConfidenceNeutral: goodsScoreTooltipStyles.confidenceNeutral,
    trendUp: goodsTableStyles.metricTrendUp,
    trendDown: goodsTableStyles.metricTrendDown,
    trendNeutral: goodsTableStyles.metricTrendNeutral,
    goodsScoreConfidenceHigh: goodsTableStyles.confidenceHigh,
    goodsScoreConfidenceMedium: goodsTableStyles.confidenceMedium,
    goodsScoreConfidenceLow: goodsTableStyles.confidenceLow,
    goodsDataShellHeaderCell: goodsTableStyles.goodsDataShellHeaderCell,
    goodsDataShellBodyCell: goodsTableStyles.goodsDataShellBodyCell,
    goodsDataHeaderCell: goodsTableStyles.goodsDataHeaderCell,
    goodsDataMetricHeaderCell: goodsTableStyles.goodsDataMetricHeaderCell,
    goodsDataBodyCell: goodsTableStyles.goodsDataBodyCell,
    goodsMetricCell: goodsTableStyles.metricCell,
    goodsMetricValue: goodsTableStyles.metricValue,
    goodsMetricMeta: goodsTableStyles.metricMeta,
    goodsMetricTrend: goodsTableStyles.metricTrend,
    goodsNameCell: goodsTableStyles.nameCell,
    goodsNameText: goodsTableStyles.nameText,
    goodsIdText: goodsTableStyles.idText,
    goodsScoreHeaderLabel: goodsTableStyles.scoreHeaderLabel,
    goodsScoreCell: goodsTableStyles.scoreCell,
    goodsScoreValue: goodsTableStyles.scoreValue,
    goodsScoreMeta: goodsTableStyles.scoreMeta,
    goodsScoreConfidencePill: goodsTableStyles.confidencePill,
  } satisfies DashboardGoodsTableClassNames;

  const goodsMatrixClassNames = {
    ...goodsScoreClassNames,
    goodsMatrixTooltip: goodsScoreTooltipStyles.matrixTooltip,
  } satisfies DashboardGoodsMatrixClassNames;

  const goodsScoreChartClassNames = {
    ...goodsScoreClassNames,
    goodsScoreTooltip: goodsScoreTooltipStyles.scoreTooltip,
  } satisfies DashboardGoodsScoreChartClassNames;

  return {
    goodsScoreClassNames,
    goodsMatrixClassNames,
    goodsScoreChartClassNames,
    getTrendClassNameByRate: (value: number | null | undefined) =>
      resolveTrendClassNameByRate(value, goodsScoreClassNames),
  };
}

export function buildDashboardTrafficClassNames({
  trafficTableStyles,
}: {
  trafficTableStyles: DashboardStyleModule;
}) {
  const trafficTableClassNames = {
    trafficHeaderCell: trafficTableStyles.trafficHeaderCell,
    trafficFirstHeaderCell: trafficTableStyles.trafficFirstHeaderCell,
    trafficMetricHeaderCell: trafficTableStyles.trafficMetricHeaderCell,
    trafficGoodsMetricHeaderCell: trafficTableStyles.trafficGoodsMetricHeaderCell,
    trafficBodyCell: trafficTableStyles.trafficBodyCell,
    trafficFirstCell: trafficTableStyles.trafficFirstCell,
    trafficFirstCellL1: trafficTableStyles.trafficFirstCellL1,
    trafficFirstCellL2: trafficTableStyles.trafficFirstCellL2,
    trafficFirstCellL3: trafficTableStyles.trafficFirstCellL3,
    trafficGoodsFirstCellSummary: trafficTableStyles.trafficGoodsFirstCellSummary,
    trafficGoodsFirstCellL1: trafficTableStyles.trafficGoodsFirstCellL1,
    trafficGoodsFirstCellL2: trafficTableStyles.trafficGoodsFirstCellL2,
    trafficGoodsFirstCellL3: trafficTableStyles.trafficGoodsFirstCellL3,
    trafficMetricCell: trafficTableStyles.metricCell,
    trafficMetricValue: trafficTableStyles.metricValue,
    trafficMetricMeta: trafficTableStyles.metricMeta,
    trafficMetricMetaLabel: trafficTableStyles.metricMetaLabel,
    trafficMetricTrend: trafficTableStyles.metricTrend,
    trafficSourceCell: trafficTableStyles.sourceCell,
    trafficLevelBadge: trafficTableStyles.levelBadge,
    trafficLevelBadgeSummary: trafficTableStyles.levelBadgeSummary,
    trafficLevelBadgeL1: trafficTableStyles.levelBadgeL1,
    trafficLevelBadgeL2: trafficTableStyles.levelBadgeL2,
    trafficLevelBadgeL3: trafficTableStyles.levelBadgeL3,
    trafficSourceTextWrap: trafficTableStyles.sourceTextWrap,
    trafficSourceName: trafficTableStyles.sourceName,
    trafficGoodsProductCell: trafficTableStyles.goodsProductCell,
    trafficGoodsProductName: trafficTableStyles.goodsProductName,
    trafficGoodsProductNameSummary: trafficTableStyles.goodsProductNameSummary,
    trafficGoodsProductId: trafficTableStyles.goodsProductId,
    trendUp: trafficTableStyles.metricTrendUp,
    trendDown: trafficTableStyles.metricTrendDown,
    trendNeutral: trafficTableStyles.metricTrendNeutral,
  } satisfies DashboardTrafficTableClassNames;

  return { trafficTableClassNames };
}

export function buildDashboardGoodsCardClassNames({
  goodsCardTableStyles,
}: {
  goodsCardTableStyles: DashboardStyleModule;
}) {
  const goodsCardTableClassNames = {
    goodsDataShellHeaderCell: goodsCardTableStyles.goodsDataShellHeaderCell,
    goodsDataShellBodyCell: goodsCardTableStyles.goodsDataShellBodyCell,
    goodsCardHeaderCell: goodsCardTableStyles.goodsCardHeaderCell,
    goodsCardIdentityHeaderCell: goodsCardTableStyles.goodsCardIdentityHeaderCell,
    goodsCardActionHeaderCell: goodsCardTableStyles.goodsCardActionHeaderCell,
    goodsCardBodyCell: goodsCardTableStyles.goodsCardBodyCell,
    goodsCardProductCell: goodsCardTableStyles.productCell,
    goodsCardProductName: goodsCardTableStyles.productName,
    goodsCardTrafficButton: goodsCardTableStyles.trafficButton,
  } satisfies DashboardGoodsCardTableClassNames;

  return { goodsCardTableClassNames };
}

export function buildDashboardMediaClassNames({
  liveChartStyles,
  detailTableStyles,
}: {
  liveChartStyles: DashboardStyleModule;
  detailTableStyles: DashboardStyleModule;
}) {
  const liveChartClassNames = {
    liveTrendTooltipMetricRow: liveChartStyles.tooltipMetricRow,
    liveTrendTooltipMetricLabel: liveChartStyles.tooltipMetricLabel,
    liveTrendTooltipMetricValue: liveChartStyles.tooltipMetricValue,
    liveTrendTooltipCard: liveChartStyles.tooltipCard,
    liveTrendTooltipDate: liveChartStyles.tooltipDate,
    liveTrendTooltipHint: liveChartStyles.tooltipHint,
    liveTrendTooltipMetrics: liveChartStyles.tooltipMetrics,
  } satisfies DashboardLiveChartClassNames;

  const liveDetailTableClassNames = {
    liveDetailHeaderCell: detailTableStyles.liveDetailHeaderCell,
    liveDetailBodyCell: detailTableStyles.liveDetailBodyCell,
    liveDetailFixedRightCell: detailTableStyles.liveDetailFixedRightCell,
    liveDetailAnchorCell: detailTableStyles.liveDetailAnchorCell,
    liveDetailAnchorId: detailTableStyles.liveDetailAnchorId,
    liveDetailAnchorName: detailTableStyles.liveDetailAnchorName,
    liveDetailTypeTag: detailTableStyles.liveDetailTypeTag,
    liveDetailInspectButton: detailTableStyles.liveDetailInspectButton,
  } satisfies DashboardLiveDetailTableClassNames;

  const shortVideoDetailTableClassNames = {
    shortVideoHeaderCell: detailTableStyles.shortVideoHeaderCell,
    shortVideoBodyCell: detailTableStyles.shortVideoBodyCell,
    shortVideoTextHeaderCell: detailTableStyles.shortVideoTextHeaderCell,
    shortVideoTextBodyCell: detailTableStyles.shortVideoTextBodyCell,
  } satisfies DashboardShortVideoDetailTableClassNames;

  return {
    liveChartClassNames,
    liveDetailTableClassNames,
    shortVideoDetailTableClassNames,
  };
}

export function buildDashboardBusinessClassNames({
  overviewDetailTableStyles,
}: {
  overviewDetailTableStyles: DashboardStyleModule;
}) {
  const overviewDetailTableClassNames = {
    pendingMetricCell: overviewDetailTableStyles.pendingMetricCell,
    pendingMetricHeader: overviewDetailTableStyles.pendingMetricHeader,
  } satisfies DashboardOverviewDetailTableClassNames;

  return { overviewDetailTableClassNames };
}

export function buildDashboardViewClassNames(
  modules: {
    liveChartStyles: DashboardStyleModule;
    goodsScoreTooltipStyles: DashboardStyleModule;
    goodsTableStyles: DashboardStyleModule;
    goodsCardTableStyles: DashboardStyleModule;
    trafficTableStyles: DashboardStyleModule;
    detailTableStyles: DashboardStyleModule;
    overviewDetailTableStyles: DashboardStyleModule;
  }
) {
  const {
    liveChartStyles,
    goodsScoreTooltipStyles,
    goodsTableStyles,
    goodsCardTableStyles,
    trafficTableStyles,
    detailTableStyles,
    overviewDetailTableStyles,
  } = modules;

  return {
    ...buildDashboardGoodsClassNames({ goodsScoreTooltipStyles, goodsTableStyles }),
    ...buildDashboardTrafficClassNames({ trafficTableStyles }),
    ...buildDashboardGoodsCardClassNames({ goodsCardTableStyles }),
    ...buildDashboardMediaClassNames({ liveChartStyles, detailTableStyles }),
    ...buildDashboardBusinessClassNames({ overviewDetailTableStyles }),
  };
}
