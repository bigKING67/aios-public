import {
  normalizeFunnelCount,
  normalizeOptionalFunnelCount,
} from './platform-tab-funnel-count-normalizers';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

export type FunnelCoreCounts = Pick<
  FunnelChannelRow,
  | 'currVisitorCount'
  | 'prevVisitorCount'
  | 'currImpressionCount'
  | 'prevImpressionCount'
  | 'currClickCount'
  | 'prevClickCount'
  | 'currCartCount'
  | 'prevCartCount'
  | 'currPayBuyerCount'
  | 'prevPayBuyerCount'
>;

export function resolveFunnelCoreCounts(item: FunnelChannelItem): FunnelCoreCounts {
  return {
    currVisitorCount: normalizeOptionalFunnelCount(item.curr_visitor_count),
    prevVisitorCount: normalizeOptionalFunnelCount(item.prev_visitor_count),
    currImpressionCount: normalizeFunnelCount(item.curr_impression_count),
    prevImpressionCount: normalizeFunnelCount(item.prev_impression_count),
    currClickCount: normalizeFunnelCount(item.curr_click_count),
    prevClickCount: normalizeFunnelCount(item.prev_click_count),
    currCartCount: normalizeFunnelCount(item.curr_cart_count),
    prevCartCount: normalizeFunnelCount(item.prev_cart_count),
    currPayBuyerCount: normalizeFunnelCount(item.curr_pay_buyer_count),
    prevPayBuyerCount: normalizeFunnelCount(item.prev_pay_buyer_count),
  };
}
