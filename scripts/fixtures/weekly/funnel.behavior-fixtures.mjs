import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

function createFunnelFixture(overrides = {}) {
  return {
    product_id: 'sku-001',
    product_name: '清洁精华',
    traffic_channel: 'keyword_ad',
    curr_impression_count: 100,
    prev_impression_count: 80,
    curr_click_count: 20,
    prev_click_count: 10,
    curr_cart_count: 5,
    prev_cart_count: 2,
    curr_pay_buyer_count: 2,
    prev_pay_buyer_count: 1,
    curr_pay_amount: 200,
    prev_pay_amount: 120,
    curr_cost: 40,
    prev_cost: 30,
    curr_wangwang_consult_count: 0,
    prev_wangwang_consult_count: 0,
    curr_member_join_count: 0,
    prev_member_join_count: 0,
    curr_new_buyer_count: 0,
    prev_new_buyer_count: 0,
    curr_coupon_claim_count: 0,
    prev_coupon_claim_count: 0,
    curr_total_favorite_cart_count: 0,
    prev_total_favorite_cart_count: 0,
    ...overrides,
  };
}

function makeFunnelRow(overrides = {}) {
  return {
    rowId: 'row',
    productId: 'sku-001',
    productName: '清洁精华',
    trafficChannel: 'keyword_ad',
    trafficChannelLabel: '关键词推广',
    metricSource: 'taobao_one',
    hasClickStage: true,
    currVisitorCount: undefined,
    prevVisitorCount: undefined,
    currImpressionCount: 100,
    prevImpressionCount: 80,
    currClickCount: 20,
    prevClickCount: 10,
    currCartCount: 5,
    prevCartCount: 2,
    currPayBuyerCount: 2,
    prevPayBuyerCount: 1,
    currPayAmount: 200,
    prevPayAmount: 120,
    payAmountWoW: undefined,
    currCtr: undefined,
    prevCtr: undefined,
    currClickToCartRate: undefined,
    prevClickToCartRate: undefined,
    currCartToPayRate: undefined,
    prevCartToPayRate: undefined,
    currCost: 40,
    prevCost: 30,
    costWoW: undefined,
    currRoi: undefined,
    prevRoi: undefined,
    roiWoW: undefined,
    currAvgClickCost: undefined,
    prevAvgClickCost: undefined,
    currCpm: undefined,
    prevCpm: undefined,
    currClickConversionRate: undefined,
    prevClickConversionRate: undefined,
    currWangwangConsultCount: 0,
    prevWangwangConsultCount: 0,
    currMemberJoinCount: 0,
    prevMemberJoinCount: 0,
    currNewBuyerCount: 0,
    prevNewBuyerCount: 0,
    currCouponClaimCount: 0,
    prevCouponClaimCount: 0,
    currTotalFavoriteCartCount: 0,
    prevTotalFavoriteCartCount: 0,
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
    currLiveExposureUserCount: 100,
    prevLiveExposureUserCount: 50,
    currLiveWatchUserCount: 40,
    prevLiveWatchUserCount: 20,
    currLiveProductExposureUser: 20,
    prevLiveProductExposureUser: 10,
    currLiveProductClickUser: 5,
    prevLiveProductClickUser: 2,
    currLiveBuyerCount: 1,
    prevLiveBuyerCount: 1,
    currLiveOrderCount: 1,
    prevLiveOrderCount: 1,
    currLiveGmv: 200,
    prevLiveGmv: 120,
    liveGmvDelta: 80,
    currLiveUserPayAmount: 200,
    prevLiveUserPayAmount: 120,
    currLiveAdCost: 30,
    prevLiveAdCost: 20,
    currCommentCount: 10,
    prevCommentCount: 8,
    currNewFollowerCount: 6,
    prevNewFollowerCount: 4,
    currProductCount: 3,
    prevProductCount: 2,
    currAvgOrderValue: 200,
    prevAvgOrderValue: 120,
    ...overrides,
  };
}

function makeDouyinCardSourceRow(overrides = {}) {
  return {
    rowId: 'card-source-row',
    sourceLevel1: '商城推荐',
    currCardExposureUserCount: 100,
    prevCardExposureUserCount: 50,
    currCardClickUserCount: 25,
    prevCardClickUserCount: 10,
    currCardBuyerCount: 5,
    prevCardBuyerCount: 2,
    currCardCartUserCount: 8,
    prevCardCartUserCount: 4,
    currCardFavoriteUserCount: 7,
    prevCardFavoriteUserCount: 3,
    currCardBounceUserCount: 12,
    prevCardBounceUserCount: 6,
    currCardOrderCount: 5,
    prevCardOrderCount: 2,
    currCardUserPayAmount: 300,
    prevCardUserPayAmount: 120,
    cardUserPayAmountDelta: 180,
    currCardClickRate: 0.25,
    prevCardClickRate: 0.2,
    currCardClickToPayRate: 0.2,
    prevCardClickToPayRate: 0.1,
    ...overrides,
  };
}

async function loadWeeklyFunnelHelpers() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-funnel-',
    entrySource: [
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-funnel-row-mapper', [
        'mapFunnelChannelItem',
      ]),
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-funnel-helpers', [
        'buildDouyinLiveFunnelStagePoints',
        'buildFunnelStagePoints',
      ]),
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-card-source-stages', [
        'buildDouyinCardSourceStages',
      ]),
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-funnel-section-builders', [
        'buildAlignedChannelWaterfallSteps',
        'buildFunnelChannelSections',
      ]),
    ],
  });
}

function assertMapperBehavior(mapFunnelChannelItem, { assertApprox, assertEqual }) {
  const row = mapFunnelChannelItem(createFunnelFixture({
    curr_visitor_count: -9,
    prev_visitor_count: -1,
  }));

  assertEqual(row.hasClickStage, true, 'has_click_stage should default to true');
  assertEqual(row.currVisitorCount, 0, 'negative current visitor count should clamp to 0');
  assertEqual(row.prevVisitorCount, 0, 'negative previous visitor count should clamp to 0');
  assertApprox(row.currCtr, 0.2, 'CTR should fall back to click / impression');
  assertApprox(row.prevCtr, 0.125, 'previous CTR should fall back to click / impression');
  assertApprox(row.currRoi, 5, 'ROI should fall back to pay amount / cost');
  assertApprox(row.prevRoi, 4, 'previous ROI should fall back to pay amount / cost');
  assertApprox(row.roiWoW, 25, 'ROI WoW should use current and previous ROI percent');
  assertApprox(row.payAmountWoW, 200 / 3, 'pay amount WoW should use current and previous pay amount percent');
  assertApprox(row.costWoW, 100 / 3, 'cost WoW should use current and previous cost percent');
  assertApprox(row.currAvgClickCost, 2, 'average click cost should fall back to cost / click');
  assertApprox(row.prevAvgClickCost, 3, 'previous average click cost should fall back to cost / click');
  assertApprox(row.currCpm, 400, 'CPM should fall back to cost * 1000 / impression');
  assertApprox(row.prevCpm, 375, 'previous CPM should fall back to cost * 1000 / impression');
  assertApprox(row.currClickConversionRate, 0.1, 'click conversion rate should fall back to pay buyer / click');
  assertApprox(row.prevClickConversionRate, 0.1, 'previous click conversion rate should fall back to pay buyer / click');
  assertEqual(
    row.rowId,
    'sku-001|keyword_ad|taobao_one|100|20|5|2|200.0000|40.0000',
    'rowId should keep product, channel, source, current counts, amount, and cost order stable',
  );

  const roundedCoreCountRow = mapFunnelChannelItem(createFunnelFixture({
    curr_impression_count: -1,
    prev_impression_count: 80.6,
    curr_click_count: 20.4,
    prev_click_count: -10,
    curr_cart_count: 5.5,
    prev_cart_count: -2,
    curr_pay_buyer_count: 2.49,
    prev_pay_buyer_count: -1,
  }));
  assertEqual(roundedCoreCountRow.currImpressionCount, 0, 'current impression count should clamp negative values');
  assertEqual(roundedCoreCountRow.prevImpressionCount, 81, 'previous impression count should round decimal values');
  assertEqual(roundedCoreCountRow.currClickCount, 20, 'current click count should round decimal values');
  assertEqual(roundedCoreCountRow.prevClickCount, 0, 'previous click count should clamp negative values');
  assertEqual(roundedCoreCountRow.currCartCount, 6, 'current cart count should round half up');
  assertEqual(roundedCoreCountRow.prevCartCount, 0, 'previous cart count should clamp negative values');
  assertEqual(roundedCoreCountRow.currPayBuyerCount, 2, 'current pay buyer count should round decimal values');
  assertEqual(roundedCoreCountRow.prevPayBuyerCount, 0, 'previous pay buyer count should clamp negative values');

  const engagementRow = mapFunnelChannelItem(createFunnelFixture({
    curr_wangwang_consult_count: -1.2,
    prev_wangwang_consult_count: 2.6,
    curr_member_join_count: 3.2,
    prev_member_join_count: -4,
    curr_new_buyer_count: 4.5,
    prev_new_buyer_count: 5.49,
    curr_coupon_claim_count: -3,
    prev_coupon_claim_count: 6.51,
    curr_total_favorite_cart_count: 7.49,
    prev_total_favorite_cart_count: -9,
  }));
  assertEqual(engagementRow.currWangwangConsultCount, 0, 'current consult count should clamp negative values');
  assertEqual(engagementRow.prevWangwangConsultCount, 3, 'previous consult count should round decimal values');
  assertEqual(engagementRow.currMemberJoinCount, 3, 'current member join count should round decimal values');
  assertEqual(engagementRow.prevMemberJoinCount, 0, 'previous member join count should clamp negative values');
  assertEqual(engagementRow.currNewBuyerCount, 5, 'current new buyer count should round half up');
  assertEqual(engagementRow.prevNewBuyerCount, 5, 'previous new buyer count should round decimal values');
  assertEqual(engagementRow.currCouponClaimCount, 0, 'current coupon claim count should clamp negative values');
  assertEqual(engagementRow.prevCouponClaimCount, 7, 'previous coupon claim count should round decimal values');
  assertEqual(engagementRow.currTotalFavoriteCartCount, 7, 'current favorite-cart count should round decimal values');
  assertEqual(engagementRow.prevTotalFavoriteCartCount, 0, 'previous favorite-cart count should clamp negative values');

  const missingVisitorRow = mapFunnelChannelItem(createFunnelFixture());
  assertEqual(missingVisitorRow.currVisitorCount, undefined, 'missing curr_visitor_count should stay undefined, not become 0');

  const fallbackMetadataRow = mapFunnelChannelItem(createFunnelFixture({
    product_id: '',
    product_name: '',
    traffic_channel: '',
    metric_source: '',
  }));
  assertEqual(fallbackMetadataRow.productId, '--', 'empty product_id should fall back to --');
  assertEqual(fallbackMetadataRow.productName, '(未命名商品)', 'empty product_name should fall back to unnamed product label');
  assertEqual(fallbackMetadataRow.trafficChannel, 'unknown', 'empty traffic_channel should fall back to unknown');
  assertEqual(fallbackMetadataRow.metricSource, 'taobao_one', 'empty metric_source should fall back to taobao_one');
  assertEqual(
    fallbackMetadataRow.rowId,
    '--|unknown|taobao_one|100|20|5|2|200.0000|40.0000',
    'metadata fallbacks should be reflected in rowId',
  );

  const noClickStageRow = mapFunnelChannelItem(createFunnelFixture({
    has_click_stage: false,
    curr_visitor_count: 50,
    prev_visitor_count: 25,
    curr_click_count: 999,
    prev_click_count: 999,
    curr_cart_count: 10,
    prev_cart_count: 5,
  }));
  assertEqual(noClickStageRow.hasClickStage, false, 'explicit false has_click_stage should be preserved');
  assertApprox(noClickStageRow.currClickToCartRate, 0.2, 'no-click stage click-to-cart fallback should use visitor base');
  assertApprox(noClickStageRow.prevClickToCartRate, 0.2, 'no-click stage previous click-to-cart fallback should use visitor base');

  const noClickMissingVisitorRow = mapFunnelChannelItem(createFunnelFixture({
    has_click_stage: false,
    curr_click_count: 10,
    prev_click_count: 5,
    curr_cart_count: 2,
    prev_cart_count: 1,
  }));
  assertApprox(noClickMissingVisitorRow.currClickToCartRate, 0.2, 'no-click stage click-to-cart fallback should use click count when visitor is missing');
  assertApprox(noClickMissingVisitorRow.prevClickToCartRate, 0.2, 'no-click stage previous click-to-cart fallback should use click count when visitor is missing');

  const explicitRateRow = mapFunnelChannelItem(createFunnelFixture({
    curr_ctr: 0.91,
    prev_ctr: 0.82,
    curr_click_to_cart_rate: 0.73,
    prev_click_to_cart_rate: 0.64,
    curr_cart_to_pay_rate: 0.55,
    prev_cart_to_pay_rate: 0.46,
    curr_roi: 3.7,
    prev_roi: 2.8,
  }));
  assertApprox(explicitRateRow.currCtr, 0.91, 'explicit current CTR should take priority over fallback');
  assertApprox(explicitRateRow.prevCtr, 0.82, 'explicit previous CTR should take priority over fallback');
  assertApprox(explicitRateRow.currClickToCartRate, 0.73, 'explicit current click-to-cart rate should take priority over fallback');
  assertApprox(explicitRateRow.prevClickToCartRate, 0.64, 'explicit previous click-to-cart rate should take priority over fallback');
  assertApprox(explicitRateRow.currCartToPayRate, 0.55, 'explicit current cart-to-pay rate should take priority over fallback');
  assertApprox(explicitRateRow.prevCartToPayRate, 0.46, 'explicit previous cart-to-pay rate should take priority over fallback');
  assertApprox(explicitRateRow.currRoi, 3.7, 'explicit current ROI should take priority over fallback');
  assertApprox(explicitRateRow.prevRoi, 2.8, 'explicit previous ROI should take priority over fallback');

  const explicitMetricsRow = mapFunnelChannelItem(createFunnelFixture({
    curr_avg_click_cost: 9.1,
    prev_avg_click_cost: 8.2,
    curr_cpm: 123.4,
    prev_cpm: 98.7,
    curr_click_conversion_rate: 0.321,
    prev_click_conversion_rate: 0.123,
  }));
  assertApprox(explicitMetricsRow.currAvgClickCost, 9.1, 'explicit current average click cost should take priority over fallback');
  assertApprox(explicitMetricsRow.prevAvgClickCost, 8.2, 'explicit previous average click cost should take priority over fallback');
  assertApprox(explicitMetricsRow.currCpm, 123.4, 'explicit current CPM should take priority over fallback');
  assertApprox(explicitMetricsRow.prevCpm, 98.7, 'explicit previous CPM should take priority over fallback');
  assertApprox(explicitMetricsRow.currClickConversionRate, 0.321, 'explicit current click conversion rate should take priority over fallback');
  assertApprox(explicitMetricsRow.prevClickConversionRate, 0.123, 'explicit previous click conversion rate should take priority over fallback');

  const zeroBaseMetricsRow = mapFunnelChannelItem(createFunnelFixture({
    curr_impression_count: 0,
    prev_impression_count: 0,
    curr_click_count: 0,
    prev_click_count: 0,
  }));
  assertEqual(zeroBaseMetricsRow.currAvgClickCost, undefined, 'average click cost fallback should stay undefined when click base is zero');
  assertEqual(zeroBaseMetricsRow.currCtr, undefined, 'CTR fallback should stay undefined when impression base is zero');
  assertEqual(zeroBaseMetricsRow.currClickToCartRate, undefined, 'click-to-cart fallback should stay undefined when click base is zero');
  assertEqual(zeroBaseMetricsRow.currCpm, undefined, 'CPM fallback should stay undefined when impression base is zero');
  assertEqual(zeroBaseMetricsRow.currClickConversionRate, undefined, 'click conversion rate fallback should stay undefined when click base is zero');

  const zeroCartAndCostRow = mapFunnelChannelItem(createFunnelFixture({
    curr_cart_count: 0,
    prev_cart_count: 0,
    curr_cost: 0,
    prev_cost: 0,
  }));
  assertEqual(zeroCartAndCostRow.currCartToPayRate, undefined, 'cart-to-pay fallback should stay undefined when cart base is zero');
  assertEqual(zeroCartAndCostRow.currRoi, undefined, 'ROI fallback should stay undefined when cost base is zero');
}

function assertStagePointBehavior(buildFunnelStagePoints, { assertApprox, assertEqual }) {
  const clickStages = buildFunnelStagePoints([
    makeFunnelRow({
      currImpressionCount: 100,
      prevImpressionCount: 50,
      currClickCount: 20,
      prevClickCount: 10,
      currCartCount: 5,
      prevCartCount: 4,
      currPayBuyerCount: 2,
      prevPayBuyerCount: 1,
    }),
  ]);
  assertEqual(clickStages.map((item) => item.key).join('>'), 'impression>click>cart>pay', 'click-stage funnel should use impression-click-cart-pay order');
  assertEqual(
    clickStages.map((item) => item.conversionLabel || '').join('|'),
    '|点击率|点击加购率|加购转化率',
    'click-stage conversion labels should stay stable',
  );
  assertApprox(clickStages[1].conversionRate, 0.2, 'click-stage CTR should use click / impression');
  assertApprox(clickStages[2].conversionRate, 0.25, 'click-stage cart rate should use cart / click');
  assertApprox(clickStages[3].conversionRate, 0.4, 'click-stage pay rate should use pay / cart');

  const noClickStages = buildFunnelStagePoints([
    makeFunnelRow({
      hasClickStage: false,
      currVisitorCount: undefined,
      prevVisitorCount: undefined,
      currImpressionCount: 80,
      prevImpressionCount: 40,
      currCartCount: 8,
      prevCartCount: 4,
      currPayBuyerCount: 2,
      prevPayBuyerCount: 1,
    }),
  ]);
  assertEqual(noClickStages.map((item) => item.key).join('>'), 'visitor>cart>pay', 'no-click-stage funnel should use visitor-cart-pay order');
  assertEqual(noClickStages[0].value, 80, 'missing visitor should fall back to current impression');
  assertEqual(noClickStages[0].prevValue, 40, 'missing previous visitor should fall back to previous impression');
  assertEqual(
    noClickStages.map((item) => item.conversionLabel || '').join('|'),
    '|访客加购率|加购转化率',
    'no-click-stage conversion labels should stay stable',
  );
  assertApprox(noClickStages[1].conversionRate, 0.1, 'no-click-stage cart rate should use cart / visitor');
}

function assertDouyinLiveStagePointBehavior(buildDouyinLiveFunnelStagePoints, { assertApprox, assertEqual }) {
  const liveStages = buildDouyinLiveFunnelStagePoints(makeDouyinLiveRow());

  assertEqual(
    liveStages.map((item) => item.key).join('>'),
    'live-exposure>live-watch>live-product-exposure>live-product-click>live-buyer',
    'Douyin live funnel should keep exposure-watch-product exposure-product click-buyer order',
  );
  assertEqual(
    liveStages.map((item) => item.conversionLabel || '').join('|'),
    '|看播率|商品曝光率|商品点击率|商品点击成交转化率',
    'Douyin live funnel conversion labels should stay stable',
  );
  assertApprox(liveStages[0].wow, 100, 'Douyin live exposure WoW should use stage value percent change');
  assertApprox(liveStages[1].conversionRate, 0.4, 'Douyin live watch rate should use watch / exposure');
  assertApprox(liveStages[2].conversionRate, 0.5, 'Douyin live product exposure rate should use product exposure / watch');
  assertApprox(liveStages[3].conversionRate, 0.25, 'Douyin live product click rate should use product click / product exposure');
  assertApprox(liveStages[4].conversionRate, 0.2, 'Douyin live click-to-pay rate should use buyer / product click');
  assertApprox(liveStages[3].conversionWoW, 25, 'Douyin live conversion WoW should use current and previous conversion rates');

  const zeroBaseStages = buildDouyinLiveFunnelStagePoints(makeDouyinLiveRow({
    currLiveExposureUserCount: 0,
    prevLiveExposureUserCount: 0,
    currLiveWatchUserCount: 0,
    prevLiveWatchUserCount: 0,
    currLiveProductExposureUser: 0,
    prevLiveProductExposureUser: 0,
    currLiveProductClickUser: 0,
    prevLiveProductClickUser: 0,
  }));
  assertEqual(
    zeroBaseStages[1].conversionRate,
    undefined,
    'Douyin live watch rate should stay undefined when exposure base is zero',
  );
  assertEqual(
    zeroBaseStages[1].conversionWoW,
    undefined,
    'Douyin live conversion WoW should stay undefined when conversion bases are unavailable',
  );
}

function assertDouyinCardSourceStageBehavior(buildDouyinCardSourceStages, { assertApprox, assertEqual }) {
  assertEqual(buildDouyinCardSourceStages(undefined).length, 0, 'missing Douyin card source row should produce no stages');

  const cardStages = buildDouyinCardSourceStages(makeDouyinCardSourceRow());
  assertEqual(cardStages.map((item) => item.key).join('>'), 'card-exposure>card-click>card-buyer', 'Douyin card source funnel should keep exposure-click-buyer order');
  assertEqual(
    cardStages.map((item) => item.conversionLabel || '').join('|'),
    '|点击率|点击成交率',
    'Douyin card source conversion labels should stay stable',
  );
  assertApprox(cardStages[0].wow, 100, 'Douyin card source exposure WoW should use stage value percent change');
  assertApprox(cardStages[1].conversionRate, 0.25, 'Douyin card source click rate should use explicit current click rate');
  assertApprox(cardStages[1].conversionWoW, 25, 'Douyin card source click-rate WoW should use current and previous conversion rates');
  assertApprox(cardStages[2].conversionWoW, 100, 'Douyin card source click-to-pay WoW should use current and previous conversion rates');

  const missingPrevRateStages = buildDouyinCardSourceStages(makeDouyinCardSourceRow({
    prevCardClickRate: undefined,
  }));
  assertEqual(
    missingPrevRateStages[1].conversionWoW,
    undefined,
    'Douyin card source conversion WoW should stay undefined when previous rate is missing',
  );
}

function assertSectionBehavior(buildFunnelChannelSections, { assertEqual }) {
  const rows = [
    makeFunnelRow({
      rowId: 'search-1',
      trafficChannel: 'search',
      trafficChannelLabel: '搜索',
      currPayAmount: 10,
      prevPayAmount: 4,
    }),
    makeFunnelRow({
      rowId: 'keyword-1',
      trafficChannel: 'keyword_ad',
      trafficChannelLabel: '关键词推广',
      currPayAmount: 30,
      prevPayAmount: 10,
    }),
    ...Array.from({ length: 80 }, (_, index) => makeFunnelRow({
      rowId: `overflow-${index}`,
      trafficChannel: 'overflow',
      trafficChannelLabel: '溢出渠道',
      currPayAmount: 999,
      prevPayAmount: 0,
    })),
  ];

  const sections = buildFunnelChannelSections({
    funnelRows: rows,
    funnelSelectedChannels: ['search', 'overflow'],
    funnelSelectedChannelDetails: [
      {
        trafficChannel: 'keyword-ad',
        trafficChannelLabel: '关键词推广',
        gmvDelta: 20,
        contributionRate: 40,
      },
      {
        trafficChannel: 'keyword_ad',
        trafficChannelLabel: '关键词推广重复',
        gmvDelta: 20,
        contributionRate: 30,
      },
      {
        trafficChannel: 'search',
        trafficChannelLabel: '搜索',
        gmvDelta: 6,
        contributionRate: undefined,
      },
    ],
  });

  assertEqual(
    sections.map((item) => item.channelKey).join('|'),
    'keywordad|search',
    'channel details should take priority over selected channels and dedupe normalized keys',
  );
  assertEqual(sections[0].titleText, '关键词推广(+40%)', 'detail title should include contribution tag');
  assertEqual(sections[0].currPayAmount, 30, 'section should summarize current pay amount');
  assertEqual(sections[0].prevPayAmount, 10, 'section should summarize previous pay amount');
  assertEqual(
    sections.some((item) => item.channelKey === 'overflow'),
    false,
    'display rows should be capped at the first 80 rows before grouping',
  );

  const fallbackSections = buildFunnelChannelSections({
    funnelRows: [
      makeFunnelRow({ rowId: 'a', trafficChannel: 'scene_ad', trafficChannelLabel: '场景推广' }),
      makeFunnelRow({ rowId: 'b', trafficChannel: 'scene-ad', trafficChannelLabel: '场景推广' }),
    ],
    funnelSelectedChannels: [],
    funnelSelectedChannelDetails: [],
  });
  assertEqual(fallbackSections.length, 1, 'fallback channel list should group by normalized traffic channel');
  assertEqual(fallbackSections[0].rows.length, 2, 'normalized channel group should include all matching rows');

  const labelFallbackSections = buildFunnelChannelSections({
    funnelRows: [
      makeFunnelRow({
        rowId: 'label-only',
        trafficChannel: '自定义渠道',
        trafficChannelLabel: '自定义渠道',
        currPayAmount: 12,
        prevPayAmount: 6,
      }),
    ],
    funnelSelectedChannels: [],
    funnelSelectedChannelDetails: [
      {
        trafficChannel: '',
        trafficChannelLabel: '自定义渠道',
        gmvDelta: 6,
        contributionRate: 25,
      },
    ],
  });
  assertEqual(labelFallbackSections.length, 1, 'detail candidate should fall back to label normalization when traffic channel is empty');
  assertEqual(
    labelFallbackSections[0].titleText,
    '自定义渠道(+25%)',
    'label fallback detail title should still include contribution tag',
  );
}

function assertWaterfallBehavior(buildAlignedChannelWaterfallSteps, { assertApprox, assertEqual }) {
  const colorCalls = [];
  const colorResolver = (index) => {
    colorCalls.push(index);
    return `color-${index}`;
  };
  const selectedDetails = [
    {
      trafficChannel: 'keyword-ad',
      trafficChannelLabel: '关键词推广',
      gmvDelta: 200,
      contributionRate: 55,
    },
    {
      trafficChannel: 'search',
      trafficChannelLabel: '搜索',
      gmvDelta: 50,
      contributionRate: undefined,
    },
    {
      trafficChannel: 'missing',
      trafficChannelLabel: '缺失渠道',
      gmvDelta: 10,
      contributionRate: undefined,
    },
  ];
  const channelRows = [
    {
      rowId: 'attr-keyword',
      productId: 'sku-001',
      productName: '清洁精华',
      trafficChannel: 'keyword_ad',
      trafficChannelLabel: '关键词推广',
      payAmount: 300,
      prevPayAmount: 100,
      payAmountWoW: undefined,
      payAmountDelta: 200,
      payAmountDeltaContribution: undefined,
      payBuyerCount: 0,
      visitorCount: 0,
      cartBuyerCount: 0,
    },
    {
      rowId: 'attr-other',
      productId: 'sku-001',
      productName: '清洁精华',
      trafficChannel: 'other',
      trafficChannelLabel: '其他',
      payAmount: 150,
      prevPayAmount: 100,
      payAmountWoW: undefined,
      payAmountDelta: 50,
      payAmountDeltaContribution: undefined,
      payBuyerCount: 0,
      visitorCount: 0,
      cartBuyerCount: 0,
    },
  ];
  const funnelRows = [
    makeFunnelRow({
      trafficChannel: 'search',
      trafficChannelLabel: '搜索',
      currPayAmount: 80,
      prevPayAmount: 30,
    }),
  ];
  const zeroDeltaChannelRows = [
    {
      ...channelRows[0],
      trafficChannel: 'zero',
      trafficChannelLabel: '零变化',
      payAmount: 100,
      prevPayAmount: 100,
      payAmountDelta: 0,
    },
  ];

  assertEqual(
    buildAlignedChannelWaterfallSteps({
      channelRows,
      funnelRows,
      funnelSelectedChannelDetails: selectedDetails,
      funnelDiagnosisProductId: '--',
      resolveCategoryWaterfallColor: colorResolver,
    }).length,
    0,
    'missing diagnosis product should produce no waterfall steps',
  );

  const steps = buildAlignedChannelWaterfallSteps({
    channelRows,
    funnelRows,
    funnelSelectedChannelDetails: selectedDetails,
    funnelDiagnosisProductId: 'sku-001',
    resolveCategoryWaterfallColor: colorResolver,
  });

  assertEqual(steps.length, 2, 'waterfall should include matched attribution and funnel fallback rows only');
  assertEqual(steps[0].current, 300, 'matched attribution row should provide current amount');
  assertEqual(steps[0].prev, 100, 'matched attribution row should provide previous amount');
  assertEqual(steps[0].delta, 200, 'matched attribution row should provide delta');
  assertEqual(steps[0].share, 55, 'detail contribution rate should take priority for share');
  assertEqual(steps[0].color, 'color-0', 'color resolver should use detail index for first matched detail');
  assertEqual(steps[1].current, 80, 'funnel fallback should provide current amount');
  assertEqual(steps[1].prev, 30, 'funnel fallback should provide previous amount');
  assertEqual(steps[1].delta, 50, 'funnel fallback should use current - previous delta');
  assertApprox(steps[1].share, 20, 'missing contribution rate should fall back to product delta share');
  assertEqual(steps[1].color, 'color-1', 'color resolver should use detail index for second matched detail');
  assertEqual(colorCalls.join(','), '0,1', 'color resolver should only be called for included steps');

  const zeroDeltaSteps = buildAlignedChannelWaterfallSteps({
    channelRows: zeroDeltaChannelRows,
    funnelRows: [],
    funnelSelectedChannelDetails: [
      {
        trafficChannel: 'zero',
        trafficChannelLabel: '零变化',
        gmvDelta: 0,
        contributionRate: undefined,
      },
    ],
    funnelDiagnosisProductId: 'sku-001',
    resolveCategoryWaterfallColor: colorResolver,
  });
  assertEqual(
    zeroDeltaSteps[0]?.share,
    0,
    'missing contribution rate should fall back to 0 share when diagnosis delta is zero',
  );
}

export async function runWeeklyFunnelBehaviorFixtures({
  assertApprox,
  assertEqual,
}) {
  const {
    mapFunnelChannelItem,
    buildDouyinLiveFunnelStagePoints,
    buildDouyinCardSourceStages,
    buildFunnelStagePoints,
    buildFunnelChannelSections,
    buildAlignedChannelWaterfallSteps,
  } = await loadWeeklyFunnelHelpers();

  const assertions = { assertApprox, assertEqual };
  assertMapperBehavior(mapFunnelChannelItem, assertions);
  assertStagePointBehavior(buildFunnelStagePoints, assertions);
  assertDouyinLiveStagePointBehavior(buildDouyinLiveFunnelStagePoints, assertions);
  assertDouyinCardSourceStageBehavior(buildDouyinCardSourceStages, assertions);
  assertSectionBehavior(buildFunnelChannelSections, assertions);
  assertWaterfallBehavior(buildAlignedChannelWaterfallSteps, assertions);
}
