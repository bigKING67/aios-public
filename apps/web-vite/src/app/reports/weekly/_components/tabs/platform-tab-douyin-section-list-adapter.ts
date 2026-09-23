import {
  buildDouyinCardAttributionSectionProps,
} from './platform-tab-douyin-card-section-adapter';
import type {
  BuildDouyinAttributionSectionListPropsParams,
  DouyinAttributionSectionListPropsBundle,
} from './platform-tab-douyin-section-list-contracts';
import {
  buildDouyinLiveAttributionSectionProps,
} from './platform-tab-douyin-live-section-adapter';
import {
  buildDouyinAttributionSectionList,
} from './platform-tab-douyin-section-list-routing';
import {
  buildDouyinShortvideoAttributionSectionProps,
} from './platform-tab-douyin-shortvideo-section-adapter';

export function buildDouyinAttributionSectionListProps({
  isMobile,
  data,
  douyinLiveColumns,
  douyinLiveDetailColumns,
  douyinShortvideoColumns,
  douyinCardProductColumns,
  douyinCardSourceColumns,
  quantColumns,
  resolveFunnelStageColor,
  waterfallTotalColor,
}: BuildDouyinAttributionSectionListPropsParams): DouyinAttributionSectionListPropsBundle {
  return {
    sectionList: buildDouyinAttributionSectionList(data),
    liveSectionProps: buildDouyinLiveAttributionSectionProps({
      isMobile,
      data,
      douyinLiveColumns,
      douyinLiveDetailColumns,
      quantColumns,
      resolveFunnelStageColor,
      waterfallTotalColor,
    }),
    shortvideoSectionProps: buildDouyinShortvideoAttributionSectionProps({
      isMobile,
      data,
      douyinShortvideoColumns,
      waterfallTotalColor,
    }),
    cardSectionProps: buildDouyinCardAttributionSectionProps({
      isMobile,
      data,
      douyinCardProductColumns,
      douyinCardSourceColumns,
      douyinLiveDetailColumns,
      quantColumns,
      resolveFunnelStageColor,
      waterfallTotalColor,
    }),
  };
}
