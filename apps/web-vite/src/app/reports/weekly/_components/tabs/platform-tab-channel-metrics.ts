import {
  buildDouyinChannelMetrics,
  type BuildDouyinChannelMetricsParams,
} from './platform-tab-douyin-channel-metrics';
import type { PlatformMetricCard } from './platform-tab-metric-types';
import {
  buildTrafficMetrics,
  type BuildTrafficMetricsParams,
} from './platform-tab-traffic-metrics';

export {
  buildDouyinChannelMetrics,
  buildTrafficMetrics,
};
export type {
  BuildDouyinChannelMetricsParams,
  BuildTrafficMetricsParams,
};

export interface ResolvePlatformChannelMetricsParams
  extends BuildTrafficMetricsParams,
    BuildDouyinChannelMetricsParams {
  isDouyinPlatform: boolean;
}

export function resolvePlatformChannelMetrics({
  isDouyinPlatform,
  useDashForTrafficQualityMetrics,
  visitorCount,
  prevVisitorCount,
  payCvr,
  prevPayCvr,
  uvValue,
  prevUvValue,
  liveGmv,
  prevLiveGmv,
  shortvideoGmv,
  prevShortvideoGmv,
  cardGmv,
  prevCardGmv,
}: ResolvePlatformChannelMetricsParams): PlatformMetricCard[] {
  const trafficMetrics = buildTrafficMetrics({
    useDashForTrafficQualityMetrics,
    visitorCount,
    prevVisitorCount,
    payCvr,
    prevPayCvr,
    uvValue,
    prevUvValue,
  });
  const douyinChannelMetrics = buildDouyinChannelMetrics({
    liveGmv,
    prevLiveGmv,
    shortvideoGmv,
    prevShortvideoGmv,
    cardGmv,
    prevCardGmv,
  });

  return isDouyinPlatform ? douyinChannelMetrics : trafficMetrics;
}
