import {
  formatCompactWanCurrency,
  formatCompactWanInteger,
  formatTableRate,
} from './dashboard-formatters';
import type { NumericInput } from './dashboard-formatters';
import { calculateRateChange } from './dashboard-metric-card-calculations';
import { toSortableNumber } from './dashboard-sorters';
import type {
  DashboardGoodsCardTotals,
  LiveMetricCard,
} from './dashboard-types';

const GOODS_CARD_GMV_TOOLTIP =
  '统计周期内，商品卡载体支付成功订单带来的成交金额，未剔除退款。';

const GOODS_CARD_USER_PAY_AMOUNT_TOOLTIP =
  '统计周期内，商品卡明细表中的用户实际支付金额，未剔除退款。';

const GOODS_CARD_GSV_PAY_TIME_TOOLTIP =
  'GSV（支付时间）= GMV - 退款金额（支付时间），退款按原订单支付日期归属统计周期。';

const GOODS_CARD_REFUND_RATE_PAY_TIME_TOOLTIP =
  '退款率（支付时间）= 退款金额（支付时间） / GMV。';

type GoodsCardMetricConfig = {
  key: keyof DashboardGoodsCardTotals;
  label: string;
  format: LiveMetricCard['format'];
  tooltip?: string;
};

const GOODS_CARD_METRIC_CONFIGS: GoodsCardMetricConfig[] = [
  {
    key: 'card_trade_amount',
    label: 'GMV',
    format: 'currency',
    tooltip: GOODS_CARD_GMV_TOOLTIP,
  },
  {
    key: 'card_user_pay_amount',
    label: '用户支付金额',
    format: 'currency',
    tooltip: GOODS_CARD_USER_PAY_AMOUNT_TOOLTIP,
  },
  {
    key: 'card_gsv_pay_time',
    label: 'GSV（支付时间）',
    format: 'currency',
    tooltip: GOODS_CARD_GSV_PAY_TIME_TOOLTIP,
  },
  {
    key: 'card_refund_rate_pay_time',
    label: '退款率（支付时间）',
    format: 'rate',
    tooltip: GOODS_CARD_REFUND_RATE_PAY_TIME_TOOLTIP,
  },
  { key: 'first_buy_new_rate', label: '首购新客占比', format: 'rate' },
  { key: 'rebuy_old_rate', label: '复购老客占比', format: 'rate' },
  { key: 'card_exposure_user_count', label: '商品卡曝光人数', format: 'integer' },
  { key: 'card_click_rate_user', label: '商品卡点击率（人数）', format: 'rate' },
  { key: 'card_click_to_pay_rate_user', label: '商品卡点击-成交率（人数）', format: 'rate' },
  { key: 'card_order_count', label: '商品卡成交订单数', format: 'integer' },
  { key: 'card_buyer_count', label: '商品卡成交人数', format: 'integer' },
  { key: 'card_cart_user_count', label: '商品卡加购人数', format: 'integer' },
];

function getGoodsCardMetricValue(
  totals: DashboardGoodsCardTotals | null,
  key: keyof DashboardGoodsCardTotals
): NumericInput {
  return totals?.[key] ?? null;
}

function formatGoodsCardMetricValue(value: NumericInput, format: LiveMetricCard['format']): string {
  if (format === 'currency') {
    return formatCompactWanCurrency(value);
  }
  if (format === 'rate') {
    return formatTableRate(value);
  }
  return formatCompactWanInteger(value);
}

export function buildDashboardGoodsCardMetricCards(
  currentTotals: DashboardGoodsCardTotals | null,
  previousTotals: DashboardGoodsCardTotals | null
): LiveMetricCard[] {
  return GOODS_CARD_METRIC_CONFIGS.map((metric) => {
    const currentValue = getGoodsCardMetricValue(currentTotals, metric.key);
    const previousValue = getGoodsCardMetricValue(previousTotals, metric.key);

    return {
      key: metric.key,
      label: metric.label,
      tooltip: metric.tooltip,
      value: formatGoodsCardMetricValue(currentValue, metric.format),
      wow: calculateRateChange(currentValue, previousValue),
      currentRaw: toSortableNumber(currentValue),
      previousRaw: toSortableNumber(previousValue),
      format: metric.format,
    };
  });
}
