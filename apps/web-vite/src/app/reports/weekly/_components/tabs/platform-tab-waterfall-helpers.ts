import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type {
  ChannelAttributionRow,
  DouyinCardProductRow,
  DouyinCardSourceRow,
  DouyinLiveSessionRow,
  DouyinShortvideoRow,
  GoodsTableRow,
} from './platform-tab-types';

export type WaterfallColorResolver = (index: number) => string;

export type PlatformWaterfallResult<T> = {
  waterfallRows: T[];
  waterfallSteps: WaterfallStepItem[];
};

export type DouyinChannelBreakdownItem = {
  key: string;
  label: string;
  current: number;
  prev: number;
  color: string;
};

export type DouyinChannelDonutItem = {
  name: string;
  value: number;
  prevValue: number;
  color: string;
};

export type DouyinChannelContributionResult = {
  hasChannelData: boolean;
  donutData: DouyinChannelDonutItem[];
  totalCurrent: number;
  totalPrev: number;
  totalDelta: number;
  waterfallSteps: WaterfallStepItem[];
};

type VisibleRowsWaterfallConfig<T> = {
  rows: T[];
  getName: (row: T) => string;
  getDelta: (row: T) => number;
  getCurrent: (row: T) => number;
  getPrev: (row: T) => number;
  resolveColor: WaterfallColorResolver;
  limit: number;
};

function hasDelta(value: number): boolean {
  return Math.abs(value) > Number.EPSILON;
}

function calcShare(delta: number, totalDelta: number): number {
  return hasDelta(totalDelta) ? (delta / totalDelta) * 100 : 0;
}

function buildSteps<T>(
  rows: T[],
  totalDelta: number,
  getName: (row: T) => string,
  getDelta: (row: T) => number,
  getCurrent: (row: T) => number,
  getPrev: (row: T) => number,
  resolveColor: WaterfallColorResolver,
  getExplicitShare?: (row: T) => number | undefined
): WaterfallStepItem[] {
  return rows.map((row, index) => {
    const delta = getDelta(row);
    const explicitShare = getExplicitShare?.(row);
    return {
      name: getName(row),
      delta,
      current: getCurrent(row),
      prev: getPrev(row),
      share: explicitShare !== undefined ? explicitShare : calcShare(delta, totalDelta),
      color: resolveColor(index),
    };
  });
}

function buildTopDeltaRows<T>(
  rows: T[],
  getDelta: (row: T) => number,
  limit: number,
  shouldSortByMagnitude: boolean
): T[] {
  const filteredRows = rows.filter((row) => hasDelta(getDelta(row)));
  const rankedRows = shouldSortByMagnitude
    ? [...filteredRows].sort((left, right) => Math.abs(getDelta(right)) - Math.abs(getDelta(left)))
    : filteredRows;
  return rankedRows.slice(0, limit);
}

function buildVisibleRowsWaterfall<T>({
  rows,
  getName,
  getDelta,
  getCurrent,
  getPrev,
  resolveColor,
  limit,
}: VisibleRowsWaterfallConfig<T>): PlatformWaterfallResult<T> {
  const waterfallRows = buildTopDeltaRows(rows, getDelta, limit, false);
  const deltaSum = waterfallRows.reduce((sum, row) => sum + getDelta(row), 0);
  const waterfallSteps = buildSteps(
    waterfallRows,
    deltaSum,
    getName,
    getDelta,
    getCurrent,
    getPrev,
    resolveColor
  );

  return { waterfallRows, waterfallSteps };
}

function buildDouyinChannelDonutData(
  channelBreakdown: DouyinChannelBreakdownItem[]
): DouyinChannelDonutItem[] {
  return channelBreakdown.map((item) => ({
    name: item.label,
    value: item.current,
    prevValue: item.prev,
    color: item.color,
  }));
}

function buildDouyinChannelWaterfallSteps(
  channelBreakdown: DouyinChannelBreakdownItem[],
  totalDelta: number
): WaterfallStepItem[] {
  return channelBreakdown
    .map((item) => {
      const delta = item.current - item.prev;
      return {
        name: item.label,
        delta,
        current: item.current,
        prev: item.prev,
        share: calcShare(delta, totalDelta),
        color: item.color,
      };
    })
    .filter((item) => hasDelta(item.delta));
}

export function buildGoodsWaterfall(
  goodsItems: GoodsTableRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<GoodsTableRow> {
  const waterfallRows = buildTopDeltaRows(goodsItems, (item) => item.gmvDelta, 8, true);
  const totalDelta = goodsItems.reduce((sum, item) => sum + item.gmvDelta, 0);
  const waterfallSteps = buildSteps(
    waterfallRows,
    totalDelta,
    (item) => item.productName,
    (item) => item.gmvDelta,
    (item) => item.gmv,
    (item) => item.prevGmv,
    resolveColor,
    (item) =>
      item.gmvDeltaContribution !== undefined
        ? item.gmvDeltaContribution * 100
        : undefined
  );

  return { waterfallRows, waterfallSteps };
}

export function buildChannelWaterfall(
  channelRows: ChannelAttributionRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<ChannelAttributionRow> {
  const waterfallRows = buildTopDeltaRows(channelRows, (item) => item.payAmountDelta, 8, true);
  const totalDelta = channelRows.reduce((sum, item) => sum + item.payAmountDelta, 0);
  const waterfallSteps = buildSteps(
    waterfallRows,
    totalDelta,
    (item) => `${item.trafficChannelLabel} · ${item.productId}`,
    (item) => item.payAmountDelta,
    (item) => item.payAmount,
    (item) => item.prevPayAmount,
    resolveColor,
    (item) =>
      item.payAmountDeltaContribution !== undefined
        ? item.payAmountDeltaContribution * 100
        : undefined
  );

  return { waterfallRows, waterfallSteps };
}

export function buildDouyinChannelContribution(
  channelBreakdown: DouyinChannelBreakdownItem[]
): DouyinChannelContributionResult {
  const hasChannelData = channelBreakdown.some((item) => hasDelta(item.current) || hasDelta(item.prev));
  const donutData = buildDouyinChannelDonutData(channelBreakdown);
  const totalCurrent = channelBreakdown.reduce((sum, item) => sum + item.current, 0);
  const totalPrev = channelBreakdown.reduce((sum, item) => sum + item.prev, 0);
  const totalDelta = totalCurrent - totalPrev;
  const waterfallSteps = buildDouyinChannelWaterfallSteps(channelBreakdown, totalDelta);

  return {
    hasChannelData,
    donutData,
    totalCurrent,
    totalPrev,
    totalDelta,
    waterfallSteps,
  };
}

export function buildDouyinLiveWaterfall(
  tableRows: DouyinLiveSessionRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<DouyinLiveSessionRow> {
  return buildVisibleRowsWaterfall({
    rows: tableRows,
    getName: (row) => `${row.anchorNickname} · ${row.liveStartTime.slice(5, 16)}`,
    getDelta: (row) => row.liveGmvDelta,
    getCurrent: (row) => row.currLiveGmv,
    getPrev: (row) => row.prevLiveGmv,
    resolveColor,
    limit: 10,
  });
}

export function buildDouyinShortvideoWaterfall(
  tableRows: DouyinShortvideoRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<DouyinShortvideoRow> {
  return buildVisibleRowsWaterfall({
    rows: tableRows,
    getName: (row) => `${row.authorNickname} · ${row.videoId}`,
    getDelta: (row) => row.userPayAmountDelta,
    getCurrent: (row) => row.currUserPayAmount,
    getPrev: (row) => row.prevUserPayAmount,
    resolveColor,
    limit: 10,
  });
}

export function buildDouyinCardProductWaterfall(
  tableRows: DouyinCardProductRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<DouyinCardProductRow> {
  return buildVisibleRowsWaterfall({
    rows: tableRows,
    getName: (row) => `${row.productTitle} · ${row.productId}`,
    getDelta: (row) => row.cardGmvDelta,
    getCurrent: (row) => row.currCardUserPayAmount,
    getPrev: (row) => row.prevCardUserPayAmount,
    resolveColor,
    limit: 10,
  });
}

export function buildDouyinCardSourceWaterfall(
  tableRows: DouyinCardSourceRow[],
  resolveColor: WaterfallColorResolver
): PlatformWaterfallResult<DouyinCardSourceRow> {
  return buildVisibleRowsWaterfall({
    rows: tableRows,
    getName: (row) => row.sourceLevel1,
    getDelta: (row) => row.cardUserPayAmountDelta,
    getCurrent: (row) => row.currCardUserPayAmount,
    getPrev: (row) => row.prevCardUserPayAmount,
    resolveColor,
    limit: 12,
  });
}
