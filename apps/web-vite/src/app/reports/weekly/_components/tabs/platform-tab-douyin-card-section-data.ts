import {
  buildDouyinCardProductWaterfall,
  buildDouyinCardSourceWaterfall,
} from './platform-tab-waterfall-helpers';
import { buildDouyinCardSourceDetailRows, buildDouyinCardSourceStages } from './platform-tab-douyin-detail-helpers';
import { buildDouyinCardSourceQuantRows } from './platform-tab-douyin-quant';
import {
  buildTopAbsoluteDeltaRows,
  findPlatformAttributionItem,
  resolveDouyinSectionTotals,
} from './platform-tab-douyin-section-utils';
import {
  mapDouyinCardProductAttributionItem,
  mapDouyinCardSourceAttributionItem,
} from './platform-tab-douyin-row-mappers';
import type { DouyinCardSectionData, ResolveDouyinSectionDataParams } from './platform-tab-douyin-section-types';

interface BuildDouyinCardSectionDataParams
  extends Pick<ResolveDouyinSectionDataParams, 'report' | 'platformAliases' | 'resolveCategoryWaterfallColor'> {
  douyinChannelAsOfDate: string | undefined;
}

export function buildDouyinCardSectionData({
  report,
  platformAliases,
  douyinChannelAsOfDate,
  resolveCategoryWaterfallColor,
}: BuildDouyinCardSectionDataParams): DouyinCardSectionData {
  const douyinCardAttributionRaw = Array.isArray(report.charts?.douyin_card_attribution)
    ? report.charts.douyin_card_attribution
    : [];
  const platformDouyinCardAttribution = findPlatformAttributionItem(
    douyinCardAttributionRaw,
    platformAliases
  );
  const douyinCardAsOfDate = typeof platformDouyinCardAttribution?.as_of_date === 'string'
    ? platformDouyinCardAttribution.as_of_date
    : douyinChannelAsOfDate;
  const douyinCardProductItemsRaw = Array.isArray(platformDouyinCardAttribution?.product_items)
    ? platformDouyinCardAttribution.product_items
    : [];
  const douyinCardProductRows = douyinCardProductItemsRaw.map(mapDouyinCardProductAttributionItem);
  const douyinCardProductTableRows = buildTopAbsoluteDeltaRows(
    douyinCardProductRows,
    (row) => row.cardGmvDelta
  );
  const douyinCardTotals = resolveDouyinSectionTotals({
    attribution: platformDouyinCardAttribution,
    rows: douyinCardProductRows,
    getCurrent: (row) => row.currCardUserPayAmount,
    getPrev: (row) => row.prevCardUserPayAmount,
  });
  const { waterfallSteps: douyinCardProductWaterfallSteps } = buildDouyinCardProductWaterfall(
    douyinCardProductTableRows,
    resolveCategoryWaterfallColor
  );
  const diagnosisCardProductId = String(platformDouyinCardAttribution?.diagnosis_product_id || '');
  const diagnosisCardProductName = String(platformDouyinCardAttribution?.diagnosis_product_name || '');
  const douyinCardSourceItemsRaw = Array.isArray(platformDouyinCardAttribution?.source_items)
    ? platformDouyinCardAttribution.source_items
    : [];
  const douyinCardSourceRows = douyinCardSourceItemsRaw.map(mapDouyinCardSourceAttributionItem);
  const douyinCardSourceTableRows = buildTopAbsoluteDeltaRows(
    douyinCardSourceRows,
    (row) => row.cardUserPayAmountDelta
  );
  const douyinCardSourceTotals = resolveDouyinSectionTotals({
    attribution: undefined,
    rows: douyinCardSourceRows,
    getCurrent: (row) => row.currCardUserPayAmount,
    getPrev: (row) => row.prevCardUserPayAmount,
  });
  const {
    waterfallRows: douyinCardSourceWaterfallRows,
    waterfallSteps: douyinCardSourceWaterfallSteps,
  } = buildDouyinCardSourceWaterfall(douyinCardSourceTableRows, resolveCategoryWaterfallColor);
  const selectedDouyinCardSource = douyinCardSourceWaterfallRows[0] || douyinCardSourceTableRows[0];
  const selectedDouyinCardSourceStages = buildDouyinCardSourceStages(selectedDouyinCardSource);
  const selectedDouyinCardQuantRows = buildDouyinCardSourceQuantRows(selectedDouyinCardSource);
  const selectedDouyinCardDetailRows = buildDouyinCardSourceDetailRows(selectedDouyinCardSource);

  return {
    douyinCardAsOfDate,
    douyinCardProductTableRows,
    douyinCardTotalCurrent: douyinCardTotals.current,
    douyinCardTotalPrev: douyinCardTotals.prev,
    douyinCardTotalDelta: douyinCardTotals.delta,
    douyinCardProductWaterfallSteps,
    diagnosisCardProductId,
    diagnosisCardProductName,
    douyinCardSourceTableRows,
    douyinCardSourceTotalCurrent: douyinCardSourceTotals.current,
    douyinCardSourceTotalPrev: douyinCardSourceTotals.prev,
    douyinCardSourceTotalDelta: douyinCardSourceTotals.delta,
    douyinCardSourceWaterfallSteps,
    selectedDouyinCardSource,
    selectedDouyinCardSourceStages,
    selectedDouyinCardQuantRows,
    selectedDouyinCardDetailRows,
  };
}
