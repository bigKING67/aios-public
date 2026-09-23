import { resolveTrafficChannelLabel } from './platform-tab-formatters';
import { resolveFunnelConversionMetrics } from './platform-tab-funnel-conversion-metrics';
import { resolveFunnelCoreCounts } from './platform-tab-funnel-core-counts';
import { resolveFunnelEngagementCounts } from './platform-tab-funnel-engagement-counts';
import { resolveFunnelCostMetrics } from './platform-tab-funnel-cost-metrics';
import {
  resolveFunnelHasClickStage,
  resolveFunnelMetricSource,
  resolveFunnelProductId,
  resolveFunnelProductName,
  resolveFunnelTrafficChannel,
} from './platform-tab-funnel-item-normalizers';
import { buildFunnelRowId } from './platform-tab-funnel-row-id';
import { resolveFunnelRoiMetrics } from './platform-tab-funnel-roi-metrics';
import { resolveFunnelValueMetrics } from './platform-tab-funnel-value-metrics';
import type { FunnelChannelRow } from './platform-tab-types';
import type { FunnelChannelItem } from './platform-tab-row-mapper-types';

export function mapFunnelChannelItem(item: FunnelChannelItem): FunnelChannelRow {
  const productId = resolveFunnelProductId(item);
  const productName = resolveFunnelProductName(item);
  const trafficChannel = resolveFunnelTrafficChannel(item);
  const metricSource = resolveFunnelMetricSource(item);
  const hasClickStage = resolveFunnelHasClickStage(item);
  const {
    currVisitorCount,
    prevVisitorCount,
    currImpressionCount,
    prevImpressionCount,
    currClickCount,
    prevClickCount,
    currCartCount,
    prevCartCount,
    currPayBuyerCount,
    prevPayBuyerCount,
  } = resolveFunnelCoreCounts(item);
  const {
    currPayAmount,
    prevPayAmount,
    payAmountWoW,
    currCost,
    prevCost,
    costWoW,
  } = resolveFunnelValueMetrics(item);
  const {
    currCtr,
    prevCtr,
    currClickToCartRate,
    prevClickToCartRate,
    currCartToPayRate,
    prevCartToPayRate,
  } = resolveFunnelConversionMetrics(
    item,
    hasClickStage,
    currVisitorCount,
    prevVisitorCount,
    currImpressionCount,
    prevImpressionCount,
    currClickCount,
    prevClickCount,
    currCartCount,
    prevCartCount,
    currPayBuyerCount,
    prevPayBuyerCount,
  );
  const { currRoi, prevRoi, roiWoW } = resolveFunnelRoiMetrics(
    item,
    currPayAmount,
    prevPayAmount,
    currCost,
    prevCost,
  );
  const {
    currAvgClickCost,
    prevAvgClickCost,
    currCpm,
    prevCpm,
    currClickConversionRate,
    prevClickConversionRate,
  } = resolveFunnelCostMetrics(
    item,
    currCost,
    prevCost,
    currImpressionCount,
    prevImpressionCount,
    currClickCount,
    prevClickCount,
    currPayBuyerCount,
    prevPayBuyerCount,
  );

  return {
    rowId: buildFunnelRowId({
      productId,
      trafficChannel,
      metricSource,
      currImpressionCount,
      currClickCount,
      currCartCount,
      currPayBuyerCount,
      currPayAmount,
      currCost,
    }),
    productId,
    productName,
    trafficChannel,
    trafficChannelLabel: resolveTrafficChannelLabel(trafficChannel),
    metricSource,
    hasClickStage,
    currVisitorCount,
    prevVisitorCount,
    currImpressionCount,
    prevImpressionCount,
    currClickCount,
    prevClickCount,
    currCartCount,
    prevCartCount,
    currPayBuyerCount,
    prevPayBuyerCount,
    currPayAmount,
    prevPayAmount,
    payAmountWoW,
    currCtr,
    prevCtr,
    currClickToCartRate,
    prevClickToCartRate,
    currCartToPayRate,
    prevCartToPayRate,
    currCost,
    prevCost,
    costWoW,
    currRoi,
    prevRoi,
    roiWoW,
    currAvgClickCost,
    prevAvgClickCost,
    currCpm,
    prevCpm,
    currClickConversionRate,
    prevClickConversionRate,
    ...resolveFunnelEngagementCounts(item),
  };
}
