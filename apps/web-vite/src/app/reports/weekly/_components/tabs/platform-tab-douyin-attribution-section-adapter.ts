import { buildDouyinChannelAttributionLeafProps } from './platform-tab-douyin-channel-leaf-adapter';
import {
  buildDouyinAttributionSectionListProps,
} from './platform-tab-douyin-section-list-adapter';
import {
  resolveDouyinAttributionSectionsLayout,
} from './platform-tab-douyin-sections-layout';
import type {
  BuildDouyinAttributionSectionPropsParams,
  DouyinAttributionSectionPropsBundle,
} from './platform-tab-douyin-attribution-section-contracts';

export function buildDouyinAttributionSectionProps({
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
}: BuildDouyinAttributionSectionPropsParams): DouyinAttributionSectionPropsBundle {
  const { showEmptyAttributionSection } = resolveDouyinAttributionSectionsLayout(data);

  return {
    channelSectionProps: buildDouyinChannelAttributionLeafProps({
      data,
      waterfallTotalColor,
    }),
    sectionListProps: buildDouyinAttributionSectionListProps({
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
    }),
    showEmptyAttributionSection,
  };
}
