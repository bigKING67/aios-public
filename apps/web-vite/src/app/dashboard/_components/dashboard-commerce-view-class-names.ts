import {
  buildDashboardGoodsCardClassNames,
  buildDashboardGoodsClassNames,
  buildDashboardTrafficClassNames,
} from './dashboard-class-names';
import goodsCardDataTableStyles from './dashboard-goods-data-table-card.module.css';
import goodsDataTableMetricStyles from './dashboard-goods-data-table-metrics.module.css';
import goodsDataTableShellStyles from './dashboard-goods-data-table-shell.module.css';
import goodsCardTableStyles from './dashboard-goods-card-table.module.css';
import goodsScoreTooltipConfidenceStyles from './dashboard-goods-score-tooltip-confidence.module.css';
import goodsScoreTooltipDetailStyles from './dashboard-goods-score-tooltip-detail.module.css';
import goodsScoreTooltipMetaStyles from './dashboard-goods-score-tooltip-meta.module.css';
import goodsScoreTooltipQuadrantStyles from './dashboard-goods-score-tooltip-quadrant.module.css';
import goodsScoreTooltipScoreStyles from './dashboard-goods-score-tooltip-score.module.css';
import goodsScoreTooltipStyles from './dashboard-goods-score-tooltip.module.css';
import goodsTableIdentityStyles from './dashboard-goods-table-identity.module.css';
import goodsTableMetricStyles from './dashboard-goods-table-metrics.module.css';
import goodsTableStyles from './dashboard-goods-table.module.css';
import trafficTableCellStyles from './dashboard-traffic-table-cells.module.css';
import trafficTableStyles from './dashboard-traffic-table.module.css';

const dashboardGoodsClassNames = buildDashboardGoodsClassNames({
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
});

export const DASHBOARD_COMMERCE_VIEW_CLASS_NAMES = {
  ...dashboardGoodsClassNames,
  ...buildDashboardTrafficClassNames({
    trafficTableStyles: { ...trafficTableStyles, ...trafficTableCellStyles },
  }),
  ...buildDashboardGoodsCardClassNames({
    goodsCardTableStyles: {
      ...goodsCardTableStyles,
      ...goodsCardDataTableStyles,
      ...goodsDataTableShellStyles,
    },
  }),
};
