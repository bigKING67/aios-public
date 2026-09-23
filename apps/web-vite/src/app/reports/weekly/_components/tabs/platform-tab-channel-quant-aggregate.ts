import type { FunnelChannelRow } from './platform-tab-types';
import type { ChannelQuantTotals } from './platform-tab-channel-quant-types';

export function aggregateChannelQuantTotals(
  channelRows: FunnelChannelRow[]
): ChannelQuantTotals {
  return {
    currImpressionCount: channelRows.reduce(
      (sum, item) => sum + item.currImpressionCount,
      0
    ),
    prevImpressionCount: channelRows.reduce(
      (sum, item) => sum + item.prevImpressionCount,
      0
    ),
    currVisitorCount: channelRows.reduce(
      (sum, item) => sum + (item.currVisitorCount ?? item.currImpressionCount),
      0
    ),
    prevVisitorCount: channelRows.reduce(
      (sum, item) => sum + (item.prevVisitorCount ?? item.prevImpressionCount),
      0
    ),
    currClickCount: channelRows.reduce((sum, item) => sum + item.currClickCount, 0),
    prevClickCount: channelRows.reduce((sum, item) => sum + item.prevClickCount, 0),
    currCartCount: channelRows.reduce((sum, item) => sum + item.currCartCount, 0),
    prevCartCount: channelRows.reduce((sum, item) => sum + item.prevCartCount, 0),
    currPayBuyerCount: channelRows.reduce(
      (sum, item) => sum + item.currPayBuyerCount,
      0
    ),
    prevPayBuyerCount: channelRows.reduce(
      (sum, item) => sum + item.prevPayBuyerCount,
      0
    ),
    currPayAmount: channelRows.reduce((sum, item) => sum + item.currPayAmount, 0),
    prevPayAmount: channelRows.reduce((sum, item) => sum + item.prevPayAmount, 0),
  };
}
