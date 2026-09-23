import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { DouyinLiveSessionRow } from './platform-tab-types';
import type { DouyinLiveAttributionItem } from './platform-tab-douyin-row-mapper-types';

function resolveDerivedValue(
  numerator: unknown,
  denominator: unknown,
  fallback: unknown,
): number | undefined {
  const numeratorValue = toOptionalNumber(numerator);
  const denominatorValue = toOptionalNumber(denominator);
  if (numeratorValue !== undefined && denominatorValue !== undefined) {
    return denominatorValue > 0 ? numeratorValue / denominatorValue : undefined;
  }
  return toOptionalNumber(fallback);
}

export function mapDouyinLiveAttributionItem(
  item: DouyinLiveAttributionItem,
  index: number
): DouyinLiveSessionRow {
  const sessionId = String(item.session_id || `live-session-${index}`);
  const currLiveGmv = toSafeNumber(item.curr_live_gmv);
  const prevLiveGmv = toSafeNumber(item.prev_live_gmv);
  const liveGmvDelta = toOptionalNumber(item.live_gmv_delta) ?? (currLiveGmv - prevLiveGmv);
  const currLiveBuyerCount = Math.max(0, Math.round(toSafeNumber(item.curr_live_buyer_count)));
  const prevLiveBuyerCount = Math.max(0, Math.round(toSafeNumber(item.prev_live_buyer_count)));

  return {
    rowId: `${sessionId}|${currLiveGmv.toFixed(4)}|${prevLiveGmv.toFixed(4)}`,
    sessionId,
    shopName: String(item.shop_name || '(未知店铺)'),
    shopId: String(item.shop_id || '--'),
    anchorNickname: String(item.anchor_nickname || '(未知主播)'),
    anchorDouyinId: String(item.anchor_douyin_id || '--'),
    liveStartTime: String(item.live_start_time || '--'),
    liveEndTime: String(item.live_end_time || '--'),
    currLiveDurationMinutes: Math.max(0, Math.round(toSafeNumber(item.curr_live_duration_minutes))),
    prevLiveDurationMinutes: Math.max(0, Math.round(toSafeNumber(item.prev_live_duration_minutes))),
    currLiveExposureUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_live_exposure_user_count))),
    prevLiveExposureUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_live_exposure_user_count))),
    currLiveWatchUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_live_watch_user_count))),
    prevLiveWatchUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_live_watch_user_count))),
    currLiveProductExposureUser: Math.max(
      0,
      Math.round(toSafeNumber(item.curr_live_product_exposure_user))
    ),
    prevLiveProductExposureUser: Math.max(
      0,
      Math.round(toSafeNumber(item.prev_live_product_exposure_user))
    ),
    currLiveProductClickUser: Math.max(0, Math.round(toSafeNumber(item.curr_live_product_click_user))),
    prevLiveProductClickUser: Math.max(0, Math.round(toSafeNumber(item.prev_live_product_click_user))),
    currLiveBuyerCount,
    prevLiveBuyerCount,
    currLiveOrderCount: Math.max(0, Math.round(toSafeNumber(item.curr_live_order_count))),
    prevLiveOrderCount: Math.max(0, Math.round(toSafeNumber(item.prev_live_order_count))),
    currLiveGmv,
    prevLiveGmv,
    liveGmvDelta,
    currLiveUserPayAmount: toSafeNumber(item.curr_live_user_pay_amount),
    prevLiveUserPayAmount: toSafeNumber(item.prev_live_user_pay_amount),
    currLiveAdCost: toSafeNumber(item.curr_live_ad_cost),
    prevLiveAdCost: toSafeNumber(item.prev_live_ad_cost),
    currCommentCount: Math.max(0, Math.round(toSafeNumber(item.curr_comment_count))),
    prevCommentCount: Math.max(0, Math.round(toSafeNumber(item.prev_comment_count))),
    currNewFollowerCount: Math.max(0, Math.round(toSafeNumber(item.curr_new_follower_count))),
    prevNewFollowerCount: Math.max(0, Math.round(toSafeNumber(item.prev_new_follower_count))),
    currProductCount: Math.max(0, Math.round(toSafeNumber(item.curr_product_count))),
    prevProductCount: Math.max(0, Math.round(toSafeNumber(item.prev_product_count))),
    currAvgOrderValue: resolveDerivedValue(
      item.curr_live_gmv,
      item.curr_live_buyer_count,
      item.curr_avg_order_value,
    ),
    prevAvgOrderValue: resolveDerivedValue(
      item.prev_live_gmv,
      item.prev_live_buyer_count,
      item.prev_avg_order_value,
    ),
  };
}
