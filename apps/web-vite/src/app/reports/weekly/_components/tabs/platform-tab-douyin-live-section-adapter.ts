import {
  buildDouyinLiveFunnelAttributionLeafProps,
  buildDouyinLiveSessionAttributionLeafProps,
} from './platform-tab-douyin-live-leaf-adapter';
import type {
  BuildDouyinLiveAttributionSectionPropsParams,
  DouyinLiveAttributionSectionPropsBundle,
} from './platform-tab-douyin-live-section-contracts';
import {
  buildDouyinLiveAttributionSubsectionList,
} from './platform-tab-douyin-live-sections-routing';

export function buildDouyinLiveAttributionSectionProps({
  isMobile,
  data,
  douyinLiveColumns,
  douyinLiveDetailColumns,
  quantColumns,
  resolveFunnelStageColor,
  waterfallTotalColor,
}: BuildDouyinLiveAttributionSectionPropsParams): DouyinLiveAttributionSectionPropsBundle {
  return {
    subsectionList: buildDouyinLiveAttributionSubsectionList(),
    sessionSectionProps: {
      ...buildDouyinLiveSessionAttributionLeafProps({
        isMobile,
        data,
        douyinLiveColumns,
        waterfallTotalColor,
      }),
    },
    funnelSectionProps: buildDouyinLiveFunnelAttributionLeafProps({
      isMobile,
      data,
      douyinLiveDetailColumns,
      quantColumns,
      resolveFunnelStageColor,
    }),
  };
}
