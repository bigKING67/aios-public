import { formatCurrencyWithTwoDecimals } from './platform-tab-douyin-detail-formatters';
import { formatInteger } from './platform-tab-formatters';
import type {
  DouyinCardSourceRow,
  DouyinMetricDetailRow,
} from './platform-tab-types';

export function buildDouyinCardSourceDetailRows(
  row: DouyinCardSourceRow | undefined
): DouyinMetricDetailRow[] {
  if (!row) {
    return [];
  }

  return [
    {
      key: 'cart-user',
      metric: '加购人数',
      curr: row.currCardCartUserCount,
      prev: row.prevCardCartUserCount,
      formatter: formatInteger,
    },
    {
      key: 'favorite-user',
      metric: '收藏人数',
      curr: row.currCardFavoriteUserCount,
      prev: row.prevCardFavoriteUserCount,
      formatter: formatInteger,
    },
    {
      key: 'bounce-user',
      metric: '跳失人数',
      curr: row.currCardBounceUserCount,
      prev: row.prevCardBounceUserCount,
      formatter: formatInteger,
    },
    {
      key: 'order-count',
      metric: '成交订单数',
      curr: row.currCardOrderCount,
      prev: row.prevCardOrderCount,
      formatter: formatInteger,
    },
    {
      key: 'pay-amount',
      metric: '支付金额',
      curr: row.currCardUserPayAmount,
      prev: row.prevCardUserPayAmount,
      formatter: formatCurrencyWithTwoDecimals,
    },
  ];
}
