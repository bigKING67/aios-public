import { buildPrimaryBaseMetrics } from './platform-tab-primary-base-metrics';
import { buildPrimaryRoiMetric } from './platform-tab-primary-roi-metric';
import type { PlatformMetricCard } from './platform-tab-metric-types';
import type { BuildPrimaryMetricsParams } from './platform-tab-primary-metric-types';

export type { BuildPrimaryMetricsParams } from './platform-tab-primary-metric-types';

export function buildPrimaryMetrics({
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
}: BuildPrimaryMetricsParams): PlatformMetricCard[] {
  return [
    ...buildPrimaryBaseMetrics({
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
    }),
    ...channelMetrics,
    buildPrimaryRoiMetric({
      roi,
      prevRoi,
      useDashForTrafficQualityMetrics,
    }),
  ];
}
