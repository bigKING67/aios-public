import { buildQuantRowsByChannel, mapQuantAttributionItem } from './platform-tab-row-mappers';
import type { QuantAttributionRow } from './platform-tab-types';
import type { FunnelDiagnosisSource } from './platform-tab-tmall-source-types';

type TmallQuantAttributionDataParams = {
  platformGoodsChannelFunnelDiagnosis?: FunnelDiagnosisSource;
};

export function buildTmallQuantAttributionData({
  platformGoodsChannelFunnelDiagnosis,
}: TmallQuantAttributionDataParams) {
  const quantRowsRaw = Array.isArray(platformGoodsChannelFunnelDiagnosis?.quant_attribution)
    ? platformGoodsChannelFunnelDiagnosis.quant_attribution
    : [];
  const quantRows: QuantAttributionRow[] = quantRowsRaw.map(mapQuantAttributionItem);
  const quantRowsByChannelRaw = Array.isArray(
    platformGoodsChannelFunnelDiagnosis?.quant_attribution_by_channel
  )
    ? platformGoodsChannelFunnelDiagnosis.quant_attribution_by_channel
    : [];
  const quantRowsByChannel = buildQuantRowsByChannel(quantRowsByChannelRaw);

  return {
    quantRows,
    quantRowsByChannel,
  };
}
