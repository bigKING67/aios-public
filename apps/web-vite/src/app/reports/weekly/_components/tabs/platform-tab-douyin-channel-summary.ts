import type { DouyinSectionData } from './platform-tab-douyin-section-data';
import { formatAttributionSummary } from './platform-tab-attribution-summary';

type DouyinChannelAttributionSummaryData = Pick<
  DouyinSectionData,
  | 'douyinChannelAsOfDate'
  | 'douyinChannelTotalPrev'
  | 'douyinChannelTotalCurrent'
  | 'douyinChannelDelta'
>;

export function formatDouyinChannelAttributionSummary(
  data: DouyinChannelAttributionSummaryData,
) {
  return formatAttributionSummary({
    asOfDate: data.douyinChannelAsOfDate,
    previousValue: data.douyinChannelTotalPrev,
    currentValue: data.douyinChannelTotalCurrent,
    deltaValue: data.douyinChannelDelta,
  });
}
