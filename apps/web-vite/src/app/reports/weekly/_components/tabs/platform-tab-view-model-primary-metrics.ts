import type { DouyinChannelGmvSummary } from './platform-tab-douyin-summary';
import {
  buildPrimaryMetrics,
  resolvePlatformChannelMetrics,
  type PlatformBaseMetricValues,
  type PlatformMetricCard,
} from './platform-tab-metrics';
import type {
  PlatformQualityMetricInputs,
  PlatformQualityMetrics,
} from './platform-tab-quality-metrics';

interface PlatformTabPrimaryMetricValues {
  gsvValue: number | undefined;
  channelMetrics: PlatformMetricCard[];
}

interface ResolvePlatformTabPrimaryMetricsParams {
  baseMetrics: PlatformBaseMetricValues;
  qualityInputs: PlatformQualityMetricInputs;
  qualityMetrics: PlatformQualityMetrics;
  douyinChannelGmvSummary: DouyinChannelGmvSummary;
  isDouyinPlatform: boolean;
  useDashForTrafficQualityMetrics: boolean;
}

export function resolvePlatformTabPrimaryMetrics({
  baseMetrics,
  qualityInputs,
  qualityMetrics,
  douyinChannelGmvSummary,
  isDouyinPlatform,
  useDashForTrafficQualityMetrics,
}: ResolvePlatformTabPrimaryMetricsParams): PlatformMetricCard[] {
  const { gsvValue, channelMetrics } = resolvePlatformTabPrimaryMetricValues({
    baseMetrics,
    qualityInputs,
    qualityMetrics,
    douyinChannelGmvSummary,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
  });
  const {
    gmv,
    prevGmv,
    refundAmount,
    prevRefundAmount,
    prevGsv,
    orders,
    prevOrders,
    buyerCount,
    prevBuyerCount,
    arpu,
    prevArpu,
  } = baseMetrics;
  const { roi, prevRoi } = qualityMetrics;

  return buildPrimaryMetrics({
    gmv,
    prevGmv,
    gsvValue,
    prevGsv,
    refundAmount,
    prevRefundAmount,
    buyerCount,
    prevBuyerCount,
    arpu,
    prevArpu,
    orders,
    prevOrders,
    channelMetrics,
    roi,
    prevRoi,
    useDashForTrafficQualityMetrics,
  });
}

export function resolvePlatformTabPrimaryMetricValues({
  baseMetrics,
  qualityInputs,
  qualityMetrics,
  douyinChannelGmvSummary,
  isDouyinPlatform,
  useDashForTrafficQualityMetrics,
}: ResolvePlatformTabPrimaryMetricsParams): PlatformTabPrimaryMetricValues {
  const { gmv, gsv, refundAmountPayTime } = baseMetrics;
  const { visitorCount, prevVisitorCount } = qualityInputs;
  const { payCvr, prevPayCvr, uvValue, prevUvValue } = qualityMetrics;
  const {
    liveGmv,
    prevLiveGmv,
    shortvideoGmv,
    prevShortvideoGmv,
    cardGmv,
    prevCardGmv,
  } = douyinChannelGmvSummary;
  const gsvValue =
    gsv ?? (refundAmountPayTime !== undefined ? gmv - refundAmountPayTime : undefined);
  const channelMetrics = resolvePlatformChannelMetrics({
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
  });

  return {
    gsvValue,
    channelMetrics,
  };
}
