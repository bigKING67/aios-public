import type {
  BuildDouyinShortvideoAttributionSectionPropsParams,
  DouyinShortvideoAttributionSectionPropsBundle,
} from './platform-tab-douyin-shortvideo-section-contracts';
import {
  buildDouyinShortvideoAttributionSubsectionList,
} from './platform-tab-douyin-shortvideo-sections-routing';
import {
  buildDouyinShortvideoAnalysisLeafProps,
  buildDouyinShortvideoOverviewLeafProps,
} from './platform-tab-douyin-shortvideo-leaf-adapter';

export function buildDouyinShortvideoAttributionSectionProps({
  isMobile,
  data,
  douyinShortvideoColumns,
  waterfallTotalColor,
}: BuildDouyinShortvideoAttributionSectionPropsParams): DouyinShortvideoAttributionSectionPropsBundle {
  return {
    subsectionList: buildDouyinShortvideoAttributionSubsectionList(),
    overviewSectionProps: {
      ...buildDouyinShortvideoOverviewLeafProps({
        isMobile,
        data,
        douyinShortvideoColumns,
        waterfallTotalColor,
      }),
    },
    analysisSectionProps: {
      ...buildDouyinShortvideoAnalysisLeafProps({
        isMobile,
        data,
        douyinShortvideoColumns,
      }),
    },
  };
}
