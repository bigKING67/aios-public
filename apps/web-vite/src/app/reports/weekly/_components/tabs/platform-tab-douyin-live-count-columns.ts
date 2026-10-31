import type { TableColumnsType } from '@lobehub/ui';
import type { DouyinLiveSessionRow } from './platform-tab-types';
import { createIntegerMetricColumn } from './platform-tab-metric-column-builders';

export function buildDouyinLiveCountColumns(): TableColumnsType<DouyinLiveSessionRow> {
  return [
    createIntegerMetricColumn<DouyinLiveSessionRow>('直播间成交订单', 'currLiveOrderCount', 120),
    createIntegerMetricColumn<DouyinLiveSessionRow>('直播间曝光人数', 'currLiveExposureUserCount', 130),
    createIntegerMetricColumn<DouyinLiveSessionRow>('直播间观看人数', 'currLiveWatchUserCount', 130),
    createIntegerMetricColumn<DouyinLiveSessionRow>('直播间成交人数', 'currLiveBuyerCount', 130),
  ];
}
