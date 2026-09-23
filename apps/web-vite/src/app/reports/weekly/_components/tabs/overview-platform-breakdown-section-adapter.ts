import {
  buildOverviewPlatformBreakdownViewModel,
  OVERVIEW_PLATFORM_TOTAL_BAR_COLOR,
} from './overview-platform-breakdown-data';
import type {
  BuildOverviewPlatformBreakdownSectionPropsParams,
  OverviewPlatformBreakdownSectionPropsBundle,
} from './overview-platform-breakdown-section-contracts';

export function buildOverviewPlatformBreakdownSectionProps({
  charts,
}: BuildOverviewPlatformBreakdownSectionPropsParams): OverviewPlatformBreakdownSectionPropsBundle {
  const platformViewModel = buildOverviewPlatformBreakdownViewModel(charts);

  return {
    donutChartProps: {
      title: '平台贡献分布（外圈本周 / 内圈上周）',
      data: platformViewModel.donutData,
      totalLabel: '本周同期GMV',
      height: 360,
    },
    waterfallChartProps: {
      title: '平台增量瀑布（对比上周同期）',
      startLabel: '上周同期',
      endLabel: '本周同期',
      startValue: platformViewModel.totalPrevPlatformGmv,
      endValue: platformViewModel.totalPlatformGmv,
      steps: platformViewModel.waterfallSteps,
      totalColor: OVERVIEW_PLATFORM_TOTAL_BAR_COLOR,
      showBoundaryTotals: false,
      height: 360,
    },
    summaryText: platformViewModel.summaryText,
  };
}
