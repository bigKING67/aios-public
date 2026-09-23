import dayjs from 'dayjs';

import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type {
  DashboardLiveGoodsRow,
  DashboardLiveGoodsSessionGroup,
} from './dashboard-types';
import { toLiveGoodsNumber } from './dashboard-live-goods-formatters';

function buildLiveGoodsSessionKey(row: DashboardLiveGoodsRow): string {
  return [
    row.live_start_time || 'unknown-time',
    row.anchor_douyin_id || 'unknown-anchor',
    row.shop_id || 'unknown-shop',
  ].join('__');
}

export function buildLiveGoodsSessionGroups(rows: DashboardLiveGoodsRow[]): DashboardLiveGoodsSessionGroup[] {
  const productRows = rows.filter((row) => row.rowType === 'product_summary');
  const rowsForGrouping = productRows.length ? productRows : rows;
  const groupMap = new Map<string, DashboardLiveGoodsSessionGroup>();

  for (const row of rowsForGrouping) {
    const key = buildLiveGoodsSessionKey(row);
    const payAmount = toLiveGoodsNumber(row.product_user_pay_amount);
    let group = groupMap.get(key);

    if (!group) {
      group = {
        key,
        liveStartTime: row.live_start_time,
        liveEndTime: row.live_end_time,
        anchorDouyinId: row.anchor_douyin_id,
        anchorNickname: row.anchor_nickname,
        anchorType: row.anchor_type,
        shopName: row.shop_name,
        productRows: [],
        productCount: 0,
        skuCount: 0,
        totalPayAmount: 0,
        totalSalesVolume: 0,
        totalBuyerCount: 0,
        totalOrderCount: 0,
        totalRefundAmount: 0,
        totalRefundOrderCount: 0,
        maxProductPayAmount: 0,
      };
      groupMap.set(key, group);
    }

    group.productRows.push(row);
    group.productCount += 1;
    group.skuCount += row.children?.length ?? 0;
    group.totalPayAmount += payAmount;
    group.totalSalesVolume += toLiveGoodsNumber(row.product_sales_volume);
    group.totalBuyerCount += toLiveGoodsNumber(row.product_buyer_count);
    group.totalOrderCount += toLiveGoodsNumber(row.product_order_count);
    group.totalRefundAmount += toLiveGoodsNumber(row.refund_amount);
    group.totalRefundOrderCount += toLiveGoodsNumber(row.refund_order_count);
    group.maxProductPayAmount = Math.max(group.maxProductPayAmount, payAmount);
  }

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      productRows: [...group.productRows].sort(
        (left, right) =>
          compareNullableNumbers(right.product_user_pay_amount, left.product_user_pay_amount) ||
          compareText(left.product_name || '', right.product_name || '')
      ),
    }))
    .sort((left, right) => {
      const leftTime = dayjs(left.liveStartTime).valueOf();
      const rightTime = dayjs(right.liveStartTime).valueOf();
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
      }
      return compareText(right.liveStartTime || '', left.liveStartTime || '');
    });
}
