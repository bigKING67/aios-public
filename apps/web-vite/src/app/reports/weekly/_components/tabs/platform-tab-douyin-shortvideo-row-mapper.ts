import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { DouyinShortvideoRow } from './platform-tab-types';
import type { DouyinShortvideoAttributionItem } from './platform-tab-douyin-row-mapper-types';

export function mapDouyinShortvideoAttributionItem(
  item: DouyinShortvideoAttributionItem,
  index: number
): DouyinShortvideoRow {
  const videoId = String(item.video_id || `video-${index}`);
  const authorDouyinId = String(item.author_douyin_id || '--');
  const currUserPayAmount = toSafeNumber(item.curr_user_pay_amount);
  const prevUserPayAmount = toSafeNumber(item.prev_user_pay_amount);
  const userPayAmountDelta =
    toOptionalNumber(item.user_pay_amount_delta) ?? (currUserPayAmount - prevUserPayAmount);

  return {
    rowId: `${videoId}|${authorDouyinId}|${currUserPayAmount.toFixed(4)}`,
    videoId,
    videoTitle: String(item.video_title || '(未命名短视频)'),
    authorNickname: String(item.author_nickname || '(未知达人)'),
    authorDouyinId,
    productId: String(item.product_id || '--'),
    publishTime: String(item.publish_time || '--'),
    isPromoted: String(item.is_promoted || ''),
    playUrl: typeof item.play_url === 'string' ? item.play_url : undefined,
    currVideoViewCount: Math.max(0, Math.round(toSafeNumber(item.curr_video_view_count))),
    prevVideoViewCount: Math.max(0, Math.round(toSafeNumber(item.prev_video_view_count))),
    currUserPayAmount,
    prevUserPayAmount,
    userPayAmountDelta,
    currRefundAmount: toSafeNumber(item.curr_refund_amount),
    prevRefundAmount: toSafeNumber(item.prev_refund_amount),
    currLiveRoomPayAmount: toSafeNumber(item.curr_live_room_pay_amount),
    prevLiveRoomPayAmount: toSafeNumber(item.prev_live_room_pay_amount),
    currSearchAfterViewPayAmount: toSafeNumber(item.curr_search_after_view_pay_amount),
    prevSearchAfterViewPayAmount: toSafeNumber(item.prev_search_after_view_pay_amount),
    currShopPagePayAmount: toSafeNumber(item.curr_shop_page_pay_amount),
    prevShopPagePayAmount: toSafeNumber(item.prev_shop_page_pay_amount),
  };
}
