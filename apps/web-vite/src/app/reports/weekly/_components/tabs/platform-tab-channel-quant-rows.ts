import { alignChannelQuantShapleyContributions } from './platform-tab-channel-quant-alignment';
import {
  aggregateChannelQuantTotals,
  buildChannelQuantFactorValues,
} from './platform-tab-channel-quant-factors';
import { buildChannelQuantRow } from './platform-tab-channel-quant-row-builder';
import { buildChannelQuantTemplateResolver } from './platform-tab-channel-quant-template-resolver';
import type { ChannelQuantContext } from './platform-tab-channel-quant-types';
import type { FunnelChannelRow, QuantAttributionRow } from './platform-tab-types';

export function buildChannelQuantRows(
  rows: QuantAttributionRow[],
  hasClickStage: boolean,
  channelRows: FunnelChannelRow[],
  channelContext?: ChannelQuantContext
): QuantAttributionRow[] {
  if (channelRows.length === 0) {
    return [];
  }

  const resolveTemplate = buildChannelQuantTemplateResolver(rows);
  const totals = aggregateChannelQuantTotals(channelRows);
  const factorValues = buildChannelQuantFactorValues(totals, hasClickStage);
  const payAmountDelta = totals.currPayAmount - totals.prevPayAmount;
  const alignedContributions = alignChannelQuantShapleyContributions(
    factorValues,
    payAmountDelta
  );

  return factorValues.map((factor, index) => {
    const template = resolveTemplate(factor.bucket);
    const contributionValue = alignedContributions[index] ?? 0;
    return buildChannelQuantRow({
      factor,
      template,
      contributionValue,
      payAmountDelta,
      channelRows,
      channelContext,
    });
  });
}
