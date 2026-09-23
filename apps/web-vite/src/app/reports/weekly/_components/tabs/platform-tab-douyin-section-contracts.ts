import type { DouyinPlatformColumns } from './platform-tab-content-columns';
import type {
  DouyinAttributionSectionPropsBundle,
} from './platform-tab-douyin-attribution-section-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';

export interface DouyinAttributionSectionsViewModel {
  douyinSectionData: DouyinSectionData;
}

export interface BuildDouyinAttributionSectionsPropsParams {
  isMobile: boolean;
  columns: DouyinPlatformColumns;
  viewModel: DouyinAttributionSectionsViewModel;
}

export interface DouyinAttributionSectionsProps
  extends DouyinAttributionSectionPropsBundle {}
