import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type { WeeklyKpiCardProps } from './weekly-primitives';

export type TrendClassNameResolver = WeeklyKpiCardProps['resolveTrendClassName'];

export interface BuildOverviewKpiCardPropsListParams {
  kpis: WeeklyReportResponse['kpis'];
  resolveTrendClassName: TrendClassNameResolver;
}

export type OverviewKpiCardProps = Pick<
  WeeklyKpiCardProps,
  'label' | 'resolveTrendClassName' | 'trends' | 'value'
> & {
  key: string;
};

export interface OverviewKpiSectionProps {
  kpiCardPropsList: OverviewKpiCardProps[];
}
