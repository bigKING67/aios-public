import {
  calcChangePercent,
  resolveTrafficChannelLabel,
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { ChannelAttributionRow } from './platform-tab-types';
import type { ChannelAttributionItem } from './platform-tab-row-mapper-types';

export function mapChannelAttributionItem(
  item: ChannelAttributionItem
): ChannelAttributionRow {
  const payAmount = toSafeNumber(item.pay_amount);
  const prevPayAmount = toOptionalNumber(item.prev_pay_amount) ?? 0;
  const payAmountDelta = toOptionalNumber(item.pay_amount_delta) ?? (payAmount - prevPayAmount);
  const payAmountWoW = calcChangePercent(payAmount, prevPayAmount);
  const payBuyerCount = Math.max(0, Math.round(toSafeNumber(item.pay_buyer_count)));
  const visitorCount = Math.max(0, Math.round(toSafeNumber(item.visitor_count)));
  const cartBuyerCount = Math.max(0, Math.round(toSafeNumber(item.cart_buyer_count)));
  const trafficChannel = String(item.traffic_channel || 'unknown');
  const productId = String(item.product_id || '--');
  const productName = String(item.product_name || '(未命名商品)');

  return {
    rowId: [
      productId,
      trafficChannel,
      payAmount.toFixed(4),
      prevPayAmount.toFixed(4),
      String(payBuyerCount),
      String(visitorCount),
      String(cartBuyerCount),
    ].join('|'),
    productId,
    productName,
    trafficChannel,
    trafficChannelLabel: resolveTrafficChannelLabel(trafficChannel),
    payAmount,
    prevPayAmount,
    payAmountWoW,
    payAmountDelta,
    payAmountDeltaContribution: toOptionalNumber(item.pay_amount_delta_contribution),
    payBuyerCount,
    visitorCount,
    cartBuyerCount,
  };
}
