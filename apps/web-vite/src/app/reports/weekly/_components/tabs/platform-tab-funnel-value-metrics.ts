import {
  calcChangePercent,
  toSafeNumber,
} from './platform-tab-formatters';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';
import type { FunnelChannelRow } from './platform-tab-types';

export type FunnelValueMetrics = Pick<
  FunnelChannelRow,
  | 'currPayAmount'
  | 'prevPayAmount'
  | 'payAmountWoW'
  | 'currCost'
  | 'prevCost'
  | 'costWoW'
>;

export function resolveFunnelValueMetrics(item: FunnelChannelItem): FunnelValueMetrics {
  const currPayAmount = toSafeNumber(item.curr_pay_amount);
  const prevPayAmount = toSafeNumber(item.prev_pay_amount);
  const currCost = toSafeNumber(item.curr_cost);
  const prevCost = toSafeNumber(item.prev_cost);

  return {
    currPayAmount,
    prevPayAmount,
    payAmountWoW: calcChangePercent(currPayAmount, prevPayAmount),
    currCost,
    prevCost,
    costWoW: calcChangePercent(currCost, prevCost),
  };
}
