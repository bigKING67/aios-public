import {
  buildDouyinCardProductAttributionLeafProps,
  buildDouyinCardSourceAttributionLeafProps,
  buildDouyinCardSourceFunnelLeafProps,
} from './platform-tab-douyin-card-leaf-adapter';
import type {
  BuildDouyinCardAttributionSectionPropsParams,
  DouyinCardAttributionSectionPropsBundle,
} from './platform-tab-douyin-card-section-contracts';
import {
  buildDouyinCardAttributionSubsectionList,
} from './platform-tab-douyin-card-sections-routing';

export function buildDouyinCardAttributionSectionProps({
  isMobile,
  data,
  douyinCardProductColumns,
  douyinCardSourceColumns,
  douyinLiveDetailColumns,
  quantColumns,
  resolveFunnelStageColor,
  waterfallTotalColor,
}: BuildDouyinCardAttributionSectionPropsParams): DouyinCardAttributionSectionPropsBundle {
  return {
    subsectionList: buildDouyinCardAttributionSubsectionList(),
    productSectionProps: buildDouyinCardProductAttributionLeafProps({
      isMobile,
      data,
      douyinCardProductColumns,
      waterfallTotalColor,
    }),
    sourceSectionProps: buildDouyinCardSourceAttributionLeafProps({
      isMobile,
      data,
      douyinCardSourceColumns,
      waterfallTotalColor,
    }),
    funnelSectionProps: buildDouyinCardSourceFunnelLeafProps({
      isMobile,
      data,
      douyinLiveDetailColumns,
      quantColumns,
      resolveFunnelStageColor,
    }),
  };
}
