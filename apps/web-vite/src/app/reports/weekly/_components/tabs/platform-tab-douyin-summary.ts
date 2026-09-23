import { toOptionalNumber } from './platform-tab-formatters';

type DouyinPlatformMetrics = {
  live_gmv?: unknown;
  prev_live_gmv?: unknown;
  shortvideo_gmv?: unknown;
  prev_shortvideo_gmv?: unknown;
  card_gmv?: unknown;
  prev_card_gmv?: unknown;
};

type DouyinAttributionSummary = {
  total_curr_gmv?: unknown;
  total_prev_gmv?: unknown;
};

type DouyinChannelGmvSummaryParams = {
  platformData: DouyinPlatformMetrics;
  liveSummary?: DouyinAttributionSummary;
  shortvideoSummary?: DouyinAttributionSummary;
  cardSummary?: DouyinAttributionSummary;
};

export interface DouyinChannelGmvSummary {
  liveGmv: number | undefined;
  prevLiveGmv: number | undefined;
  shortvideoGmv: number | undefined;
  prevShortvideoGmv: number | undefined;
  cardGmv: number | undefined;
  prevCardGmv: number | undefined;
}

export function resolveDouyinChannelGmvSummary({
  platformData,
  liveSummary,
  shortvideoSummary,
  cardSummary,
}: DouyinChannelGmvSummaryParams): DouyinChannelGmvSummary {
  return {
    liveGmv:
      toOptionalNumber(platformData.live_gmv) ??
      toOptionalNumber(liveSummary?.total_curr_gmv),
    prevLiveGmv:
      toOptionalNumber(platformData.prev_live_gmv) ??
      toOptionalNumber(liveSummary?.total_prev_gmv),
    shortvideoGmv:
      toOptionalNumber(platformData.shortvideo_gmv) ??
      toOptionalNumber(shortvideoSummary?.total_curr_gmv),
    prevShortvideoGmv:
      toOptionalNumber(platformData.prev_shortvideo_gmv) ??
      toOptionalNumber(shortvideoSummary?.total_prev_gmv),
    cardGmv:
      toOptionalNumber(platformData.card_gmv) ??
      toOptionalNumber(cardSummary?.total_curr_gmv),
    prevCardGmv:
      toOptionalNumber(platformData.prev_card_gmv) ??
      toOptionalNumber(cardSummary?.total_prev_gmv),
  };
}
