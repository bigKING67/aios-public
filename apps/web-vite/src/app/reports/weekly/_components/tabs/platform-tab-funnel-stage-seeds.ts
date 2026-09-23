import type { FunnelStageSeed } from './platform-tab-funnel-stage-points';
import type { FunnelChannelRow } from './platform-tab-types';

export type { FunnelStageSeed } from './platform-tab-funnel-stage-points';

function sumFunnelRows(
  rows: FunnelChannelRow[],
  selector: (row: FunnelChannelRow) => number
): number {
  return rows.reduce((sum, item) => sum + selector(item), 0);
}

function sumFunnelRowPair(
  rows: FunnelChannelRow[],
  currSelector: (row: FunnelChannelRow) => number,
  prevSelector: (row: FunnelChannelRow) => number
): { current: number; previous: number } {
  return {
    current: sumFunnelRows(rows, currSelector),
    previous: sumFunnelRows(rows, prevSelector),
  };
}

function resolveStageConversionRate(
  numerator: number,
  denominator: number
): number | undefined {
  return denominator > 0 ? numerator / denominator : undefined;
}

export function buildClickFunnelStageSeeds(rows: FunnelChannelRow[]): FunnelStageSeed[] {
  const impressionCount = sumFunnelRowPair(
    rows,
    (item) => item.currImpressionCount,
    (item) => item.prevImpressionCount
  );
  const clickCount = sumFunnelRowPair(
    rows,
    (item) => item.currClickCount,
    (item) => item.prevClickCount
  );
  const cartCount = sumFunnelRowPair(
    rows,
    (item) => item.currCartCount,
    (item) => item.prevCartCount
  );
  const payBuyerCount = sumFunnelRowPair(
    rows,
    (item) => item.currPayBuyerCount,
    (item) => item.prevPayBuyerCount
  );

  return [
    {
      key: 'impression',
      label: '曝光',
      value: impressionCount.current,
      prevValue: impressionCount.previous,
    },
    {
      key: 'click',
      label: '点击',
      value: clickCount.current,
      prevValue: clickCount.previous,
      conversionLabel: '点击率',
      conversionRate: resolveStageConversionRate(clickCount.current, impressionCount.current),
      conversionPrevRate: resolveStageConversionRate(clickCount.previous, impressionCount.previous),
    },
    {
      key: 'cart',
      label: '加购',
      value: cartCount.current,
      prevValue: cartCount.previous,
      conversionLabel: '点击加购率',
      conversionRate: resolveStageConversionRate(cartCount.current, clickCount.current),
      conversionPrevRate: resolveStageConversionRate(cartCount.previous, clickCount.previous),
    },
    {
      key: 'pay',
      label: '支付人数',
      value: payBuyerCount.current,
      prevValue: payBuyerCount.previous,
      conversionLabel: '加购转化率',
      conversionRate: resolveStageConversionRate(payBuyerCount.current, cartCount.current),
      conversionPrevRate: resolveStageConversionRate(payBuyerCount.previous, cartCount.previous),
    },
  ];
}

export function buildNoClickFunnelStageSeeds(rows: FunnelChannelRow[]): FunnelStageSeed[] {
  const visitorCount = sumFunnelRowPair(
    rows,
    (item) => item.currVisitorCount ?? item.currImpressionCount,
    (item) => item.prevVisitorCount ?? item.prevImpressionCount
  );
  const cartCount = sumFunnelRowPair(
    rows,
    (item) => item.currCartCount,
    (item) => item.prevCartCount
  );
  const payBuyerCount = sumFunnelRowPair(
    rows,
    (item) => item.currPayBuyerCount,
    (item) => item.prevPayBuyerCount
  );

  return [
    {
      key: 'visitor',
      label: '访客',
      value: visitorCount.current,
      prevValue: visitorCount.previous,
    },
    {
      key: 'cart',
      label: '加购',
      value: cartCount.current,
      prevValue: cartCount.previous,
      conversionLabel: '访客加购率',
      conversionRate: resolveStageConversionRate(cartCount.current, visitorCount.current),
      conversionPrevRate: resolveStageConversionRate(cartCount.previous, visitorCount.previous),
    },
    {
      key: 'pay',
      label: '支付人数',
      value: payBuyerCount.current,
      prevValue: payBuyerCount.previous,
      conversionLabel: '加购转化率',
      conversionRate: resolveStageConversionRate(payBuyerCount.current, cartCount.current),
      conversionPrevRate: resolveStageConversionRate(payBuyerCount.previous, cartCount.previous),
    },
  ];
}
