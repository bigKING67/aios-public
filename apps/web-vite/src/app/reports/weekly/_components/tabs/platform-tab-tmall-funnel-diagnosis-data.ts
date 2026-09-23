import {
  buildAlignedChannelWaterfallSteps,
  buildFunnelChannelSections,
} from './platform-tab-funnel-section-builders';
import {
  resolveTrafficChannelLabel,
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';
import { mapFunnelChannelItem } from './platform-tab-row-mappers';
import type {
  ChannelAttributionRow,
  FunnelChannelRow,
  FunnelSelectedChannelDetail,
} from './platform-tab-types';
import type { FunnelDiagnosisSource } from './platform-tab-tmall-source-types';

type TmallFunnelDiagnosisDataParams = {
  channelRows: ChannelAttributionRow[];
  platformGoodsChannelFunnelDiagnosis?: FunnelDiagnosisSource;
  resolveCategoryWaterfallColor: (index: number) => string;
};

export function buildTmallFunnelDiagnosisData({
  channelRows,
  platformGoodsChannelFunnelDiagnosis,
  resolveCategoryWaterfallColor,
}: TmallFunnelDiagnosisDataParams) {
  const funnelDiagnosisProductId = String(platformGoodsChannelFunnelDiagnosis?.product_id || '--');
  const funnelSelectedChannels = Array.isArray(platformGoodsChannelFunnelDiagnosis?.selected_channels)
    ? platformGoodsChannelFunnelDiagnosis.selected_channels
      .map((item) => String(item || ''))
      .filter(Boolean)
    : [];
  const funnelSelectedChannelDetailsRaw = Array.isArray(
    platformGoodsChannelFunnelDiagnosis?.selected_channel_details
  )
    ? platformGoodsChannelFunnelDiagnosis.selected_channel_details
    : [];
  const funnelSelectedChannelDetails: FunnelSelectedChannelDetail[] = funnelSelectedChannelDetailsRaw
    .map((item) => {
      const trafficChannel = String(item.traffic_channel || '').trim();
      return {
        trafficChannel,
        trafficChannelLabel: resolveTrafficChannelLabel(trafficChannel),
        gmvDelta: toSafeNumber(item.gmv_delta),
        contributionRate: toOptionalNumber(item.contribution_rate),
      };
    })
    .filter((item) => Boolean(item.trafficChannel));
  const funnelRowsRaw = Array.isArray(platformGoodsChannelFunnelDiagnosis?.funnel_items)
    ? platformGoodsChannelFunnelDiagnosis.funnel_items
    : [];
  const funnelRows: FunnelChannelRow[] = funnelRowsRaw
    .map(mapFunnelChannelItem)
    .sort((left, right) => right.currPayAmount - left.currPayAmount);
  const alignedWaterfallSteps = buildAlignedChannelWaterfallSteps({
    channelRows,
    funnelRows,
    funnelSelectedChannelDetails,
    funnelDiagnosisProductId,
    resolveCategoryWaterfallColor,
  });
  const funnelChannelSections = buildFunnelChannelSections({
    funnelRows,
    funnelSelectedChannels,
    funnelSelectedChannelDetails,
  });

  return {
    funnelDiagnosisProductId,
    funnelSelectedChannels,
    funnelSelectedChannelDetails,
    funnelRows,
    alignedWaterfallSteps,
    funnelChannelSections,
  };
}
