import { buildDouyinLiveFunnelStagePoints } from './platform-tab-funnel-helpers';
import { buildDouyinLiveDetailRows } from './platform-tab-douyin-detail-helpers';
import { buildDouyinLiveQuantRows } from './platform-tab-douyin-quant';
import { buildDouyinLiveWaterfall } from './platform-tab-waterfall-helpers';
import {
  buildTopAbsoluteDeltaRows,
  findPlatformAttributionItem,
  resolveDouyinSectionTotals,
} from './platform-tab-douyin-section-utils';
import { mapDouyinLiveAttributionItem } from './platform-tab-douyin-row-mappers';
import type { DouyinLiveSectionData, ResolveDouyinSectionDataParams } from './platform-tab-douyin-section-types';

interface BuildDouyinLiveSectionDataParams
  extends Pick<ResolveDouyinSectionDataParams, 'report' | 'platformAliases' | 'resolveCategoryWaterfallColor'> {
  douyinChannelAsOfDate: string | undefined;
}

export function buildDouyinLiveSectionData({
  report,
  platformAliases,
  douyinChannelAsOfDate,
  resolveCategoryWaterfallColor,
}: BuildDouyinLiveSectionDataParams): DouyinLiveSectionData {
  const douyinLiveAttributionRaw = Array.isArray(report.charts?.douyin_live_attribution)
    ? report.charts.douyin_live_attribution
    : [];
  const platformDouyinLiveAttribution = findPlatformAttributionItem(
    douyinLiveAttributionRaw,
    platformAliases
  );
  const douyinLiveAsOfDate = typeof platformDouyinLiveAttribution?.as_of_date === 'string'
    ? platformDouyinLiveAttribution.as_of_date
    : douyinChannelAsOfDate;
  const douyinLiveItemsRaw = Array.isArray(platformDouyinLiveAttribution?.items)
    ? platformDouyinLiveAttribution.items
    : [];
  const douyinLiveRows = douyinLiveItemsRaw.map(mapDouyinLiveAttributionItem);
  const douyinLiveTableRows = buildTopAbsoluteDeltaRows(
    douyinLiveRows,
    (row) => row.liveGmvDelta
  );
  const douyinLiveTotals = resolveDouyinSectionTotals({
    attribution: platformDouyinLiveAttribution,
    rows: douyinLiveRows,
    getCurrent: (row) => row.currLiveGmv,
    getPrev: (row) => row.prevLiveGmv,
  });
  const {
    waterfallRows: douyinLiveWaterfallRows,
    waterfallSteps: douyinLiveWaterfallSteps,
  } = buildDouyinLiveWaterfall(douyinLiveTableRows, resolveCategoryWaterfallColor);
  const selectedDouyinLiveRow = douyinLiveWaterfallRows[0] || douyinLiveTableRows[0];
  const selectedDouyinLiveStages = selectedDouyinLiveRow
    ? buildDouyinLiveFunnelStagePoints(selectedDouyinLiveRow)
    : [];
  const selectedDouyinLiveDetailRows = buildDouyinLiveDetailRows(selectedDouyinLiveRow);
  const selectedDouyinLiveQuantRows = buildDouyinLiveQuantRows(selectedDouyinLiveRow);

  return {
    douyinLiveAsOfDate,
    douyinLiveTableRows,
    douyinLiveTotalCurrent: douyinLiveTotals.current,
    douyinLiveTotalPrev: douyinLiveTotals.prev,
    douyinLiveTotalDelta: douyinLiveTotals.delta,
    douyinLiveWaterfallSteps,
    selectedDouyinLiveRow,
    selectedDouyinLiveStages,
    selectedDouyinLiveDetailRows,
    selectedDouyinLiveQuantRows,
  };
}
