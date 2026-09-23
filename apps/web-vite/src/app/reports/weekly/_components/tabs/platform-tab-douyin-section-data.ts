import { buildDouyinSectionData } from './platform-tab-douyin-section-assembly';
import { resolveDouyinChannelAsOfDate } from './platform-tab-douyin-section-date';
import type {
  DouyinSectionData,
  ResolveDouyinSectionDataParams,
} from './platform-tab-douyin-section-types';

export type {
  BuildDouyinSectionDataParams,
  DouyinChannelColors,
  DouyinSectionData,
  ResolveDouyinSectionDataParams,
} from './platform-tab-douyin-section-types';

export { buildDouyinSectionData } from './platform-tab-douyin-section-assembly';

export function resolveDouyinSectionData({
  report,
  platformAliases,
  channelAttributionAsOfDate,
  attributionAsOfDate,
  liveGmv,
  prevLiveGmv,
  shortvideoGmv,
  prevShortvideoGmv,
  cardGmv,
  prevCardGmv,
  channelColors,
  resolveCategoryWaterfallColor,
}: ResolveDouyinSectionDataParams): DouyinSectionData {
  return buildDouyinSectionData({
    report,
    platformAliases,
    douyinChannelAsOfDate: resolveDouyinChannelAsOfDate({
      report,
      channelAttributionAsOfDate,
      attributionAsOfDate,
    }),
    liveGmv,
    prevLiveGmv,
    shortvideoGmv,
    prevShortvideoGmv,
    cardGmv,
    prevCardGmv,
    channelColors,
    resolveCategoryWaterfallColor,
  });
}
