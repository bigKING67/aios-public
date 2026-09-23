import { calcChangePercent, formatCurrencyCompact } from './platform-tab-formatters';
import type { PlatformMetricCard } from './platform-tab-metric-types';

export interface BuildDouyinChannelMetricsParams {
  liveGmv: number | undefined;
  prevLiveGmv: number | undefined;
  shortvideoGmv: number | undefined;
  prevShortvideoGmv: number | undefined;
  cardGmv: number | undefined;
  prevCardGmv: number | undefined;
}

export function buildDouyinChannelMetrics({
  liveGmv,
  prevLiveGmv,
  shortvideoGmv,
  prevShortvideoGmv,
  cardGmv,
  prevCardGmv,
}: BuildDouyinChannelMetricsParams): PlatformMetricCard[] {
  return [
    {
      key: 'live-gmv',
      label: '直播GMV',
      value: formatCurrencyCompact(liveGmv),
      wow:
        liveGmv !== undefined && prevLiveGmv !== undefined
          ? calcChangePercent(liveGmv, prevLiveGmv)
          : undefined,
    },
    {
      key: 'video-gmv',
      label: '短视频GMV',
      value: formatCurrencyCompact(shortvideoGmv),
      wow:
        shortvideoGmv !== undefined && prevShortvideoGmv !== undefined
          ? calcChangePercent(shortvideoGmv, prevShortvideoGmv)
          : undefined,
    },
    {
      key: 'card-gmv',
      label: '商品卡GMV',
      value: formatCurrencyCompact(cardGmv),
      wow:
        cardGmv !== undefined && prevCardGmv !== undefined
          ? calcChangePercent(cardGmv, prevCardGmv)
          : undefined,
    },
  ];
}
