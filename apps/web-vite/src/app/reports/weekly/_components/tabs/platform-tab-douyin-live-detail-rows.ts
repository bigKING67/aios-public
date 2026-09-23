import { formatCurrencyWithTwoDecimals } from './platform-tab-douyin-detail-formatters';
import { formatInteger } from './platform-tab-formatters';
import type {
  DouyinLiveSessionRow,
  DouyinMetricDetailRow,
} from './platform-tab-types';

export function buildDouyinLiveDetailRows(
  row: DouyinLiveSessionRow | undefined
): DouyinMetricDetailRow[] {
  if (!row) {
    return [];
  }

  return [
    {
      key: 'duration',
      metric: '直播时长(分钟)',
      curr: row.currLiveDurationMinutes,
      prev: row.prevLiveDurationMinutes,
      formatter: formatInteger,
    },
    {
      key: 'order',
      metric: '直播间成交订单',
      curr: row.currLiveOrderCount,
      prev: row.prevLiveOrderCount,
      formatter: formatInteger,
    },
    {
      key: 'gmv',
      metric: '直播间成交金额',
      curr: row.currLiveGmv,
      prev: row.prevLiveGmv,
      formatter: formatCurrencyWithTwoDecimals,
    },
    {
      key: 'pay',
      metric: '直播间用户支付金额',
      curr: row.currLiveUserPayAmount,
      prev: row.prevLiveUserPayAmount,
      formatter: formatCurrencyWithTwoDecimals,
    },
    {
      key: 'ad',
      metric: '直播投放消耗',
      curr: row.currLiveAdCost,
      prev: row.prevLiveAdCost,
      formatter: formatCurrencyWithTwoDecimals,
    },
    {
      key: 'comment',
      metric: '评论次数',
      curr: row.currCommentCount,
      prev: row.prevCommentCount,
      formatter: formatInteger,
    },
    {
      key: 'follower',
      metric: '新增粉丝数',
      curr: row.currNewFollowerCount,
      prev: row.prevNewFollowerCount,
      formatter: formatInteger,
    },
    {
      key: 'product',
      metric: '带货商品数',
      curr: row.currProductCount,
      prev: row.prevProductCount,
      formatter: formatInteger,
    },
    {
      key: 'aov',
      metric: '客单价',
      curr: row.currAvgOrderValue ?? 0,
      prev: row.prevAvgOrderValue ?? 0,
      formatter: formatCurrencyWithTwoDecimals,
    },
  ];
}
