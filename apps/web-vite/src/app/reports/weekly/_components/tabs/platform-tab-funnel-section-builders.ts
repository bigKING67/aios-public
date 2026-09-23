import {
  buildFunnelChannelDisplayItems,
  getFunnelRowsForDisplay,
  groupFunnelRowsByChannel,
} from './platform-tab-funnel-channel-display';
import { buildFunnelStagePoints } from './platform-tab-funnel-helpers';
export { buildAlignedChannelWaterfallSteps } from './platform-tab-funnel-waterfall-steps';
export type { BuildAlignedChannelWaterfallStepsParams } from './platform-tab-funnel-waterfall-steps';
import type {
  FunnelChannelRow,
  FunnelChannelSection,
  FunnelSelectedChannelDetail,
} from './platform-tab-types';

export interface BuildFunnelChannelSectionsParams {
  funnelRows: FunnelChannelRow[];
  funnelSelectedChannels: string[];
  funnelSelectedChannelDetails: FunnelSelectedChannelDetail[];
}

export function buildFunnelChannelSections({
  funnelRows,
  funnelSelectedChannels,
  funnelSelectedChannelDetails,
}: BuildFunnelChannelSectionsParams): FunnelChannelSection[] {
  const funnelRowsForDisplay = getFunnelRowsForDisplay(funnelRows);
  const funnelRowsByChannel = groupFunnelRowsByChannel(funnelRowsForDisplay);
  const funnelSelectedChannelDisplay = buildFunnelChannelDisplayItems({
    funnelRowsForDisplay,
    funnelRowsByChannel,
    funnelSelectedChannels,
    funnelSelectedChannelDetails,
  });

  return funnelSelectedChannelDisplay
    .map((channel) => {
      const rows = funnelRowsByChannel.get(channel.channelKey) || [];
      if (rows.length === 0) {
        return null;
      }
      const currPayAmount = rows.reduce((sum, item) => sum + item.currPayAmount, 0);
      const prevPayAmount = rows.reduce((sum, item) => sum + item.prevPayAmount, 0);
      return {
        channelKey: channel.channelKey,
        titleText: channel.titleText,
        summaryText: channel.summaryText,
        rows,
        stages: buildFunnelStagePoints(rows),
        currPayAmount,
        prevPayAmount,
      };
    })
    .filter((item): item is FunnelChannelSection => Boolean(item));
}
