import type {
  BuildDouyinChannelAttributionLeafPropsInput,
  DouyinChannelAttributionLeafPropsBundle,
} from './platform-tab-douyin-channel-leaf-contracts';
import { formatDouyinChannelAttributionSummary } from './platform-tab-douyin-channel-summary';

export function buildDouyinChannelAttributionLeafProps({
  data,
  waterfallTotalColor,
}: BuildDouyinChannelAttributionLeafPropsInput): DouyinChannelAttributionLeafPropsBundle {
  const {
    hasDouyinChannelData,
    douyinChannelDonutData,
    douyinChannelTotalCurrent,
    douyinChannelTotalPrev,
    douyinChannelWaterfallSteps,
    hasDouyinChannelContributionData,
  } = data;

  return {
    donutChartProps: hasDouyinChannelData
      ? {
        title: '渠道结构（外层本周 / 内层上周）',
        data: douyinChannelDonutData,
        totalLabel: '渠道GMV',
        height: 360,
      }
      : null,
    waterfallChartProps: hasDouyinChannelContributionData
      ? {
        title: '渠道GMV增量瀑布（对比上周同期）',
        startLabel: '上周同期',
        endLabel: '本周同期',
        startValue: douyinChannelTotalPrev,
        endValue: douyinChannelTotalCurrent,
        steps: douyinChannelWaterfallSteps,
        totalColor: waterfallTotalColor,
        showBoundaryTotals: false,
        height: 360,
        gridBottomPx: 26,
      }
      : null,
    summaryText: formatDouyinChannelAttributionSummary(data),
  };
}
