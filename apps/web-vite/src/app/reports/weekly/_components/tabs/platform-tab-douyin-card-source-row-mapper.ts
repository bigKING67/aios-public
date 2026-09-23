import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import type { DouyinCardSourceRow } from './platform-tab-types';
import type { DouyinCardSourceAttributionItem } from './platform-tab-douyin-row-mapper-types';

function resolveDerivedRate(
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

export function mapDouyinCardSourceAttributionItem(
  item: DouyinCardSourceAttributionItem,
  index: number
): DouyinCardSourceRow {
  const sourceLevel1 = String(item.source_level1 || `未知来源-${index}`);
  const currCardExposureUserCount = Math.max(0, Math.round(toSafeNumber(item.curr_card_exposure_user_count)));
  const prevCardExposureUserCount = Math.max(0, Math.round(toSafeNumber(item.prev_card_exposure_user_count)));
  const currCardClickUserCount = Math.max(0, Math.round(toSafeNumber(item.curr_card_click_user_count)));
  const prevCardClickUserCount = Math.max(0, Math.round(toSafeNumber(item.prev_card_click_user_count)));
  const currCardBuyerCount = Math.max(0, Math.round(toSafeNumber(item.curr_card_buyer_count)));
  const prevCardBuyerCount = Math.max(0, Math.round(toSafeNumber(item.prev_card_buyer_count)));
  const currCardUserPayAmount = toSafeNumber(item.curr_card_user_pay_amount);
  const prevCardUserPayAmount = toSafeNumber(item.prev_card_user_pay_amount);
  const cardUserPayAmountDelta =
    toOptionalNumber(item.card_user_pay_amount_delta) ?? (currCardUserPayAmount - prevCardUserPayAmount);

  return {
    rowId: `${sourceLevel1}|${currCardUserPayAmount.toFixed(4)}`,
    sourceLevel1,
    currCardExposureUserCount,
    prevCardExposureUserCount,
    currCardClickUserCount,
    prevCardClickUserCount,
    currCardBuyerCount,
    prevCardBuyerCount,
    currCardCartUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_cart_user_count))),
    prevCardCartUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_cart_user_count))),
    currCardFavoriteUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_favorite_user_count))),
    prevCardFavoriteUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_favorite_user_count))),
    currCardBounceUserCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_bounce_user_count))),
    prevCardBounceUserCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_bounce_user_count))),
    currCardOrderCount: Math.max(0, Math.round(toSafeNumber(item.curr_card_order_count))),
    prevCardOrderCount: Math.max(0, Math.round(toSafeNumber(item.prev_card_order_count))),
    currCardUserPayAmount,
    prevCardUserPayAmount,
    cardUserPayAmountDelta,
    currCardClickRate: resolveDerivedRate(
      item.curr_card_click_user_count,
      item.curr_card_exposure_user_count,
      item.curr_card_click_rate,
    ),
    prevCardClickRate: resolveDerivedRate(
      item.prev_card_click_user_count,
      item.prev_card_exposure_user_count,
      item.prev_card_click_rate,
    ),
    currCardClickToPayRate: resolveDerivedRate(
      item.curr_card_buyer_count,
      item.curr_card_click_user_count,
      item.curr_card_click_to_pay_rate,
    ),
    prevCardClickToPayRate: resolveDerivedRate(
      item.prev_card_buyer_count,
      item.prev_card_click_user_count,
      item.prev_card_click_to_pay_rate,
    ),
  };
}
