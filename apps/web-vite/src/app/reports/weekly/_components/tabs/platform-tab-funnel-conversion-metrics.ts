import { resolveFunnelClickBase } from './platform-tab-funnel-click-base';
import {
  resolveFunnelCartToPayRate,
  resolveFunnelClickToCartRate,
  resolveFunnelCtr,
} from './platform-tab-funnel-rate-fallbacks';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

export type FunnelConversionMetrics = Pick<
  FunnelChannelRow,
  | 'currCtr'
  | 'prevCtr'
  | 'currClickToCartRate'
  | 'prevClickToCartRate'
  | 'currCartToPayRate'
  | 'prevCartToPayRate'
>;

export function resolveFunnelConversionMetrics(
  item: FunnelChannelItem,
  hasClickStage: boolean,
  currVisitorCount: number | undefined,
  prevVisitorCount: number | undefined,
  currImpressionCount: number,
  prevImpressionCount: number,
  currClickCount: number,
  prevClickCount: number,
  currCartCount: number,
  prevCartCount: number,
  currPayBuyerCount: number,
  prevPayBuyerCount: number,
): FunnelConversionMetrics {
  const currClickBase = resolveFunnelClickBase(hasClickStage, currClickCount, currVisitorCount);
  const prevClickBase = resolveFunnelClickBase(hasClickStage, prevClickCount, prevVisitorCount);

  return {
    currCtr: resolveFunnelCtr(item.curr_ctr, currClickCount, currImpressionCount),
    prevCtr: resolveFunnelCtr(item.prev_ctr, prevClickCount, prevImpressionCount),
    currClickToCartRate: resolveFunnelClickToCartRate(
      item.curr_click_to_cart_rate,
      currCartCount,
      currClickBase,
    ),
    prevClickToCartRate: resolveFunnelClickToCartRate(
      item.prev_click_to_cart_rate,
      prevCartCount,
      prevClickBase,
    ),
    currCartToPayRate: resolveFunnelCartToPayRate(
      item.curr_cart_to_pay_rate,
      currPayBuyerCount,
      currCartCount,
    ),
    prevCartToPayRate: resolveFunnelCartToPayRate(
      item.prev_cart_to_pay_rate,
      prevPayBuyerCount,
      prevCartCount,
    ),
  };
}
