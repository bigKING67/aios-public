import { buildOverviewKpiCardViewModels } from './overview-kpi-data';
import type {
  BuildOverviewKpiCardPropsListParams,
  OverviewKpiCardProps,
} from './overview-kpi-section-contracts';

export function buildOverviewKpiCardPropsList({
  kpis,
  resolveTrendClassName,
}: BuildOverviewKpiCardPropsListParams): OverviewKpiCardProps[] {
  return buildOverviewKpiCardViewModels(kpis).map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.value,
    resolveTrendClassName,
    trends: kpi.trends,
  }));
}
