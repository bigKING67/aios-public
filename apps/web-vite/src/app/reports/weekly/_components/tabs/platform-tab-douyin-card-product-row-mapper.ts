import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { DouyinCardProductRow } from './platform-tab-types';
import type { DouyinCardProductAttributionItem } from './platform-tab-douyin-row-mapper-types';

export function mapDouyinCardProductAttributionItem(
  item: DouyinCardProductAttributionItem,
  index: number
): DouyinCardProductRow {
  const productId = String(item.product_id || `product-${index}`);
  const currCardUserPayAmount = toSafeNumber(item.curr_card_user_pay_amount);
  const prevCardUserPayAmount = toSafeNumber(item.prev_card_user_pay_amount);
  const cardGmvDelta =
    toOptionalNumber(item.card_gmv_delta) ?? (currCardUserPayAmount - prevCardUserPayAmount);

  return {
    rowId: `${productId}|${currCardUserPayAmount.toFixed(4)}`,
    productId,
    productTitle: String(item.product_title || '(未命名商品)'),
    productUrl: typeof item.product_url === 'string' ? item.product_url : undefined,
    currCardUserPayAmount,
    prevCardUserPayAmount,
    cardGmvDelta,
    currCardOrderCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_order_count))),
    prevCardOrderCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_order_count))),
    currCardBuyerCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_buyer_count))),
    prevCardBuyerCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_buyer_count))),
    currCardExposureUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_exposure_user_count))),
    prevCardExposureUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_exposure_user_count))),
    currCardClickUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_click_user_count))),
    prevCardClickUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_click_user_count))),
    currCardCartUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_cart_user_count))),
    prevCardCartUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_cart_user_count))),
    currCardFavoriteUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_favorite_user_count))),
    prevCardFavoriteUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_favorite_user_count))),
  };
}
