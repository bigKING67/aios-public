import { normalizeFunnelCount } from './platform-tab-funnel-count-normalizers';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

type FunnelEngagementCountFields = Pick<
  FunnelChannelRow,
  | 'currWangwangConsultCount'
  | 'prevWangwangConsultCount'
  | 'currMemberJoinCount'
  | 'prevMemberJoinCount'
  | 'currNewBuyerCount'
  | 'prevNewBuyerCount'
  | 'currCouponClaimCount'
  | 'prevCouponClaimCount'
  | 'currTotalFavoriteCartCount'
  | 'prevTotalFavoriteCartCount'
>;

export function resolveFunnelEngagementCounts(item: FunnelChannelItem): FunnelEngagementCountFields {
  return {
    currWangwangConsultCount: normalizeFunnelCount(item.curr_wangwang_consult_count),
    prevWangwangConsultCount: normalizeFunnelCount(item.prev_wangwang_consult_count),
    currMemberJoinCount: normalizeFunnelCount(item.curr_member_join_count),
    prevMemberJoinCount: normalizeFunnelCount(item.prev_member_join_count),
    currNewBuyerCount: normalizeFunnelCount(item.curr_new_buyer_count),
    prevNewBuyerCount: normalizeFunnelCount(item.prev_new_buyer_count),
    currCouponClaimCount: normalizeFunnelCount(item.curr_coupon_claim_count),
    prevCouponClaimCount: normalizeFunnelCount(item.prev_coupon_claim_count),
    currTotalFavoriteCartCount: normalizeFunnelCount(item.curr_total_favorite_cart_count),
    prevTotalFavoriteCartCount: normalizeFunnelCount(item.prev_total_favorite_cart_count),
  };
}
