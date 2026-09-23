import { buildOverviewKpiCardPropsList } from './overview-kpi-section-adapter';
import { buildOverviewPlatformBreakdownSectionProps } from './overview-platform-breakdown-section-adapter';
import { resolveSummaryWeekPeriod } from './overview-period-utils';
import type {
  BuildOverviewTabContentPropsParams,
  OverviewTabContentPropsBundle,
} from './overview-tab-content-contracts';
import { buildOverviewTrendSectionProps } from './overview-trend-section-adapter';

export function buildOverviewTabContentProps({
  report,
  resolveTrendClassName,
}: BuildOverviewTabContentPropsParams): OverviewTabContentPropsBundle {
  const summaryWeekPeriod = resolveSummaryWeekPeriod(report);

  return {
    summaryCardProps: {
      reportId: report.meta?.report_id || 'latest',
      weekPeriod: summaryWeekPeriod,
      summaryScope: 'overview',
    },
    kpiSectionProps: {
      kpiCardPropsList: buildOverviewKpiCardPropsList({
        kpis: report.kpis,
        resolveTrendClassName,
      }),
    },
    trendSectionProps: buildOverviewTrendSectionProps(report),
    byWeekTrendSectionProps: {
      summaryWeekPeriod,
    },
    platformBreakdownSectionProps: buildOverviewPlatformBreakdownSectionProps({
      charts: report.charts,
    }),
  };
}
