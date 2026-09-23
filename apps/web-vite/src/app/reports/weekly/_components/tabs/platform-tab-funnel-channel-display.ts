import {
  formatContributionTag,
  normalizeToken,
  resolveTrafficChannelLabel,
} from './platform-tab-formatters';
import type {
  FunnelChannelRow,
  FunnelSelectedChannelDetail,
} from './platform-tab-types';

const FUNNEL_DISPLAY_ROW_LIMIT = 80;

export interface FunnelChannelDisplayItem {
  channelKey: string;
  titleText: string;
  summaryText: string;
}

export interface BuildFunnelChannelDisplayItemsParams {
  funnelRowsForDisplay: FunnelChannelRow[];
  funnelRowsByChannel: Map<string, FunnelChannelRow[]>;
  funnelSelectedChannels: string[];
  funnelSelectedChannelDetails: FunnelSelectedChannelDetail[];
}

export function getFunnelRowsForDisplay(funnelRows: FunnelChannelRow[]): FunnelChannelRow[] {
  return funnelRows.slice(0, FUNNEL_DISPLAY_ROW_LIMIT);
}

export function groupFunnelRowsByChannel(
  funnelRowsForDisplay: FunnelChannelRow[]
): Map<string, FunnelChannelRow[]> {
  const funnelRowsByChannel = new Map<string, FunnelChannelRow[]>();

  for (const row of funnelRowsForDisplay) {
    const channelKey = normalizeToken(row.trafficChannel);
    if (!channelKey) {
      continue;
    }

    const existingRows = funnelRowsByChannel.get(channelKey);
    if (existingRows) {
      existingRows.push(row);
    } else {
      funnelRowsByChannel.set(channelKey, [row]);
    }
  }

  return funnelRowsByChannel;
}

function buildDetailDisplayCandidates(
  funnelSelectedChannelDetails: FunnelSelectedChannelDetail[]
): FunnelChannelDisplayItem[] {
  return funnelSelectedChannelDetails.map((item) => {
    const contributionText = formatContributionTag(item.contributionRate);
    const displayText = contributionText
      ? `${item.trafficChannelLabel}(${contributionText})`
      : item.trafficChannelLabel;

    return {
      channelKey: normalizeToken(item.trafficChannel || item.trafficChannelLabel),
      titleText: displayText,
      summaryText: displayText,
    };
  });
}

function buildChannelDisplayCandidates(
  channels: string[]
): FunnelChannelDisplayItem[] {
  return channels.map((channel) => {
    const channelLabel = resolveTrafficChannelLabel(channel);
    return {
      channelKey: normalizeToken(channel),
      titleText: channelLabel,
      summaryText: channelLabel,
    };
  });
}

function dedupeFunnelChannelDisplayItems(
  candidates: FunnelChannelDisplayItem[]
): FunnelChannelDisplayItem[] {
  const displayItems: FunnelChannelDisplayItem[] = [];
  const seenChannelKeys = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.channelKey || seenChannelKeys.has(candidate.channelKey)) {
      continue;
    }

    seenChannelKeys.add(candidate.channelKey);
    displayItems.push(candidate);
  }

  return displayItems;
}

function buildGroupedChannelFallbackDisplayItems(
  funnelRowsByChannel: Map<string, FunnelChannelRow[]>
): FunnelChannelDisplayItem[] {
  const fallbackDisplayItems: FunnelChannelDisplayItem[] = [];

  for (const [channelKey, channelRows] of funnelRowsByChannel.entries()) {
    const channelLabel =
      channelRows[0]?.trafficChannelLabel ||
      resolveTrafficChannelLabel(channelRows[0]?.trafficChannel || channelKey);
    fallbackDisplayItems.push({
      channelKey,
      titleText: channelLabel,
      summaryText: channelLabel,
    });
  }

  return fallbackDisplayItems;
}

export function buildFunnelChannelDisplayItems({
  funnelRowsForDisplay,
  funnelRowsByChannel,
  funnelSelectedChannels,
  funnelSelectedChannelDetails,
}: BuildFunnelChannelDisplayItemsParams): FunnelChannelDisplayItem[] {
  const funnelChannelDisplayCandidates = funnelSelectedChannelDetails.length > 0
    ? buildDetailDisplayCandidates(funnelSelectedChannelDetails)
    : buildChannelDisplayCandidates(
      funnelSelectedChannels.length > 0
        ? funnelSelectedChannels
        : funnelRowsForDisplay.map((item) => item.trafficChannel)
    );
  const funnelSelectedChannelDisplay = dedupeFunnelChannelDisplayItems(
    funnelChannelDisplayCandidates
  );

  if (funnelSelectedChannelDisplay.length > 0) {
    return funnelSelectedChannelDisplay;
  }

  return buildGroupedChannelFallbackDisplayItems(funnelRowsByChannel);
}
