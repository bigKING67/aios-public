import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import {
  formatContributionTag,
  normalizeToken,
} from './platform-tab-formatters';
import type {
  ChannelAttributionRow,
  FunnelChannelRow,
  FunnelSelectedChannelDetail,
} from './platform-tab-types';

type ColorResolver = (index: number) => string;

interface FunnelWaterfallMatchedAmounts {
  current: number;
  previous: number;
  delta: number;
}

export interface BuildAlignedChannelWaterfallStepsParams {
  channelRows: ChannelAttributionRow[];
  funnelRows: FunnelChannelRow[];
  funnelSelectedChannelDetails: FunnelSelectedChannelDetail[];
  funnelDiagnosisProductId: string;
  resolveCategoryWaterfallColor: ColorResolver;
}

function buildTrafficChannelMap<T extends { trafficChannel: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((item) => [normalizeToken(item.trafficChannel), item]));
}

function resolveMatchedAmounts(
  matchedChannelRow: ChannelAttributionRow | undefined,
  matchedFunnelRow: FunnelChannelRow | undefined
): FunnelWaterfallMatchedAmounts {
  if (matchedChannelRow) {
    return {
      current: matchedChannelRow.payAmount,
      previous: matchedChannelRow.prevPayAmount,
      delta: matchedChannelRow.payAmountDelta,
    };
  }

  const current = matchedFunnelRow?.currPayAmount ?? 0;
  const previous = matchedFunnelRow?.prevPayAmount ?? 0;
  return {
    current,
    previous,
    delta: current - previous,
  };
}

function resolveWaterfallStepShare(
  detail: FunnelSelectedChannelDetail,
  payAmountDelta: number,
  diagnosisProductDelta: number
): number {
  if (detail.contributionRate !== undefined) {
    return detail.contributionRate;
  }

  return Math.abs(diagnosisProductDelta) > Number.EPSILON
    ? (payAmountDelta / diagnosisProductDelta) * 100
    : 0;
}

function buildWaterfallStepName(
  detail: FunnelSelectedChannelDetail,
  funnelDiagnosisProductId: string
): string {
  const contributionText = formatContributionTag(detail.contributionRate);
  const channelLegendLabel = contributionText
    ? `${detail.trafficChannelLabel}(${contributionText})`
    : detail.trafficChannelLabel;

  return `${channelLegendLabel} · ${funnelDiagnosisProductId}`;
}

export function buildAlignedChannelWaterfallSteps({
  channelRows,
  funnelRows,
  funnelSelectedChannelDetails,
  funnelDiagnosisProductId,
  resolveCategoryWaterfallColor,
}: BuildAlignedChannelWaterfallStepsParams): WaterfallStepItem[] {
  if (
    funnelSelectedChannelDetails.length === 0 ||
    !funnelDiagnosisProductId ||
    funnelDiagnosisProductId === '--'
  ) {
    return [];
  }

  const diagnosisProductChannelRows = channelRows.filter(
    (item) => item.productId === funnelDiagnosisProductId
  );
  const diagnosisProductDelta = diagnosisProductChannelRows.reduce(
    (sum, item) => sum + item.payAmountDelta,
    0
  );
  const diagnosisChannelMap = buildTrafficChannelMap(diagnosisProductChannelRows);
  const funnelChannelMap = buildTrafficChannelMap(funnelRows);

  const steps: WaterfallStepItem[] = [];

  funnelSelectedChannelDetails.forEach((detail, index) => {
    const normalizedTrafficChannel = normalizeToken(detail.trafficChannel);
    const matchedChannelRow = diagnosisChannelMap.get(normalizedTrafficChannel);
    const matchedFunnelRow = funnelChannelMap.get(normalizedTrafficChannel);
    if (!matchedChannelRow && !matchedFunnelRow) {
      return;
    }

    const amounts = resolveMatchedAmounts(matchedChannelRow, matchedFunnelRow);

    steps.push({
      name: buildWaterfallStepName(detail, funnelDiagnosisProductId),
      delta: amounts.delta,
      current: amounts.current,
      prev: amounts.previous,
      share: resolveWaterfallStepShare(detail, amounts.delta, diagnosisProductDelta),
      color: resolveCategoryWaterfallColor(index),
    });
  });

  return steps;
}
