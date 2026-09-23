import { buildChannelQuantReasonAndAction } from './platform-tab-diagnostics';
import {
  calcChangePercent,
  resolveTrafficChannelLabel,
} from './platform-tab-formatters';
import type {
  ChannelQuantContext,
  ChannelQuantFactorValue,
} from './platform-tab-channel-quant-types';
import type { FunnelChannelRow, QuantAttributionRow } from './platform-tab-types';

interface BuildChannelQuantRowParams {
  factor: ChannelQuantFactorValue;
  template: QuantAttributionRow | undefined;
  contributionValue: number;
  payAmountDelta: number;
  channelRows: FunnelChannelRow[];
  channelContext?: ChannelQuantContext;
}

export function buildChannelQuantRow({
  factor,
  template,
  contributionValue,
  payAmountDelta,
  channelRows,
  channelContext,
}: BuildChannelQuantRowParams): QuantAttributionRow {
  const derivedChannelKey =
    channelContext?.channelKey || channelRows[0]?.trafficChannel || 'unknown';
  const derivedChannelLabel =
    channelContext?.channelLabel ||
    channelRows[0]?.trafficChannelLabel ||
    resolveTrafficChannelLabel(derivedChannelKey);
  const quantCopy = buildChannelQuantReasonAndAction({
    bucket: factor.bucket,
    lnContribution: contributionValue,
    channelKey: derivedChannelKey,
    channelLabel: derivedChannelLabel,
    fallbackReason: template?.reason,
    fallbackAction: template?.action,
  });
  const factorKey =
    factor.bucket === 'visitor' ? 'visitor' : template?.factorKey || factor.factorKey;
  const factorLabel =
    factor.bucket === 'visitor' ? '访客' : template?.factorLabel || factor.factorLabel;

  return {
    rowId: factor.bucket,
    factorKey,
    factorLabel,
    currValue: factor.currValue,
    prevValue: factor.prevValue,
    changeRate: calcChangePercent(factor.currValue, factor.prevValue),
    lnContribution: contributionValue,
    contributionRate:
      Math.abs(payAmountDelta) > Number.EPSILON
        ? (contributionValue / payAmountDelta) * 100
        : 0,
    effect: contributionValue >= 0 ? '拉动' : '拖累',
    reason: quantCopy.reason,
    action: quantCopy.action,
    priority: template?.priority || 'P1',
  };
}
