import { buildTmallChannelAttributionData } from './platform-tab-tmall-channel-attribution-data';
import { buildTmallFunnelDiagnosisData } from './platform-tab-tmall-funnel-diagnosis-data';
import { buildTmallGoodsAttributionData } from './platform-tab-tmall-goods-attribution-data';
import { buildTmallQuantAttributionData } from './platform-tab-tmall-quant-attribution-data';
import { resolveTmallAttributionTotals } from './platform-tab-tmall-attribution-totals';
import type { TmallPlatformSectionData } from './platform-tab-tmall-section-types';
import type {
  ChannelAttributionSource,
  FunnelDiagnosisSource,
  GoodsAttributionSource,
} from './platform-tab-tmall-source-types';

type TmallPlatformSectionDataParams = {
  platformGoodsAttribution?: GoodsAttributionSource;
  platformGoodsChannelAttribution?: ChannelAttributionSource;
  platformGoodsChannelFunnelDiagnosis?: FunnelDiagnosisSource;
  gmv: number;
  prevGmvSafe: number;
  resolveCategoryWaterfallColor: (index: number) => string;
};

export function resolveTmallPlatformSectionData({
  platformGoodsAttribution,
  platformGoodsChannelAttribution,
  platformGoodsChannelFunnelDiagnosis,
  gmv,
  prevGmvSafe,
  resolveCategoryWaterfallColor,
}: TmallPlatformSectionDataParams): TmallPlatformSectionData {
  const {
    goodsTableRows,
    goodsWaterfallSteps,
    locatedProductIds,
  } = buildTmallGoodsAttributionData({
    platformGoodsAttribution,
    resolveCategoryWaterfallColor,
  });

  const {
    channelRows,
    channelTableRows,
    channelWaterfallSteps: baseChannelWaterfallSteps,
  } = buildTmallChannelAttributionData({
    platformGoodsChannelAttribution,
    locatedProductIds,
    resolveCategoryWaterfallColor,
  });

  const {
    alignedWaterfallSteps,
    funnelChannelSections,
  } = buildTmallFunnelDiagnosisData({
    channelRows,
    platformGoodsChannelFunnelDiagnosis,
    resolveCategoryWaterfallColor,
  });

  const channelWaterfallSteps =
    alignedWaterfallSteps.length > 0 ? alignedWaterfallSteps : baseChannelWaterfallSteps;

  const { quantRows, quantRowsByChannel } = buildTmallQuantAttributionData({
    platformGoodsChannelFunnelDiagnosis,
  });

  const tmallAttributionTotals = resolveTmallAttributionTotals({
    channelRows,
    gmv,
    prevGmvSafe,
    platformGoodsAttribution,
  });

  return {
    goodsTableRows,
    goodsWaterfallSteps,
    channelTableRows,
    channelWaterfallSteps,
    funnelChannelSections,
    quantRows,
    quantRowsByChannel,
    tmallAttributionTotals,
  };
}
