import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

import {
  PLATFORM_TABS,
  TAB_TO_QUERY_PLATFORM,
} from './dashboard-config';
import type { DateMode, QueryPlatform } from './dashboard-config';
import { formatTrendLabelByMode } from './dashboard-date-range';
import {
  toCompactNumber,
  toIntegerNumber,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import {
  buildTrendLabels,
  calculatePeriodChange,
  getSeriesGsvPayTimeCurrent,
  resolveNumericMetric,
  toSafeNumber,
} from './dashboard-overview-snapshot-calculations';
import type {
  DashboardOverviewApiResponse,
  DashboardOverviewCarrierKey,
  DashboardSnapshot,
  FunnelItem,
  MetricCard,
  PlatformCompareItem,
  ShareItem,
  SpotlightMetric,
} from './dashboard-types';

const GMV_TOOLTIP =
  '统计周期内，支付成功订单带来的商家收入总额（未剔除退款）。成交金额=用户支付金额+智能优惠券+平台补贴+达人补贴+预售定金。';

const USER_PAY_AMOUNT_TOOLTIP =
  '统计周期内，支付成功订单中，支付成功订单中用户实际支付的部分（含货到付款），不含平台补贴、智能优惠券、达人补贴等补贴金额。';

const XHS_GMV_TOOLTIP =
  '统计时间（订单支付时间）内，支付订单的总金额，包括买家实付金额和平台优惠，未剔除退款金额。预售阶段，在付清尾款当日，将定金和尾款一同计入支付金额。';

const XHS_USER_PAY_AMOUNT_TOOLTIP =
  '统计时间（订单支付时间）内，买家商品实际支付 + 运费金额，不含平台优惠。未剔除退款金额。预售阶段，在付清尾款当日，将定金和尾款一同计入用户支付金额。';

const REFUND_RATE_PAY_TIME_TOOLTIP = '退款率（支付时间）= 当前退款金额（支付时间） / GMV。';

const CARRIER_CARD_ORDER: Record<DashboardOverviewCarrierKey, number> = {
  live: 0,
  short_video: 1,
  product_card: 2,
  image_text: 3,
  other: 4,
};

function resolveBusinessAmountTooltips(platform: QueryPlatform): {
  gmv: string;
  userPayAmount: string;
} {
  if (platform === 'xhs') {
    return {
      gmv: XHS_GMV_TOOLTIP,
      userPayAmount: XHS_USER_PAY_AMOUNT_TOOLTIP,
    };
  }

  return {
    gmv: GMV_TOOLTIP,
    userPayAmount: USER_PAY_AMOUNT_TOOLTIP,
  };
}

type BusinessMonthlyTrendBucket = {
  monthToken: string;
  label: string;
  gmv: number;
  userPayAmount: number;
  gsv: number;
  refundAmountCurrent: number;
};

export function formatTrend(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function normalizeCarrierCards(
  carrierCards: DashboardOverviewApiResponse['carrierCards']
): MetricCard[] {
  if (!Array.isArray(carrierCards)) {
    return [];
  }

  return [...carrierCards]
    .sort((left, right) => CARRIER_CARD_ORDER[left.key] - CARRIER_CARD_ORDER[right.key])
    .map((item) => {
      const currentTradeAmount = toSafeNumber(item.trade_amount);
      const previousTradeAmount = toSafeNumber(item.previous_trade_amount);
      const change = hasMetricInputValue(item.change_rate)
        ? toSafeNumber(item.change_rate)
        : calculatePeriodChange(currentTradeAmount, previousTradeAmount);

      return {
        key: `carrier-${item.key}`,
        label: item.label || `${item.carrier_type}成交金额`,
        value: `¥${toCompactNumber(currentTradeAmount)}`,
        change,
      };
    });
}

function hasMetricInputValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function getSeriesUserPayAmount(row: { user_pay_amount?: unknown }): number {
  return toSafeNumber(row.user_pay_amount as NumericInput);
}

function getSeriesRefundAmountPayTimeCurrent(row: { refund_amount_pay_time_current?: unknown }): number {
  return toSafeNumber(row.refund_amount_pay_time_current as NumericInput);
}

function getSeriesRefundRatePayTimeCurrent(row: {
  gmv?: unknown;
  refund_amount_pay_time_current?: unknown;
  refund_rate_pay_time_current?: unknown;
  refund_rate?: unknown;
}): number {
  if (hasMetricInputValue(row.refund_rate_pay_time_current)) {
    return toSafeNumber(row.refund_rate_pay_time_current as NumericInput);
  }
  if (hasMetricInputValue(row.refund_rate)) {
    return toSafeNumber(row.refund_rate as NumericInput);
  }

  const gmv = toSafeNumber(row.gmv as NumericInput);
  const refundAmount = getSeriesRefundAmountPayTimeCurrent(row);
  if (gmv <= 0) {
    return 0;
  }
  return refundAmount / gmv;
}

function aggregateBusinessSeriesByMonth(
  series: DashboardOverviewApiResponse['currentSeries']
): BusinessMonthlyTrendBucket[] {
  const monthBuckets = new Map<string, BusinessMonthlyTrendBucket & { monthStart: Dayjs }>();

  for (const row of series) {
    const date = dayjs(row.date);
    if (!date.isValid()) {
      continue;
    }

    const monthStart = date.startOf('month');
    const key = monthStart.format('YYYY-MM');
    const current = monthBuckets.get(key);
    if (current) {
      current.gmv += toSafeNumber(row.gmv);
      current.userPayAmount += getSeriesUserPayAmount(row);
      current.gsv += getSeriesGsvPayTimeCurrent(row);
      current.refundAmountCurrent += getSeriesRefundAmountPayTimeCurrent(row);
    } else {
      monthBuckets.set(key, {
        monthStart,
        monthToken: monthStart.format('MM'),
        label: monthStart.format('MM月'),
        gmv: toSafeNumber(row.gmv),
        userPayAmount: getSeriesUserPayAmount(row),
        gsv: getSeriesGsvPayTimeCurrent(row),
        refundAmountCurrent: getSeriesRefundAmountPayTimeCurrent(row),
      });
    }
  }

  return Array.from(monthBuckets.values()).sort(
    (left, right) => left.monthStart.valueOf() - right.monthStart.valueOf()
  );
}

export function createSnapshot(
  mode: DateMode,
  customRange: [Dayjs, Dayjs]
): DashboardSnapshot {
  const trendLabels = buildTrendLabels(mode, customRange);
  const zeroSeries = trendLabels.map(() => 0);

  const spotlight: SpotlightMetric[] = [
    {
      key: 'gmv',
      heading: 'GMV',
      label: '交易总额',
      tooltip: GMV_TOOLTIP,
      value: 0,
      displayValue: '¥0',
      change: 0,
      trend: zeroSeries,
    },
    {
      key: 'user-pay-amount',
      heading: '用户支付金额',
      label: '实际支付（不含补贴）',
      tooltip: USER_PAY_AMOUNT_TOOLTIP,
      value: 0,
      displayValue: '¥0',
      change: 0,
      trend: zeroSeries,
    },
    {
      key: 'gsv',
      heading: 'GSV',
      label: '净成交额（支付时间）',
      value: 0,
      displayValue: '¥0',
      change: 0,
      trend: zeroSeries,
    },
    {
      key: 'refund-rate',
      heading: '退款率（支付时间）',
      label: '',
      tooltip: REFUND_RATE_PAY_TIME_TOOLTIP,
      value: 0,
      displayValue: '0.00%',
      change: 0,
      trend: zeroSeries,
    },
  ];

  return {
    spotlight,
    metrics: [],
    carrierCards: [],
    trendLabels,
    trendCurrent: zeroSeries,
    trendPrevious: zeroSeries,
    trendRows: [],
    share: [],
    platformCompare: [],
    funnel: [],
  };
}

export function buildSnapshotFromOverviewData(
  overview: DashboardOverviewApiResponse,
  dateMode: DateMode
): DashboardSnapshot {
  const currentSeries = Array.isArray(overview.currentSeries) ? overview.currentSeries : [];
  const previousSeries = Array.isArray(overview.previousSeries) ? overview.previousSeries : [];

  let trendLabels: string[];
  let trendCurrent: number[];
  let trendPrevious: number[];
  let userPayAmountTrendCurrent: number[];
  let gsvTrendCurrent: number[];
  let refundRateTrend: number[];

  if (dateMode === 'year') {
    const monthlyCurrent = aggregateBusinessSeriesByMonth(currentSeries);
    const monthlyPrevious = aggregateBusinessSeriesByMonth(previousSeries);
    const previousByMonthToken = new Map(monthlyPrevious.map((item) => [item.monthToken, item]));

    trendLabels = monthlyCurrent.map((item) => item.label);
    trendCurrent = monthlyCurrent.map((item) => Number(item.gmv.toFixed(2)));
    trendPrevious = monthlyCurrent.map((item) =>
      Number((previousByMonthToken.get(item.monthToken)?.gmv || 0).toFixed(2))
    );
    userPayAmountTrendCurrent = monthlyCurrent.map((item) => Number(item.userPayAmount.toFixed(2)));
    gsvTrendCurrent = monthlyCurrent.map((item) => Number(item.gsv.toFixed(2)));
    refundRateTrend = monthlyCurrent.map((item) =>
      item.gmv > 0 ? Number(((item.refundAmountCurrent / item.gmv) * 100).toFixed(2)) : 0
    );
  } else {
    trendLabels = currentSeries.map((item) => formatTrendLabelByMode(item.date, dateMode));
    trendCurrent = currentSeries.map((item) => toSafeNumber(item.gmv));
    trendPrevious = previousSeries.map((item) => toSafeNumber(item.gmv));
    userPayAmountTrendCurrent = currentSeries.map((item) => getSeriesUserPayAmount(item));
    gsvTrendCurrent = currentSeries.map((item) => getSeriesGsvPayTimeCurrent(item));
    refundRateTrend = currentSeries.map((item) => Number((getSeriesRefundRatePayTimeCurrent(item) * 100).toFixed(2)));
  }

  const currentTotals = overview.currentTotals || {
    gmv: 0,
    user_pay_amount: 0,
    gsv_pay_time_current: 0,
    gsv_pay_time_predicted: 0,
    gsv_refund_time: 0,
    refund_amount_pay_time_current: 0,
    refund_amount_pay_time_predicted: 0,
    refund_amount_refund_time: 0,
    refund_rate_pay_time_current: 0,
    refund_rate_pay_time_predicted: 0,
    refund_rate_refund_time: 0,
    gsv: 0,
    order_count: 0,
    buyer_count: 0,
    arpu: 0,
    refund_rate: 0,
  };
  const previousTotals = overview.previousTotals || {
    gmv: 0,
    user_pay_amount: 0,
    gsv_pay_time_current: 0,
    gsv_pay_time_predicted: 0,
    gsv_refund_time: 0,
    refund_amount_pay_time_current: 0,
    refund_amount_pay_time_predicted: 0,
    refund_amount_refund_time: 0,
    refund_rate_pay_time_current: 0,
    refund_rate_pay_time_predicted: 0,
    refund_rate_refund_time: 0,
    gsv: 0,
    order_count: 0,
    buyer_count: 0,
    arpu: 0,
    refund_rate: 0,
  };

  const gmvCurrent = toSafeNumber(currentTotals.gmv);
  const gmvPrevious = toSafeNumber(previousTotals.gmv);
  const userPayAmountCurrent = toSafeNumber(currentTotals.user_pay_amount);
  const userPayAmountPrevious = toSafeNumber(previousTotals.user_pay_amount);
  const gsvCurrent = resolveNumericMetric(currentTotals.gsv_pay_time_current, currentTotals.gsv);
  const gsvPrevious = resolveNumericMetric(previousTotals.gsv_pay_time_current, previousTotals.gsv);
  const refundAmountPayCurrent = toSafeNumber(currentTotals.refund_amount_pay_time_current);
  const refundAmountPayPrevious = toSafeNumber(previousTotals.refund_amount_pay_time_current);
  const refundAmountPredictedCurrent = toSafeNumber(currentTotals.refund_amount_pay_time_predicted);
  const refundAmountPredictedPrevious = toSafeNumber(previousTotals.refund_amount_pay_time_predicted);
  const refundAmountRefundTimeCurrent = toSafeNumber(currentTotals.refund_amount_refund_time);
  const refundAmountRefundTimePrevious = toSafeNumber(previousTotals.refund_amount_refund_time);
  const orderCountCurrent = toSafeNumber(currentTotals.order_count);
  const orderCountPrevious = toSafeNumber(previousTotals.order_count);
  const buyerCountCurrent = toSafeNumber(currentTotals.buyer_count);
  const buyerCountPrevious = toSafeNumber(previousTotals.buyer_count);
  const arpuCurrent = toSafeNumber(currentTotals.arpu);
  const arpuPrevious = toSafeNumber(previousTotals.arpu);
  const refundRateCurrent = resolveNumericMetric(
    currentTotals.refund_rate_pay_time_current,
    currentTotals.refund_rate
  ) * 100;
  const refundRatePrevious = resolveNumericMetric(
    previousTotals.refund_rate_pay_time_current,
    previousTotals.refund_rate
  ) * 100;
  const amountTooltips = resolveBusinessAmountTooltips(overview.platform);

  const spotlight: SpotlightMetric[] = [
    {
      key: 'gmv',
      heading: 'GMV',
      label: '交易总额',
      tooltip: amountTooltips.gmv,
      value: gmvCurrent,
      displayValue: `¥${toCompactNumber(gmvCurrent)}`,
      change: calculatePeriodChange(gmvCurrent, gmvPrevious),
      trend: trendCurrent,
    },
    {
      key: 'user-pay-amount',
      heading: '用户支付金额',
      label: '实际支付（不含补贴）',
      tooltip: amountTooltips.userPayAmount,
      value: userPayAmountCurrent,
      displayValue: `¥${toCompactNumber(userPayAmountCurrent)}`,
      change: calculatePeriodChange(userPayAmountCurrent, userPayAmountPrevious),
      trend: userPayAmountTrendCurrent,
    },
    {
      key: 'gsv',
      heading: 'GSV',
      label: '净成交额（支付时间）',
      value: gsvCurrent,
      displayValue: `¥${toCompactNumber(gsvCurrent)}`,
      change: calculatePeriodChange(gsvCurrent, gsvPrevious),
      trend: gsvTrendCurrent,
    },
    {
      key: 'refund-rate',
      heading: '退款率（支付时间）',
      label: '',
      tooltip: REFUND_RATE_PAY_TIME_TOOLTIP,
      value: refundRateCurrent,
      displayValue: `${refundRateCurrent.toFixed(2)}%`,
      change: calculatePeriodChange(refundRateCurrent, refundRatePrevious),
      trend: refundRateTrend,
    },
  ];

  const metrics: MetricCard[] = [
    {
      key: 'order-count',
      label: '订单量',
      value: toCompactNumber(orderCountCurrent),
      change: calculatePeriodChange(orderCountCurrent, orderCountPrevious),
    },
    {
      key: 'buyer-count',
      label: '成交人数',
      value: toCompactNumber(buyerCountCurrent),
      change: calculatePeriodChange(buyerCountCurrent, buyerCountPrevious),
    },
    {
      key: 'arpu',
      label: '客单价',
      value: `¥${toIntegerNumber(arpuCurrent)}`,
      change: calculatePeriodChange(arpuCurrent, arpuPrevious),
    },
    {
      key: 'refund-amount-pay-current',
      label: '当前退款金额（支付时间）',
      value: `¥${toCompactNumber(refundAmountPayCurrent)}`,
      change: calculatePeriodChange(refundAmountPayCurrent, refundAmountPayPrevious),
    },
    {
      key: 'refund-amount-refund-time',
      label: '退款金额（退款时间）',
      value: `¥${toCompactNumber(refundAmountRefundTimeCurrent)}`,
      change: calculatePeriodChange(refundAmountRefundTimeCurrent, refundAmountRefundTimePrevious),
    },
    {
      key: 'refund-amount-pay-predicted',
      label: '预测全部退款金额（支付时间）',
      value: `¥${toCompactNumber(refundAmountPredictedCurrent)}`,
      change: calculatePeriodChange(refundAmountPredictedCurrent, refundAmountPredictedPrevious),
    },
  ];
  const carrierCards = overview.platform === 'douyin' ? normalizeCarrierCards(overview.carrierCards) : [];

  const platformCurrentMap = new Map<string, { gmv: number; gsv: number }>();
  for (const item of overview.platformCurrent || []) {
    platformCurrentMap.set(item.platform, {
      gmv: toSafeNumber(item.gmv),
      gsv: toSafeNumber(item.gsvPayTimeCurrent),
    });
  }

  const platformCompare: PlatformCompareItem[] = PLATFORM_TABS.slice(1).map((item) => {
    const platformCode = TAB_TO_QUERY_PLATFORM[item.key];
    const contribution = platformCode === 'overview'
      ? undefined
      : platformCurrentMap.get(platformCode);
    return {
      name: item.label,
      gmv: contribution?.gmv || 0,
      gsv: contribution?.gsv || 0,
    };
  });

  const share: ShareItem[] = platformCompare.map((item) => ({
    name: item.name,
    gmv: item.gmv,
    gsv: item.gsv,
  }));

  const funnel: FunnelItem[] = [
    { stage: 'GMV', value: Math.round(gmvCurrent) },
    { stage: '用户支付金额', value: Math.round(userPayAmountCurrent) },
    { stage: 'GSV（支付时间）', value: Math.round(gsvCurrent) },
    { stage: '预测全部退款金额（支付时间）', value: Math.round(refundAmountPredictedCurrent) },
    { stage: '退款金额（退款时间）', value: Math.round(refundAmountRefundTimeCurrent) },
    { stage: '订单量', value: Math.round(orderCountCurrent) },
    { stage: '成交人数', value: Math.round(buyerCountCurrent) },
  ];

  const normalizedTrendPrevious = trendLabels.map((_, index) => trendPrevious[index] || 0);

  return {
    spotlight,
    metrics,
    carrierCards,
    trendLabels,
    trendCurrent,
    trendPrevious: normalizedTrendPrevious,
    trendRows: currentSeries,
    share,
    platformCompare,
    funnel,
  };
}
