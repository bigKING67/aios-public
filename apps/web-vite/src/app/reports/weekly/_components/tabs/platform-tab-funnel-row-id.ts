export type FunnelRowIdParts = {
  productId: string;
  trafficChannel: string;
  metricSource: string;
  currImpressionCount: number;
  currClickCount: number;
  currCartCount: number;
  currPayBuyerCount: number;
  currPayAmount: number;
  currCost: number;
};

export function buildFunnelRowId(parts: FunnelRowIdParts): string {
  return [
    parts.productId,
    parts.trafficChannel,
    parts.metricSource,
    parts.currImpressionCount,
    parts.currClickCount,
    parts.currCartCount,
    parts.currPayBuyerCount,
    parts.currPayAmount.toFixed(4),
    parts.currCost.toFixed(4),
  ].join('|');
}
