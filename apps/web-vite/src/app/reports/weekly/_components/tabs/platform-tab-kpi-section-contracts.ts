import type { WeeklyKpiCardProps } from './weekly-primitives';
import type { PlatformMetricCard } from './platform-tab-metrics';

export interface BuildPlatformKpiCardPropsListParams {
  metrics: PlatformMetricCard[];
  resolveTrendClassName: WeeklyKpiCardProps['resolveTrendClassName'];
}

export type PlatformKpiCardProps = Pick<
  WeeklyKpiCardProps,
  'label' | 'resolveTrendClassName' | 'trends' | 'value' | 'variant'
> & {
  key: string;
};

export interface PlatformKpiSectionProps {
  platformLabel: string;
  kpiCardPropsList: PlatformKpiCardProps[];
}
