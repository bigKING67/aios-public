import type {
  OverviewByWeekTrendSectionProps,
  OverviewByWeekTrendSectionPropsBundle,
} from './overview-by-week-trend-section-contracts';
import { buildOverviewByWeekTrendSectionProps } from './overview-by-week-trend-section-adapter';
import { useOverviewByWeekTrendData } from './use-overview-by-week-trend-data';

export function useOverviewByWeekTrendSectionProps({
  summaryWeekPeriod,
}: OverviewByWeekTrendSectionProps): OverviewByWeekTrendSectionPropsBundle {
  const byWeekTrendData = useOverviewByWeekTrendData({
    summaryWeekPeriod,
  });

  return buildOverviewByWeekTrendSectionProps(byWeekTrendData);
}
