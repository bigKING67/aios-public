import { resolveChannelQuantType } from './platform-tab-channel-quant-type';
import {
  buildAvgOrderValueChannelQuantReasonAndAction,
  buildCartToPayChannelQuantReasonAndAction,
  buildClickToCartChannelQuantReasonAndAction,
} from './platform-tab-channel-conversion-diagnostics';
import { buildClickRateChannelQuantReasonAndAction } from './platform-tab-channel-click-rate-diagnostics';
import { buildDefaultChannelQuantReasonAndAction } from './platform-tab-channel-quant-fallback';
import { buildImpressionChannelQuantReasonAndAction } from './platform-tab-channel-impression-diagnostics';
import { buildVisitorChannelQuantReasonAndAction } from './platform-tab-channel-visitor-diagnostics';
import type {
  BuildChannelQuantReasonActionParams,
  ChannelQuantReasonAction,
} from './platform-tab-diagnostic-types';

export function buildChannelQuantReasonAndAction(
  params: BuildChannelQuantReasonActionParams
): ChannelQuantReasonAction {
  const {
    bucket,
    lnContribution,
    channelKey,
    channelLabel,
    fallbackReason,
    fallbackAction,
  } = params;
  const isNegative = lnContribution < 0;
  const channelType = resolveChannelQuantType(channelKey);
  const defaultFallback = buildDefaultChannelQuantReasonAndAction(
    channelLabel,
    fallbackReason,
    fallbackAction
  );

  if (bucket === 'other') {
    return defaultFallback;
  }

  switch (bucket) {
    case 'impression':
      return buildImpressionChannelQuantReasonAndAction(
        channelType,
        channelLabel,
        isNegative
      );
    case 'visitor':
      return buildVisitorChannelQuantReasonAndAction(
        channelType,
        channelLabel,
        isNegative
      );
    case 'clickRate':
      return buildClickRateChannelQuantReasonAndAction(
        channelType,
        channelLabel,
        isNegative
      );
    case 'clickToCart':
      return buildClickToCartChannelQuantReasonAndAction(channelLabel, isNegative);
    case 'cartToPay':
      return buildCartToPayChannelQuantReasonAndAction(channelLabel, isNegative);
    case 'avgOrderValue':
      return buildAvgOrderValueChannelQuantReasonAndAction(channelLabel, isNegative);
    default:
      return defaultFallback;
  }
}
