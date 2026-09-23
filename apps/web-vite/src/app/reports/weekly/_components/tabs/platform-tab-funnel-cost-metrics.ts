import { resolveFunnelRate } from './platform-tab-funnel-rate-fallbacks';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

export type FunnelCostMetrics = Pick<
  FunnelChannelRow,
  | 'currAvgClickCost'
  | 'prevAvgClickCost'
  | 'currCpm'
  | 'prevCpm'
  | 'currClickConversionRate'
  | 'prevClickConversionRate'
>;

export function resolveFunnelAvgClickCost(
  explicitValue: unknown,
  cost: number,
  clickCount: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, cost, clickCount);
}

export function resolveFunnelCpm(
  explicitValue: unknown,
  cost: number,
  impressionCount: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, cost * 1000, impressionCount);
}

export function resolveFunnelClickConversionRate(
  explicitValue: unknown,
  payBuyerCount: number,
  clickCount: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, payBuyerCount, clickCount);
}

export function resolveFunnelCostMetrics(
  item: FunnelChannelItem,
  currCost: number,
  prevCost: number,
  currImpressionCount: number,
  prevImpressionCount: number,
  currClickCount: number,
  prevClickCount: number,
  currPayBuyerCount: number,
  prevPayBuyerCount: number,
): FunnelCostMetrics {
  return {
    currAvgClickCost: resolveFunnelAvgClickCost(
      item.curr_avg_click_cost,
      currCost,
      currClickCount,
    ),
    prevAvgClickCost: resolveFunnelAvgClickCost(
      item.prev_avg_click_cost,
      prevCost,
      prevClickCount,
    ),
    currCpm: resolveFunnelCpm(item.curr_cpm, currCost, currImpressionCount),
    prevCpm: resolveFunnelCpm(item.prev_cpm, prevCost, prevImpressionCount),
    currClickConversionRate: resolveFunnelClickConversionRate(
      item.curr_click_conversion_rate,
      currPayBuyerCount,
      currClickCount,
    ),
    prevClickConversionRate: resolveFunnelClickConversionRate(
      item.prev_click_conversion_rate,
      prevPayBuyerCount,
      prevClickCount,
    ),
  };
}
