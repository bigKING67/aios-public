import { buildShortvideoDiagnosis } from './platform-tab-douyin-diagnostics';
import { buildDouyinShortvideoWaterfall } from './platform-tab-waterfall-helpers';
import {
  buildTopAbsoluteDeltaRows,
  findPlatformAttributionItem,
  resolveDouyinSectionTotals,
} from './platform-tab-douyin-section-utils';
import { mapDouyinShortvideoAttributionItem } from './platform-tab-douyin-row-mappers';
import type { DouyinShortvideoSectionData, ResolveDouyinSectionDataParams } from './platform-tab-douyin-section-types';

interface BuildDouyinShortvideoSectionDataParams
  extends Pick<ResolveDouyinSectionDataParams, 'report' | 'platformAliases' | 'resolveCategoryWaterfallColor'> {
  douyinChannelAsOfDate: string | undefined;
}

export function buildDouyinShortvideoSectionData({
  report,
  platformAliases,
  douyinChannelAsOfDate,
  resolveCategoryWaterfallColor,
}: BuildDouyinShortvideoSectionDataParams): DouyinShortvideoSectionData {
  const douyinShortvideoAttributionRaw = Array.isArray(report.charts?.douyin_shortvideo_attribution)
    ? report.charts.douyin_shortvideo_attribution
    : [];
  const platformDouyinShortvideoAttribution = findPlatformAttributionItem(
    douyinShortvideoAttributionRaw,
    platformAliases
  );
  const douyinShortvideoAsOfDate = typeof platformDouyinShortvideoAttribution?.as_of_date === 'string'
    ? platformDouyinShortvideoAttribution.as_of_date
    : douyinChannelAsOfDate;
  const douyinShortvideoItemsRaw = Array.isArray(platformDouyinShortvideoAttribution?.items)
    ? platformDouyinShortvideoAttribution.items
    : [];
  const douyinShortvideoRows = douyinShortvideoItemsRaw.map(mapDouyinShortvideoAttributionItem);
  const douyinShortvideoTableRows = buildTopAbsoluteDeltaRows(
    douyinShortvideoRows,
    (row) => row.userPayAmountDelta
  );
  const douyinShortvideoTotals = resolveDouyinSectionTotals({
    attribution: platformDouyinShortvideoAttribution,
    rows: douyinShortvideoRows,
    getCurrent: (row) => row.currUserPayAmount,
    getPrev: (row) => row.prevUserPayAmount,
  });
  const {
    waterfallRows: douyinShortvideoWaterfallRows,
    waterfallSteps: douyinShortvideoWaterfallSteps,
  } = buildDouyinShortvideoWaterfall(douyinShortvideoTableRows, resolveCategoryWaterfallColor);
  const selectedDouyinShortvideoRow = douyinShortvideoWaterfallRows[0] || douyinShortvideoTableRows[0];
  const selectedDouyinShortvideoDiagnosis = selectedDouyinShortvideoRow
    ? buildShortvideoDiagnosis(selectedDouyinShortvideoRow)
    : [];

  return {
    douyinShortvideoAsOfDate,
    douyinShortvideoTableRows,
    douyinShortvideoTotalCurrent: douyinShortvideoTotals.current,
    douyinShortvideoTotalPrev: douyinShortvideoTotals.prev,
    douyinShortvideoTotalDelta: douyinShortvideoTotals.delta,
    douyinShortvideoWaterfallSteps,
    selectedDouyinShortvideoRow,
    selectedDouyinShortvideoDiagnosis,
  };
}
