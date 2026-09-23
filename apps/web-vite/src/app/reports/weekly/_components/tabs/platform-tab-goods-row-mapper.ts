import {
  calcChangePercent,
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { GoodsTableRow } from './platform-tab-types';
import type { GoodsAttributionItem } from './platform-tab-row-mapper-types';

export function mapGoodsAttributionItem(item: GoodsAttributionItem): GoodsTableRow {
  const gmvValue = toSafeNumber(item.gmv);
  const prevGmvValue = toOptionalNumber(item.prev_gmv) ?? 0;
  const buyerValue = Math.max(0, Math.round(toSafeNumber(item.buyer_count)));
  const visitorValue = Math.max(0, Math.round(toSafeNumber(item.visitor_count)));
  const gmvDeltaValue = toOptionalNumber(item.gmv_delta) ?? (gmvValue - prevGmvValue);
  const gmvWoWValue = calcChangePercent(gmvValue, prevGmvValue);
  const payConversionValue = visitorValue > 0
    ? buyerValue / visitorValue
    : undefined;
  const avgOrderValue = buyerValue > 0
    ? gmvValue / buyerValue
    : undefined;

  return {
    rowId: [
      String(item.product_id || '--'),
      String(item.product_name || '(未命名商品)'),
      gmvValue.toFixed(4),
      prevGmvValue.toFixed(4),
      String(buyerValue),
      String(visitorValue),
    ].join('|'),
    productId: String(item.product_id || '--'),
    productName: String(item.product_name || '(未命名商品)'),
    gmv: gmvValue,
    prevGmv: prevGmvValue,
    gmvWoW: gmvWoWValue,
    gmvDelta: gmvDeltaValue,
    gmvDeltaContribution: toOptionalNumber(item.gmv_delta_contribution),
    buyerCount: buyerValue,
    visitorCount: visitorValue,
    payConversionRate: payConversionValue,
    avgOrderValue,
  };
}
