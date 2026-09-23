import { formatPeriodDeltaSummary } from './platform-tab-period-delta-summary';
import type {
  BuildPlatformTrendSectionPropsParams,
  PlatformTrendSectionViewModel,
  PlatformTrendSectionPropsBundle,
} from './platform-tab-trend-section-contracts';

export const PLATFORM_TREND_CHART_COLORS = [
  'var(--chart-series-3)',
  'var(--chart-color-prev-week)',
  'var(--chart-series-4)',
] as const;

function buildPlatformTrendLineChartProps({
  chartData,
  hasChartData,
}: Pick<PlatformTrendSectionViewModel, 'chartData' | 'hasChartData'>): PlatformTrendSectionPropsBundle['lineChartProps'] {
  if (!hasChartData) {
    return null;
  }

  return {
    data: chartData,
    height: 320,
    colors: [...PLATFORM_TREND_CHART_COLORS],
    showDataLabel: false,
  };
}

export function buildPlatformTrendSectionProps({
  platformLabel,
  viewModel,
}: BuildPlatformTrendSectionPropsParams): PlatformTrendSectionPropsBundle {
  const { chartData, hasChartData, baseMetrics } = viewModel;

  return {
    platformLabel,
    lineChartProps: buildPlatformTrendLineChartProps({
      chartData,
      hasChartData,
    }),
    summaryText: formatPeriodDeltaSummary({
      previousValue: baseMetrics.prevGmv,
      currentValue: baseMetrics.gmv,
      deltaValue: baseMetrics.gmvDelta,
      currentLabel: '本周 GMV',
      deltaLabel: '增量',
    }),
  };
}
