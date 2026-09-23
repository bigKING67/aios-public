import { DASHBOARD_BUSINESS_VIEW_CLASS_NAMES } from './dashboard-business-view-class-names';
import { useDashboardBusinessContent } from './dashboard-business-content';
import type { DashboardBusinessContentArgs } from './dashboard-business-content-types';

export type DashboardBusinessContentLazyProps = Omit<
  DashboardBusinessContentArgs,
  'overviewDetailTableClassNames'
>;

export default function DashboardBusinessContentLazy(props: DashboardBusinessContentLazyProps) {
  const { businessContent } = useDashboardBusinessContent({
    ...props,
    overviewDetailTableClassNames: DASHBOARD_BUSINESS_VIEW_CLASS_NAMES.overviewDetailTableClassNames,
  });

  return <>{businessContent}</>;
}
