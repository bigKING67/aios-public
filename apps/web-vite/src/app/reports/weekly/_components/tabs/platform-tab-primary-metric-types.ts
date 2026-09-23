import type { PlatformMetricCard } from './platform-tab-metric-types';

export interface BuildPrimaryBaseMetricsParams {
  gmv: number;
  prevGmv: number | undefined;
  gsvValue: number | undefined;
  prevGsv: number | undefined;
  refundAmount: number | undefined;
  prevRefundAmount: number | undefined;
  buyerCount: number | undefined;
  prevBuyerCount: number | undefined;
  arpu: number | undefined;
  prevArpu: number | undefined;
  orders: number;
  prevOrders: number | undefined;
}

export interface BuildPrimaryRoiMetricParams {
  roi: number | undefined;
  prevRoi: number | undefined;
  useDashForTrafficQualityMetrics: boolean;
}

export interface BuildPrimaryMetricsParams
  extends BuildPrimaryBaseMetricsParams,
    BuildPrimaryRoiMetricParams {
  channelMetrics: PlatformMetricCard[];
}
