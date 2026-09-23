import type { DonutChartProps } from '@/components/organisms/donut-chart';
import type { WaterfallChartProps } from '@/components/organisms/waterfall-chart';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';

export interface DouyinChannelAttributionLeafPropsBundle {
  donutChartProps: DonutChartProps | null;
  waterfallChartProps: WaterfallChartProps | null;
  summaryText: string;
}

export interface DouyinChannelAttributionSectionProps
  extends DouyinChannelAttributionLeafPropsBundle {}

export interface BuildDouyinChannelAttributionLeafPropsInput {
  data: Pick<
    DouyinSectionData,
    | 'douyinChannelAsOfDate'
    | 'hasDouyinChannelData'
    | 'douyinChannelDonutData'
    | 'douyinChannelTotalCurrent'
    | 'douyinChannelTotalPrev'
    | 'douyinChannelDelta'
    | 'douyinChannelWaterfallSteps'
    | 'hasDouyinChannelContributionData'
  >;
  waterfallTotalColor: string;
}
