import {
  buildDouyinAttributionSectionProps,
} from './platform-tab-douyin-attribution-section-adapter';
import type {
  DouyinAttributionSectionPropsBundle,
} from './platform-tab-douyin-attribution-section-contracts';
import type {
  BuildDouyinAttributionSectionsPropsParams,
} from './platform-tab-douyin-section-contracts';
import {
  WATERFALL_TOTAL_COLOR,
  getFunnelStageColor,
} from './platform-tab-chart-visuals';

export function buildDouyinAttributionSectionsProps({
  isMobile,
  columns,
  viewModel,
}: BuildDouyinAttributionSectionsPropsParams): DouyinAttributionSectionPropsBundle {
  return buildDouyinAttributionSectionProps({
    isMobile,
    data: viewModel.douyinSectionData,
    douyinLiveColumns: columns.douyinLiveColumns,
    douyinLiveDetailColumns: columns.douyinLiveDetailColumns,
    douyinShortvideoColumns: columns.douyinShortvideoColumns,
    douyinCardProductColumns: columns.douyinCardProductColumns,
    douyinCardSourceColumns: columns.douyinCardSourceColumns,
    quantColumns: columns.quantColumns,
    resolveFunnelStageColor: getFunnelStageColor,
    waterfallTotalColor: WATERFALL_TOTAL_COLOR,
  });
}
