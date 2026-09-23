import {
  buildDashboardBusinessClassNames,
} from './dashboard-class-names';
import overviewDetailTableStyles from './dashboard-overview-detail-table.module.css';

export const DASHBOARD_BUSINESS_VIEW_CLASS_NAMES = buildDashboardBusinessClassNames({
  overviewDetailTableStyles,
});
