import { buildDouyinCardSectionData } from './platform-tab-douyin-card-section-data';
import { buildDouyinChannelSectionData } from './platform-tab-douyin-channel-section-data';
import { buildDouyinLiveSectionData } from './platform-tab-douyin-live-section-data';
import { buildDouyinShortvideoSectionData } from './platform-tab-douyin-shortvideo-section-data';
import type {
  BuildDouyinSectionDataParams,
  DouyinSectionData,
} from './platform-tab-douyin-section-types';

export function buildDouyinSectionData({
  report,
  platformAliases,
  douyinChannelAsOfDate,
  liveGmv,
  prevLiveGmv,
  shortvideoGmv,
  prevShortvideoGmv,
  cardGmv,
  prevCardGmv,
  channelColors,
  resolveCategoryWaterfallColor,
}: BuildDouyinSectionDataParams): DouyinSectionData {
  const channelSectionData = buildDouyinChannelSectionData({
    liveGmv,
    prevLiveGmv,
    shortvideoGmv,
    prevShortvideoGmv,
    cardGmv,
    prevCardGmv,
    channelColors,
  });
  const douyinLiveSectionData = buildDouyinLiveSectionData({
    report,
    platformAliases,
    douyinChannelAsOfDate,
    resolveCategoryWaterfallColor,
  });
  const douyinShortvideoSectionData = buildDouyinShortvideoSectionData({
    report,
    platformAliases,
    douyinChannelAsOfDate,
    resolveCategoryWaterfallColor,
  });
  const douyinCardSectionData = buildDouyinCardSectionData({
    report,
    platformAliases,
    douyinChannelAsOfDate,
    resolveCategoryWaterfallColor,
  });

  return {
    douyinChannelAsOfDate,
    ...channelSectionData,
    ...douyinLiveSectionData,
    ...douyinShortvideoSectionData,
    ...douyinCardSectionData,
  };
}
