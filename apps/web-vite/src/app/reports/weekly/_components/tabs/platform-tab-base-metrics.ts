import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type {
  PlatformBaseMetricValues,
  PlatformMetricsSource,
} from './platform-tab-metric-types';

export function resolvePlatformBaseMetricValues(
  platformData: PlatformMetricsSource
): PlatformBaseMetricValues {
  const gmv = toSafeNumber(platformData.gmv);
  const prevGmv = toOptionalNumber(platformData.prev_gmv);
  const prevGmvSafe = prevGmv ?? 0;
  const gmvDelta = gmv - prevGmvSafe;
  const gsv = toOptionalNumber(platformData.gsv);
  const refundAmount = toOptionalNumber(platformData.refund_amount_refund_time);
  const prevRefundAmount = toOptionalNumber(platformData.prev_refund_amount_refund_time);
  const refundAmountPayTime = toOptionalNumber(platformData.refund_amount_pay_time);
  const prevRefundAmountPayTime = toOptionalNumber(platformData.prev_refund_amount_pay_time);
  const prevGsv =
    prevGmv !== undefined && prevRefundAmountPayTime !== undefined
      ? prevGmv - prevRefundAmountPayTime
      : undefined;
  const orders = toSafeNumber(platformData.orders);
  const prevOrders = toOptionalNumber(platformData.prev_orders);
  const buyerCount = toOptionalNumber(platformData.buyer_count) ?? toOptionalNumber(platformData.uv);
  const prevBuyerCount = toOptionalNumber(platformData.prev_buyer_count);
  const arpu =
    toOptionalNumber(platformData.arpu) ??
    (buyerCount !== undefined && buyerCount > 0 ? gmv / buyerCount : undefined);
  const prevArpu =
    toOptionalNumber(platformData.prev_arpu) ??
    (prevGmv !== undefined && prevBuyerCount !== undefined && prevBuyerCount > 0
      ? prevGmv / prevBuyerCount
      : undefined);

  return {
    gmv,
    prevGmv,
    prevGmvSafe,
    gmvDelta,
    gsv,
    refundAmount,
    prevRefundAmount,
    refundAmountPayTime,
    prevRefundAmountPayTime,
    prevGsv,
    orders,
    prevOrders,
    buyerCount,
    prevBuyerCount,
    arpu,
    prevArpu,
  };
}
