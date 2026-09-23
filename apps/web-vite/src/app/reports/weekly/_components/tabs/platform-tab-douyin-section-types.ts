import type {
  DouyinChannelSectionData,
} from './platform-tab-douyin-common-section-types';
import type { DouyinCardSectionData } from './platform-tab-douyin-card-section-types';
import type { DouyinLiveSectionData } from './platform-tab-douyin-live-section-types';
import type { DouyinShortvideoSectionData } from './platform-tab-douyin-shortvideo-section-types';

export type {
  BuildDouyinSectionDataParams,
  DouyinChannelBreakdownItem,
  DouyinChannelColors,
  DouyinChannelKey,
  DouyinChannelSectionData,
  DouyinSectionDataBaseParams,
  ResolveDouyinSectionDataParams,
} from './platform-tab-douyin-common-section-types';
export type { DouyinCardSectionData } from './platform-tab-douyin-card-section-types';
export type { DouyinLiveSectionData } from './platform-tab-douyin-live-section-types';
export type { DouyinShortvideoSectionData } from './platform-tab-douyin-shortvideo-section-types';

export interface DouyinSectionData
  extends Omit<DouyinChannelSectionData, 'douyinChannelBreakdown'>,
    DouyinLiveSectionData,
    DouyinShortvideoSectionData,
    DouyinCardSectionData {
  douyinChannelAsOfDate: string | undefined;
}
