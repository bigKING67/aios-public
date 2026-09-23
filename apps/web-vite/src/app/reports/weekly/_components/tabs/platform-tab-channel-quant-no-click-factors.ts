import type {
  ChannelQuantFactorValue,
  ChannelQuantTotals,
} from './platform-tab-channel-quant-types';

export function buildChannelQuantNoClickFactorValues({
  currVisitorCount,
  prevVisitorCount,
  currCartCount,
  prevCartCount,
  currPayBuyerCount,
  prevPayBuyerCount,
  currPayAmount,
  prevPayAmount,
}: ChannelQuantTotals): ChannelQuantFactorValue[] {
  return [
    {
      bucket: 'visitor',
      factorKey: 'visitor',
      factorLabel: '访客',
      currValue: currVisitorCount,
      prevValue: prevVisitorCount,
    },
    {
      bucket: 'clickToCart',
      factorKey: 'click_to_cart_rate',
      factorLabel: '点击加购率',
      currValue: currVisitorCount > 0 ? currCartCount / currVisitorCount : 0,
      prevValue: prevVisitorCount > 0 ? prevCartCount / prevVisitorCount : 0,
    },
    {
      bucket: 'cartToPay',
      factorKey: 'cart_to_pay_rate',
      factorLabel: '加购转化率',
      currValue: currCartCount > 0 ? currPayBuyerCount / currCartCount : 0,
      prevValue: prevCartCount > 0 ? prevPayBuyerCount / prevCartCount : 0,
    },
    {
      bucket: 'avgOrderValue',
      factorKey: 'avg_order_value',
      factorLabel: '客单价',
      currValue: currPayBuyerCount > 0 ? currPayAmount / currPayBuyerCount : 0,
      prevValue: prevPayBuyerCount > 0 ? prevPayAmount / prevPayBuyerCount : 0,
    },
  ];
}
