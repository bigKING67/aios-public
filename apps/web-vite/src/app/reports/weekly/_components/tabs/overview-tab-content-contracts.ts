import type { WeeklySummaryCardProps } from '@/components/organisms/weekly-summary-card';
import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type {
  OverviewByWeekTrendSectionProps,
} from './overview-by-week-trend-section-contracts';
import type { OverviewKpiSectionProps } from './overview-kpi-section-contracts';
import type {
  OverviewPlatformBreakdownSectionPropsBundle,
} from './overview-platform-breakdown-section-contracts';
import type {
  OverviewTrendSectionPropsBundle,
} from './overview-trend-section-contracts';

export type OverviewTrendClassNameResolver =
  OverviewKpiSectionProps['kpiCardPropsList'][number]['resolveTrendClassName'];

export interface BuildOverviewTabContentPropsParams {
  report: WeeklyReportResponse;
  resolveTrendClassName: OverviewTrendClassNameResolver;
}

export interface OverviewTabContentPropsBundle {
  summaryCardProps: WeeklySummaryCardProps;
  kpiSectionProps: OverviewKpiSectionProps;
  trendSectionProps: OverviewTrendSectionPropsBundle;
  byWeekTrendSectionProps: OverviewByWeekTrendSectionProps;
  platformBreakdownSectionProps: OverviewPlatformBreakdownSectionPropsBundle;
}
