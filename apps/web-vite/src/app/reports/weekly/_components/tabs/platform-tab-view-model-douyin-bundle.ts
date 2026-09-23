import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import type { PlatformAttributionSources } from './platform-tab-chart-sources';
import {
  resolveDouyinSectionData,
  type DouyinChannelColors,
  type DouyinSectionData,
} from './platform-tab-douyin-section-data';
import {
  resolveDouyinChannelGmvSummary,
  type DouyinChannelGmvSummary,
} from './platform-tab-douyin-summary';

type PlatformData = WeeklyReportResponse['charts']['platforms'][number];

interface ResolvePlatformTabDouyinBundleParams {
  report: WeeklyReportResponse;
  platformAliases: string[];
  platformData: PlatformData;
  channelColors: DouyinChannelColors;
  resolveCategoryWaterfallColor: (index: number) => string;
  attributionSources: PlatformAttributionSources;
}

export interface PlatformTabDouyinBundle {
  douyinChannelGmvSummary: DouyinChannelGmvSummary;
  douyinSectionData: DouyinSectionData;
}

export function resolvePlatformTabDouyinBundle({
  report,
  platformAliases,
  platformData,
  channelColors,
  resolveCategoryWaterfallColor,
  attributionSources,
}: ResolvePlatformTabDouyinBundleParams): PlatformTabDouyinBundle {
  const {
    douyinLiveAttributionSummaryItem,
    douyinShortvideoAttributionSummaryItem,
    douyinCardAttributionSummaryItem,
    attributionAsOfDate,
    channelAttributionAsOfDate,
  } = attributionSources;

  const douyinChannelGmvSummary = resolveDouyinChannelGmvSummary({
    platformData,
    liveSummary: douyinLiveAttributionSummaryItem,
    shortvideoSummary: douyinShortvideoAttributionSummaryItem,
    cardSummary: douyinCardAttributionSummaryItem,
  });
  const { liveGmv, prevLiveGmv, shortvideoGmv, prevShortvideoGmv, cardGmv, prevCardGmv } =
    douyinChannelGmvSummary;

  const douyinSectionData = resolveDouyinSectionData({
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
  });

  return {
    douyinChannelGmvSummary,
    douyinSectionData,
  };
}
