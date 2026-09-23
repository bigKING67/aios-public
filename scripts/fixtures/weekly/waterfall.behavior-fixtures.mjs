/**
 * Weekly waterfall behavior fixtures.
 *
 * The attribution waterfall helpers contain subtle formula differences:
 * goods/channel use the full row set as denominator, while Douyin visible-row
 * waterfalls use only the displayed rows. Keep these checks close to CI so
 * helper refactors do not flatten those semantics.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Weekly waterfall behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertApprox(...args) {
  currentAssertions().assertApprox(...args);
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function makeGoodsRow(overrides = {}) {
  return {
    rowId: 'goods-row',
    productId: 'sku-001',
    productName: '清洁精华',
    gmv: 100,
    prevGmv: 60,
    gmvWoW: undefined,
    gmvDelta: 40,
    gmvDeltaContribution: undefined,
    buyerCount: 0,
    visitorCount: 0,
    payConversionRate: undefined,
    avgOrderValue: undefined,
    ...overrides,
  };
}

function makeChannelRow(overrides = {}) {
  return {
    rowId: 'channel-row',
    productId: 'sku-001',
    productName: '清洁精华',
    trafficChannel: 'search',
    trafficChannelLabel: '搜索',
    payAmount: 100,
    prevPayAmount: 50,
    payAmountWoW: undefined,
    payAmountDelta: 50,
    payAmountDeltaContribution: undefined,
    payBuyerCount: 0,
    visitorCount: 0,
    cartBuyerCount: 0,
    ...overrides,
  };
}

function makeDouyinLiveRow(overrides = {}) {
  return {
    rowId: 'live-row',
    sessionId: 'live-001',
    shopName: '旗舰店',
    shopId: 'shop-001',
    anchorNickname: '主播一号',
    anchorDouyinId: 'dy-001',
    liveStartTime: '2026-04-01 20:00:00',
    liveEndTime: '2026-04-01 22:00:00',
    currLiveDurationMinutes: 120,
    prevLiveDurationMinutes: 100,
    currLiveExposureUserCount: 0,
    prevLiveExposureUserCount: 0,
    currLiveWatchUserCount: 0,
    prevLiveWatchUserCount: 0,
    currLiveProductExposureUser: 0,
    prevLiveProductExposureUser: 0,
    currLiveProductClickUser: 0,
    prevLiveProductClickUser: 0,
    currLiveBuyerCount: 0,
    prevLiveBuyerCount: 0,
    currLiveOrderCount: 0,
    prevLiveOrderCount: 0,
    currLiveGmv: 100,
    prevLiveGmv: 40,
    liveGmvDelta: 60,
    currLiveUserPayAmount: 100,
    prevLiveUserPayAmount: 40,
    currLiveAdCost: 0,
    prevLiveAdCost: 0,
    currCommentCount: 0,
    prevCommentCount: 0,
    currNewFollowerCount: 0,
    prevNewFollowerCount: 0,
    currProductCount: 0,
    prevProductCount: 0,
    currAvgOrderValue: undefined,
    prevAvgOrderValue: undefined,
    ...overrides,
  };
}

function makeDouyinCardSourceRow(overrides = {}) {
  return {
    rowId: 'card-source-row',
    sourceLevel1: '商城推荐',
    currCardExposureUserCount: 0,
    prevCardExposureUserCount: 0,
    currCardClickUserCount: 0,
    prevCardClickUserCount: 0,
    currCardBuyerCount: 0,
    prevCardBuyerCount: 0,
    currCardCartUserCount: 0,
    prevCardCartUserCount: 0,
    currCardFavoriteUserCount: 0,
    prevCardFavoriteUserCount: 0,
    currCardBounceUserCount: 0,
    prevCardBounceUserCount: 0,
    currCardOrderCount: 0,
    prevCardOrderCount: 0,
    currCardUserPayAmount: 100,
    prevCardUserPayAmount: 40,
    cardUserPayAmountDelta: 60,
    currCardClickRate: undefined,
    prevCardClickRate: undefined,
    currCardClickToPayRate: undefined,
    prevCardClickToPayRate: undefined,
    ...overrides,
  };
}

function makeColorResolver(calls = []) {
  return (index) => {
    calls.push(index);
    return `color-${index}`;
  };
}

async function loadWeeklyWaterfallHelpers() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-waterfall-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-waterfall-helpers', [
      'buildChannelWaterfall',
      'buildDouyinCardSourceWaterfall',
      'buildDouyinChannelContribution',
      'buildDouyinLiveWaterfall',
      'buildGoodsWaterfall',
    ]),
  });
}

function assertGoodsWaterfallBehavior(buildGoodsWaterfall) {
  const colorCalls = [];
  const result = buildGoodsWaterfall(
    [
      makeGoodsRow({
        rowId: 'a',
        productName: 'A',
        gmv: 200,
        prevGmv: 100,
        gmvDelta: 100,
        gmvDeltaContribution: 0.5,
      }),
      makeGoodsRow({
        rowId: 'b',
        productName: 'B',
        gmv: 100,
        prevGmv: 20,
        gmvDelta: 80,
      }),
      makeGoodsRow({
        rowId: 'c',
        productName: 'C',
        gmv: 0,
        prevGmv: 0,
        gmvDelta: 0,
      }),
      makeGoodsRow({
        rowId: 'd',
        productName: 'D',
        gmv: 30,
        prevGmv: 70,
        gmvDelta: -40,
      }),
      makeGoodsRow({
        rowId: 'hidden-total-only',
        productName: 'Hidden',
        gmv: 1,
        prevGmv: 31,
        gmvDelta: -30,
      }),
    ],
    makeColorResolver(colorCalls),
  );

  assertEqual(
    result.waterfallRows.map((item) => item.productName).join('>'),
    'A>B>D>Hidden',
    'goods waterfall should filter zero delta and sort by absolute delta descending',
  );
  assertEqual(result.waterfallSteps[0].share, 50, 'goods explicit contribution should be converted to percent');
  assertApprox(
    result.waterfallSteps[1].share,
    80 / 110 * 100,
    'goods fallback share should use all goods rows as denominator',
  );
  assertEqual(colorCalls.join(','), '0,1,2,3', 'goods waterfall should resolve colors by visible index');

  const cappedResult = buildGoodsWaterfall(
    Array.from({ length: 10 }, (_, index) => makeGoodsRow({
      rowId: `goods-${index}`,
      productName: `商品${index}`,
      gmvDelta: index + 1,
    })),
    makeColorResolver(),
  );
  assertEqual(cappedResult.waterfallRows.length, 8, 'goods waterfall should cap visible rows at 8');
}

function assertChannelWaterfallBehavior(buildChannelWaterfall) {
  const result = buildChannelWaterfall(
    [
      makeChannelRow({
        rowId: 'a',
        productId: 'sku-a',
        trafficChannelLabel: '搜索',
        payAmountDelta: 20,
        payAmountDeltaContribution: 0.25,
      }),
      makeChannelRow({
        rowId: 'b',
        productId: 'sku-b',
        trafficChannelLabel: '推荐',
        payAmountDelta: -40,
      }),
      makeChannelRow({
        rowId: 'c',
        productId: 'sku-c',
        trafficChannelLabel: '直播',
        payAmountDelta: 0,
      }),
      makeChannelRow({
        rowId: 'hidden-total-only',
        productId: 'sku-d',
        trafficChannelLabel: '隐藏',
        payAmountDelta: 60,
      }),
    ],
    makeColorResolver(),
  );

  assertEqual(
    result.waterfallRows.map((item) => item.rowId).join('>'),
    'hidden-total-only>b>a',
    'channel waterfall should filter zero delta and sort by absolute delta descending',
  );
  assertEqual(
    result.waterfallSteps[0].name,
    '隐藏 · sku-d',
    'channel waterfall name should combine traffic label and product id',
  );
  assertApprox(
    result.waterfallSteps[1].share,
    -40 / 40 * 100,
    'channel fallback share should use all channel rows as denominator',
  );
  assertEqual(
    result.waterfallSteps[2].share,
    25,
    'channel explicit contribution should be converted to percent',
  );
}

function assertDouyinLiveWaterfallBehavior(buildDouyinLiveWaterfall) {
  const result = buildDouyinLiveWaterfall(
    [
      makeDouyinLiveRow({
        rowId: 'zero',
        anchorNickname: '零变化',
        liveGmvDelta: 0,
      }),
      makeDouyinLiveRow({
        rowId: 'a',
        anchorNickname: '主播A',
        liveStartTime: '2026-04-02 20:30:00',
        liveGmvDelta: 60,
        currLiveGmv: 120,
        prevLiveGmv: 60,
      }),
      makeDouyinLiveRow({
        rowId: 'b',
        anchorNickname: '主播B',
        liveStartTime: '2026-04-03 21:00:00',
        liveGmvDelta: -20,
        currLiveGmv: 50,
        prevLiveGmv: 70,
      }),
    ],
    makeColorResolver(),
  );

  assertEqual(
    result.waterfallRows.map((item) => item.rowId).join('>'),
    'a>b',
    'Douyin live waterfall should filter zero delta and preserve source order',
  );
  assertEqual(
    result.waterfallSteps[0].name,
    '主播A · 04-02 20:30',
    'Douyin live waterfall name should include anchor and sliced live start time',
  );
  assertApprox(
    result.waterfallSteps[0].share,
    60 / 40 * 100,
    'Douyin live fallback share should use visible waterfall rows as denominator',
  );
}

function assertDouyinCardSourceWaterfallBehavior(buildDouyinCardSourceWaterfall) {
  const rows = Array.from({ length: 14 }, (_, index) => makeDouyinCardSourceRow({
    rowId: `source-${index}`,
    sourceLevel1: `来源${index}`,
    cardUserPayAmountDelta: index === 0 ? 0 : index,
    currCardUserPayAmount: index,
    prevCardUserPayAmount: 0,
  }));
  const result = buildDouyinCardSourceWaterfall(rows, makeColorResolver());

  assertEqual(result.waterfallRows.length, 12, 'Douyin card source waterfall should cap visible rows at 12');
  assertEqual(
    result.waterfallRows.map((item) => item.sourceLevel1).slice(0, 3).join('>'),
    '来源1>来源2>来源3',
    'Douyin card source waterfall should preserve source order after filtering zero delta',
  );
  assertApprox(
    result.waterfallSteps[0].share,
    1 / 78 * 100,
    'Douyin card source fallback share should use visible rows only as denominator',
  );
}

function assertDouyinChannelContributionBehavior(buildDouyinChannelContribution) {
  const result = buildDouyinChannelContribution([
    {
      key: 'search',
      label: '搜索',
      current: 100,
      prev: 60,
      color: '#445df6',
    },
    {
      key: 'shop',
      label: '商城',
      current: 50,
      prev: 70,
      color: '#75B1F8',
    },
    {
      key: 'flat',
      label: '持平',
      current: 20,
      prev: 20,
      color: '#3264f6',
    },
  ]);

  assertEqual(result.hasChannelData, true, 'Douyin channel contribution should detect non-empty channel data');
  assertEqual(result.donutData.length, 3, 'Douyin channel donut should include all channel items');
  assertEqual(result.totalCurrent, 170, 'Douyin channel contribution should sum total current');
  assertEqual(result.totalPrev, 150, 'Douyin channel contribution should sum total previous');
  assertEqual(result.totalDelta, 20, 'Douyin channel contribution should calculate total delta');
  assertEqual(
    result.waterfallSteps.map((item) => item.name).join('>'),
    '搜索>商城',
    'Douyin channel waterfall should filter zero-delta items',
  );
  assertEqual(
    result.waterfallSteps.map((item) => item.color).join('>'),
    '#445df6>#75B1F8',
    'Douyin channel waterfall should use item colors, not index resolver colors',
  );
  assertApprox(
    result.waterfallSteps[0].share,
    40 / 20 * 100,
    'Douyin channel waterfall share should use total channel delta',
  );

  const emptyResult = buildDouyinChannelContribution([
    {
      key: 'empty',
      label: '空渠道',
      current: 0,
      prev: 0,
      color: '#445df6',
    },
  ]);
  assertEqual(emptyResult.hasChannelData, false, 'zero-only channel contribution should report no channel data');
  assertEqual(emptyResult.waterfallSteps.length, 0, 'zero-only channel contribution should have no waterfall steps');

  const offsettingResult = buildDouyinChannelContribution([
    {
      key: 'up',
      label: '增长渠道',
      current: 120,
      prev: 100,
      color: '#445df6',
    },
    {
      key: 'down',
      label: '下滑渠道',
      current: 80,
      prev: 100,
      color: '#75B1F8',
    },
  ]);
  assertEqual(offsettingResult.totalDelta, 0, 'offsetting channel deltas should keep total delta at 0');
  assertEqual(
    offsettingResult.waterfallSteps.map((item) => item.share).join(','),
    '0,0',
    'offsetting non-zero channel deltas should fall back to 0 share when total delta is zero',
  );
}

export async function runWeeklyWaterfallBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    buildChannelWaterfall,
    buildDouyinCardSourceWaterfall,
    buildDouyinChannelContribution,
    buildDouyinLiveWaterfall,
    buildGoodsWaterfall,
  } = await loadWeeklyWaterfallHelpers();

  assertGoodsWaterfallBehavior(buildGoodsWaterfall);
  assertChannelWaterfallBehavior(buildChannelWaterfall);
  assertDouyinLiveWaterfallBehavior(buildDouyinLiveWaterfall);
  assertDouyinCardSourceWaterfallBehavior(buildDouyinCardSourceWaterfall);
  assertDouyinChannelContributionBehavior(buildDouyinChannelContribution);
}
