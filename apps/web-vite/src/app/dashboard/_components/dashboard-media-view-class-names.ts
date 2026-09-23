import {
  buildDashboardMediaClassNames,
} from './dashboard-class-names';
import {
  getTrendClassNameByRate as resolveTrendClassNameByRate,
} from './dashboard-goods-score-model';
import liveDetailTableCellStyles from './dashboard-live-detail-table-cells.module.css';
import liveDetailTableStyles from './dashboard-live-detail-table.module.css';
import liveTrendStyles from './dashboard-live-trend.module.css';
import shortVideoDetailTableStyles from './dashboard-short-video-detail-table.module.css';
import trendStyles from './dashboard-trend-status.module.css';

const mediaTrendClassNames = {
  trendUp: trendStyles.trendUp,
  trendDown: trendStyles.trendDown,
  trendNeutral: trendStyles.trendNeutral,
};

export const DASHBOARD_MEDIA_VIEW_CLASS_NAMES = {
  ...buildDashboardMediaClassNames({
    liveChartStyles: liveTrendStyles,
    detailTableStyles: {
      ...liveDetailTableStyles,
      ...liveDetailTableCellStyles,
      ...shortVideoDetailTableStyles,
    },
  }),
  getTrendClassNameByRate: (value: number | null | undefined) =>
    resolveTrendClassNameByRate(value, mediaTrendClassNames),
};
