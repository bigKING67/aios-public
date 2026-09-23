import {
  calcChangePercent,
  formatCurrencyCompact,
  formatInteger,
} from './platform-tab-formatters';
import type { PlatformMetricCard } from './platform-tab-metric-types';
import type { BuildPrimaryBaseMetricsParams } from './platform-tab-primary-metric-types';

export function buildPrimaryBaseMetrics({
  gmv,
  prevGmv,
  gsvValue,
  prevGsv,
  refundAmount,
  prevRefundAmount,
  buyerCount,
  prevBuyerCount,
  arpu,
  prevArpu,
  orders,
  prevOrders,
}: BuildPrimaryBaseMetricsParams): PlatformMetricCard[] {
  return [
    {
      key: 'gmv',
      label: 'GMV',
      value: formatCurrencyCompact(gmv),
      wow: prevGmv !== undefined ? calcChangePercent(gmv, prevGmv) : undefined,
    },
    {
      key: 'gsv',
      label: 'GSV',
      value: formatCurrencyCompact(gsvValue),
      wow:
        gsvValue !== undefined && prevGsv !== undefined
          ? calcChangePercent(gsvValue, prevGsv)
          : undefined,
    },
    {
      key: 'refund',
      label: '退款金额（退款时间）',
      value: formatCurrencyCompact(refundAmount),
      wow:
        refundAmount !== undefined && prevRefundAmount !== undefined
          ? calcChangePercent(refundAmount, prevRefundAmount)
          : undefined,
    },
    {
      key: 'buyer',
      label: '成交用户',
      value: formatInteger(buyerCount),
      wow:
        buyerCount !== undefined && prevBuyerCount !== undefined
          ? calcChangePercent(buyerCount, prevBuyerCount)
          : undefined,
    },
    {
      key: 'arpu',
      label: '客单价',
      value: formatCurrencyCompact(arpu),
      wow:
        arpu !== undefined && prevArpu !== undefined
          ? calcChangePercent(arpu, prevArpu)
          : undefined,
    },
    {
      key: 'orders',
      label: '订单量',
      value: formatInteger(orders),
      wow: prevOrders !== undefined ? calcChangePercent(orders, prevOrders) : undefined,
    },
  ];
}
