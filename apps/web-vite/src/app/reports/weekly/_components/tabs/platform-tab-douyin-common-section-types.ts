import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type { DouyinChannelDonutItem } from './platform-tab-waterfall-helpers';
import type { PlatformTabProps } from './platform-tab-types';

export interface DouyinChannelColors {
  video: string;
  live: string;
  productCard: string;
}

export type DouyinChannelKey = 'video' | 'live' | 'product-card';

export interface DouyinChannelBreakdownItem {
  key: DouyinChannelKey;
  label: string;
  current: number;
  prev: number;
  color: string;
}

export interface DouyinSectionDataBaseParams {
  report: PlatformTabProps['report'];
  platformAliases: string[];
  liveGmv: number | undefined;
  prevLiveGmv: number | undefined;
  shortvideoGmv: number | undefined;
  prevShortvideoGmv: number | undefined;
  cardGmv: number | undefined;
  prevCardGmv: number | undefined;
  channelColors: DouyinChannelColors;
  resolveCategoryWaterfallColor: (index: number) => string;
}

export interface BuildDouyinSectionDataParams extends DouyinSectionDataBaseParams {
  douyinChannelAsOfDate: string | undefined;
}

export interface ResolveDouyinSectionDataParams extends DouyinSectionDataBaseParams {
  channelAttributionAsOfDate: string | undefined;
  attributionAsOfDate: string | undefined;
}

export interface DouyinChannelSectionData {
  douyinChannelBreakdown: DouyinChannelBreakdownItem[];
  hasDouyinChannelData: boolean;
  douyinChannelDonutData: DouyinChannelDonutItem[];
  douyinChannelTotalCurrent: number;
  douyinChannelTotalPrev: number;
  douyinChannelDelta: number;
  douyinChannelWaterfallSteps: WaterfallStepItem[];
  hasDouyinChannelContributionData: boolean;
  showDouyinLiveSection: boolean;
  showDouyinShortvideoSection: boolean;
  showDouyinCardSection: boolean;
}
