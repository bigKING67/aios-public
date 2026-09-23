import type {
  BuildOverviewByWeekTrendSectionPropsParams,
  OverviewByWeekTrendSectionPropsBundle,
} from './overview-by-week-trend-section-contracts';

export const OVERVIEW_BY_WEEK_TREND_BAR_COLORS = {
  primary: 'var(--chart-color-this-week)',
  secondary: 'var(--chart-series-2)',
} as const;

export function buildOverviewByWeekTrendSectionProps({
  byWeekBarData,
  byWeekLoading,
}: BuildOverviewByWeekTrendSectionPropsParams): OverviewByWeekTrendSectionPropsBundle {
  if (byWeekBarData.length === 0 && !byWeekLoading) {
    return {
      barChartProps: null,
      emptyStateDescription: '暂无近5周 GMV/GSV 数据',
    };
  }

  return {
    barChartProps: {
      data: byWeekBarData,
      barColor: OVERVIEW_BY_WEEK_TREND_BAR_COLORS.primary,
      secondaryBarColor: OVERVIEW_BY_WEEK_TREND_BAR_COLORS.secondary,
      primarySeriesName: 'GMV',
      secondarySeriesName: 'GSV',
      primaryAxisName: '金额',
      showValueLabel: false,
      height: 320,
      loading: byWeekLoading,
      singleAxis: true,
    },
    emptyStateDescription: null,
  };
}
