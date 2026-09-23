import { buildDouyinChannelContribution } from './platform-tab-waterfall-helpers';
import type {
  DouyinChannelBreakdownItem,
  DouyinChannelColors,
  DouyinChannelSectionData,
} from './platform-tab-douyin-section-types';
import { toSafeNumber } from './platform-tab-formatters';

interface BuildDouyinChannelSectionDataParams {
  liveGmv: number | undefined;
  prevLiveGmv: number | undefined;
  shortvideoGmv: number | undefined;
  prevShortvideoGmv: number | undefined;
  cardGmv: number | undefined;
  prevCardGmv: number | undefined;
  channelColors: DouyinChannelColors;
}

export function buildDouyinChannelSectionData({
  liveGmv,
  prevLiveGmv,
  shortvideoGmv,
  prevShortvideoGmv,
  cardGmv,
  prevCardGmv,
  channelColors,
}: BuildDouyinChannelSectionDataParams): DouyinChannelSectionData {
  const douyinChannelBreakdown: DouyinChannelBreakdownItem[] = [
    {
      key: 'video',
      label: '短视频',
      current: toSafeNumber(shortvideoGmv),
      prev: toSafeNumber(prevShortvideoGmv),
      color: channelColors.video,
    },
    {
      key: 'live',
      label: '直播',
      current: toSafeNumber(liveGmv),
      prev: toSafeNumber(prevLiveGmv),
      color: channelColors.live,
    },
    {
      key: 'product-card',
      label: '商品卡',
      current: toSafeNumber(cardGmv),
      prev: toSafeNumber(prevCardGmv),
      color: channelColors.productCard,
    },
  ];
  const douyinChannelContribution = buildDouyinChannelContribution(douyinChannelBreakdown);
  const douyinContributionChannels = douyinChannelBreakdown
    .filter((item) => Math.abs(item.current - item.prev) > Number.EPSILON)
    .map((item) => item.key);

  return {
    douyinChannelBreakdown,
    hasDouyinChannelData: douyinChannelContribution.hasChannelData,
    douyinChannelDonutData: douyinChannelContribution.donutData,
    douyinChannelTotalCurrent: douyinChannelContribution.totalCurrent,
    douyinChannelTotalPrev: douyinChannelContribution.totalPrev,
    douyinChannelDelta: douyinChannelContribution.totalDelta,
    douyinChannelWaterfallSteps: douyinChannelContribution.waterfallSteps,
    hasDouyinChannelContributionData: douyinChannelContribution.waterfallSteps.length > 0,
    showDouyinLiveSection: douyinContributionChannels.includes('live'),
    showDouyinShortvideoSection: douyinContributionChannels.includes('video'),
    showDouyinCardSection: douyinContributionChannels.includes('product-card'),
  };
}
