import { buildChannelQuantClickFactorValues } from './platform-tab-channel-quant-click-factors';
import { buildChannelQuantNoClickFactorValues } from './platform-tab-channel-quant-no-click-factors';
import type { ChannelQuantFactorValue, ChannelQuantTotals } from './platform-tab-channel-quant-types';

export function buildChannelQuantFactorValues(
  totals: ChannelQuantTotals,
  hasClickStage: boolean
): ChannelQuantFactorValue[] {
  return hasClickStage
    ? buildChannelQuantClickFactorValues(totals)
    : buildChannelQuantNoClickFactorValues(totals);
}
