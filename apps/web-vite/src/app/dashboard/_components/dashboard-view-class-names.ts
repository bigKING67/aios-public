import { buildDashboardViewClassNames } from './dashboard-class-names';
import liveDetailTableCellStyles from './dashboard-live-detail-table-cells.module.css';
import liveDetailTableStyles from './dashboard-live-detail-table.module.css';
import goodsCardDataTableStyles from './dashboard-goods-data-table-card.module.css';
import goodsCardTableStyles from './dashboard-goods-card-table.module.css';
import goodsDataTableMetricStyles from './dashboard-goods-data-table-metrics.module.css';
import goodsDataTableShellStyles from './dashboard-goods-data-table-shell.module.css';
import goodsScoreTooltipConfidenceStyles from './dashboard-goods-score-tooltip-confidence.module.css';
import goodsScoreTooltipDetailStyles from './dashboard-goods-score-tooltip-detail.module.css';
import goodsScoreTooltipMetaStyles from './dashboard-goods-score-tooltip-meta.module.css';
import goodsScoreTooltipQuadrantStyles from './dashboard-goods-score-tooltip-quadrant.module.css';
import goodsScoreTooltipScoreStyles from './dashboard-goods-score-tooltip-score.module.css';
import goodsScoreTooltipStyles from './dashboard-goods-score-tooltip.module.css';
import goodsTableIdentityStyles from './dashboard-goods-table-identity.module.css';
import goodsTableMetricStyles from './dashboard-goods-table-metrics.module.css';
import goodsTableStyles from './dashboard-goods-table.module.css';
import liveTrendStyles from './dashboard-live-trend.module.css';
import overviewDetailTableStyles from './dashboard-overview-detail-table.module.css';
import shortVideoDetailTableStyles from './dashboard-short-video-detail-table.module.css';
import trafficTableCellStyles from './dashboard-traffic-table-cells.module.css';
import trafficTableStyles from './dashboard-traffic-table.module.css';

export const DASHBOARD_VIEW_CLASS_NAMES = buildDashboardViewClassNames({
  liveChartStyles: liveTrendStyles,
  goodsScoreTooltipStyles: {
    ...goodsScoreTooltipStyles,
    ...goodsScoreTooltipScoreStyles,
    ...goodsScoreTooltipMetaStyles,
    ...goodsScoreTooltipConfidenceStyles,
    ...goodsScoreTooltipQuadrantStyles,
    ...goodsScoreTooltipDetailStyles,
  },
  goodsTableStyles: {
    ...goodsTableStyles,
    ...goodsTableIdentityStyles,
    ...goodsTableMetricStyles,
    ...goodsDataTableMetricStyles,
    ...goodsDataTableShellStyles,
  },
  goodsCardTableStyles: { ...goodsCardTableStyles, ...goodsCardDataTableStyles, ...goodsDataTableShellStyles },
  trafficTableStyles: { ...trafficTableStyles, ...trafficTableCellStyles },
  detailTableStyles: {
    ...liveDetailTableStyles,
    ...liveDetailTableCellStyles,
    ...shortVideoDetailTableStyles,
  },
  overviewDetailTableStyles,
});

export const {
  goodsScoreClassNames: GOODS_SCORE_CLASS_NAMES,
  goodsMatrixClassNames: GOODS_MATRIX_CLASS_NAMES,
  goodsScoreChartClassNames: GOODS_SCORE_CHART_CLASS_NAMES,
  trafficTableClassNames: TRAFFIC_TABLE_CLASS_NAMES,
  goodsCardTableClassNames: GOODS_CARD_TABLE_CLASS_NAMES,
  liveChartClassNames: LIVE_CHART_CLASS_NAMES,
  liveDetailTableClassNames: LIVE_DETAIL_TABLE_CLASS_NAMES,
  shortVideoDetailTableClassNames: SHORT_VIDEO_DETAIL_TABLE_CLASS_NAMES,
  overviewDetailTableClassNames: OVERVIEW_DETAIL_TABLE_CLASS_NAMES,
  getTrendClassNameByRate,
} = DASHBOARD_VIEW_CLASS_NAMES;
