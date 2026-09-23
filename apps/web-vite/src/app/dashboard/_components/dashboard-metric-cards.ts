import {
  formatCompactWanCurrency,
  formatCompactWanInteger,
  formatTableRate,
} from './dashboard-formatters';
import {
  LIVE_TOP_METRIC_KEYS,
  SHORT_VIDEO_TOP_METRIC_KEYS,
  calculateRateChange,
  splitDashboardMetricCardsByKeys,
  type DashboardMetricCardGroups,
} from './dashboard-metric-card-calculations';
import { toSortableNumber } from './dashboard-sorters';
import type {
  DashboardLiveTotals,
  DashboardShortVideoTotals,
  LiveMetricCard,
} from './dashboard-types';

export { buildDashboardGoodsCardMetricCards } from './dashboard-goods-card-metric-cards';

export function buildDashboardLiveMetricCardGroups(metricCards: LiveMetricCard[]): DashboardMetricCardGroups {
  return splitDashboardMetricCardsByKeys(metricCards, LIVE_TOP_METRIC_KEYS);
}

export function buildDashboardShortVideoMetricCardGroups(metricCards: LiveMetricCard[]): DashboardMetricCardGroups {
  return splitDashboardMetricCardsByKeys(metricCards, SHORT_VIDEO_TOP_METRIC_KEYS);
}

export function buildDashboardLiveMetricCards(
  currentTotals: DashboardLiveTotals | null,
  previousTotals: DashboardLiveTotals | null
): LiveMetricCard[] {
  const currentGmv = toSortableNumber(currentTotals?.live_gmv ?? null);
  const currentRefundAmount = toSortableNumber(currentTotals?.live_refund_amount ?? null);
  const previousGmv = toSortableNumber(previousTotals?.live_gmv ?? null);
  const previousRefundAmount = toSortableNumber(previousTotals?.live_refund_amount ?? null);
  const currentGsv = currentGmv === null || currentRefundAmount === null ? null : currentGmv - currentRefundAmount;
  const previousGsv = previousGmv === null || previousRefundAmount === null ? null : previousGmv - previousRefundAmount;

  const currentBuyerCount = toSortableNumber(currentTotals?.live_buyer_count ?? null);
  const currentWatchUserCount = toSortableNumber(currentTotals?.live_watch_user_count ?? null);
  const previousBuyerCount = toSortableNumber(previousTotals?.live_buyer_count ?? null);
  const previousWatchUserCount = toSortableNumber(previousTotals?.live_watch_user_count ?? null);
  const currentWatchConversionRate =
    currentBuyerCount === null ||
    currentWatchUserCount === null ||
    Math.abs(currentWatchUserCount) < Number.EPSILON
      ? null
      : currentBuyerCount / currentWatchUserCount;
  const previousWatchConversionRate =
    previousBuyerCount === null ||
    previousWatchUserCount === null ||
    Math.abs(previousWatchUserCount) < Number.EPSILON
      ? null
      : previousBuyerCount / previousWatchUserCount;
  const currentAvgOrderValue =
    currentGmv === null || currentBuyerCount === null || Math.abs(currentBuyerCount) < Number.EPSILON
      ? null
      : currentGmv / currentBuyerCount;
  const previousAvgOrderValue =
    previousGmv === null || previousBuyerCount === null || Math.abs(previousBuyerCount) < Number.EPSILON
      ? null
      : previousGmv / previousBuyerCount;

  return [
    {
      key: 'live_session_count',
      label: '直播场次',
      value: formatCompactWanInteger(currentTotals?.live_session_count ?? null),
      wow: calculateRateChange(currentTotals?.live_session_count ?? null, previousTotals?.live_session_count ?? null),
      currentRaw: toSortableNumber(currentTotals?.live_session_count ?? null),
      previousRaw: toSortableNumber(previousTotals?.live_session_count ?? null),
      format: 'integer',
    },
    {
      key: 'live_gmv',
      label: '直播GMV',
      value: formatCompactWanCurrency(currentTotals?.live_gmv ?? null),
      wow: calculateRateChange(currentTotals?.live_gmv ?? null, previousTotals?.live_gmv ?? null),
      currentRaw: currentGmv,
      previousRaw: previousGmv,
      format: 'currency',
    },
    {
      key: 'live_gsv',
      label: '直播GSV',
      value: formatCompactWanCurrency(currentGsv),
      wow: calculateRateChange(currentGsv, previousGsv),
      currentRaw: currentGsv,
      previousRaw: previousGsv,
      format: 'currency',
    },
    {
      key: 'live_buyer_count',
      label: '成交人数',
      value: formatCompactWanInteger(currentTotals?.live_buyer_count ?? null),
      wow: calculateRateChange(currentTotals?.live_buyer_count ?? null, previousTotals?.live_buyer_count ?? null),
      currentRaw: currentBuyerCount,
      previousRaw: previousBuyerCount,
      format: 'integer',
    },
    {
      key: 'live_watch_user_count',
      label: '观看人数',
      value: formatCompactWanInteger(currentTotals?.live_watch_user_count ?? null),
      wow: calculateRateChange(
        currentTotals?.live_watch_user_count ?? null,
        previousTotals?.live_watch_user_count ?? null
      ),
      currentRaw: currentWatchUserCount,
      previousRaw: previousWatchUserCount,
      format: 'integer',
    },
    {
      key: 'live_watch_conversion_rate',
      label: '看播转化率',
      value: formatTableRate(currentWatchConversionRate),
      wow: calculateRateChange(currentWatchConversionRate, previousWatchConversionRate),
      currentRaw: currentWatchConversionRate,
      previousRaw: previousWatchConversionRate,
      format: 'rate',
    },
    {
      key: 'live_avg_order_value',
      label: '客单价',
      value: formatCompactWanCurrency(currentAvgOrderValue),
      wow: calculateRateChange(currentAvgOrderValue, previousAvgOrderValue),
      currentRaw: currentAvgOrderValue,
      previousRaw: previousAvgOrderValue,
      format: 'currency',
    },
    {
      key: 'live_order_count',
      label: '成交订单数',
      value: formatCompactWanInteger(currentTotals?.live_order_count ?? null),
      wow: calculateRateChange(currentTotals?.live_order_count ?? null, previousTotals?.live_order_count ?? null),
      currentRaw: toSortableNumber(currentTotals?.live_order_count ?? null),
      previousRaw: toSortableNumber(previousTotals?.live_order_count ?? null),
      format: 'integer',
    },
    {
      key: 'refund_rate',
      label: '退款率',
      value: formatTableRate(currentTotals?.refund_rate ?? null),
      wow: calculateRateChange(currentTotals?.refund_rate ?? null, previousTotals?.refund_rate ?? null),
      currentRaw: toSortableNumber(currentTotals?.refund_rate ?? null),
      previousRaw: toSortableNumber(previousTotals?.refund_rate ?? null),
      format: 'rate',
    },
  ];
}

export function buildDashboardShortVideoMetricCards(
  currentTotals: DashboardShortVideoTotals | null,
  previousTotals: DashboardShortVideoTotals | null
): LiveMetricCard[] {
  const currentUserPayAmount = toSortableNumber(currentTotals?.shortvideo_user_pay_amount ?? null);
  const previousUserPayAmount = toSortableNumber(previousTotals?.shortvideo_user_pay_amount ?? null);
  const currentRefundAmount = toSortableNumber(currentTotals?.shortvideo_refund_amount ?? null);
  const previousRefundAmount = toSortableNumber(previousTotals?.shortvideo_refund_amount ?? null);
  const currentGmv = currentUserPayAmount;
  const previousGmv = previousUserPayAmount;
  const currentGsv =
    currentUserPayAmount === null || currentRefundAmount === null ? null : currentUserPayAmount - currentRefundAmount;
  const previousGsv =
    previousUserPayAmount === null || previousRefundAmount === null ? null : previousUserPayAmount - previousRefundAmount;

  return [
    {
      key: 'shortvideo_count',
      label: '短视频条数',
      value: formatCompactWanInteger(currentTotals?.shortvideo_count ?? null),
      wow: calculateRateChange(currentTotals?.shortvideo_count ?? null, previousTotals?.shortvideo_count ?? null),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_count ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_count ?? null),
      format: 'integer',
    },
    {
      key: 'shortvideo_gmv',
      label: '用户支付金额',
      value: formatCompactWanCurrency(currentGmv),
      wow: calculateRateChange(currentGmv, previousGmv),
      currentRaw: currentGmv,
      previousRaw: previousGmv,
      format: 'currency',
    },
    {
      key: 'shortvideo_gsv',
      label: '用户支付金额 - 退款金额',
      value: formatCompactWanCurrency(currentGsv),
      wow: calculateRateChange(currentGsv, previousGsv),
      currentRaw: currentGsv,
      previousRaw: previousGsv,
      format: 'currency',
    },
    {
      key: 'video_view_count',
      label: '观看次数',
      value: formatCompactWanInteger(currentTotals?.video_view_count ?? null),
      wow: calculateRateChange(currentTotals?.video_view_count ?? null, previousTotals?.video_view_count ?? null),
      currentRaw: toSortableNumber(currentTotals?.video_view_count ?? null),
      previousRaw: toSortableNumber(previousTotals?.video_view_count ?? null),
      format: 'integer',
    },
    {
      key: 'shortvideo_refund_amount',
      label: '退款金额',
      value: formatCompactWanCurrency(currentTotals?.shortvideo_refund_amount ?? null),
      wow: calculateRateChange(
        currentTotals?.shortvideo_refund_amount ?? null,
        previousTotals?.shortvideo_refund_amount ?? null
      ),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_refund_amount ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_refund_amount ?? null),
      format: 'currency',
    },
    {
      key: 'shortvideo_live_room_pay_amount',
      label: '引流直播间用户支付金额',
      value: formatCompactWanCurrency(currentTotals?.shortvideo_live_room_pay_amount ?? null),
      wow: calculateRateChange(
        currentTotals?.shortvideo_live_room_pay_amount ?? null,
        previousTotals?.shortvideo_live_room_pay_amount ?? null
      ),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_live_room_pay_amount ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_live_room_pay_amount ?? null),
      format: 'currency',
    },
    {
      key: 'shortvideo_search_after_view_pay_amount',
      label: '看后搜用户支付金额',
      value: formatCompactWanCurrency(currentTotals?.shortvideo_search_after_view_pay_amount ?? null),
      wow: calculateRateChange(
        currentTotals?.shortvideo_search_after_view_pay_amount ?? null,
        previousTotals?.shortvideo_search_after_view_pay_amount ?? null
      ),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_search_after_view_pay_amount ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_search_after_view_pay_amount ?? null),
      format: 'currency',
    },
    {
      key: 'shortvideo_shop_page_pay_amount',
      label: '引流店铺页用户支付金额',
      value: formatCompactWanCurrency(currentTotals?.shortvideo_shop_page_pay_amount ?? null),
      wow: calculateRateChange(
        currentTotals?.shortvideo_shop_page_pay_amount ?? null,
        previousTotals?.shortvideo_shop_page_pay_amount ?? null
      ),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_shop_page_pay_amount ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_shop_page_pay_amount ?? null),
      format: 'currency',
    },
    {
      key: 'shortvideo_refund_rate',
      label: '退款率',
      value: formatTableRate(currentTotals?.shortvideo_refund_rate ?? null),
      wow: calculateRateChange(currentTotals?.shortvideo_refund_rate ?? null, previousTotals?.shortvideo_refund_rate ?? null),
      currentRaw: toSortableNumber(currentTotals?.shortvideo_refund_rate ?? null),
      previousRaw: toSortableNumber(previousTotals?.shortvideo_refund_rate ?? null),
      format: 'rate',
    },
  ];
}
