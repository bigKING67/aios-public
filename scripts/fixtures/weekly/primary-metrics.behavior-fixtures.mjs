/**
 * Weekly primary metrics behavior guard.
 *
 * The top metric cards switch between standard traffic quality cards and
 * Douyin channel GMV cards, while GSV can fall back to pay-time refund math.
 * Keep these checks explicit so view-model refactors do not silently change
 * visible card labels, dash behavior, or fallback formulas.
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
    throw new Error('weekly primary metrics fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function makeBaseMetrics(overrides = {}) {
  return {
    gmv: 1000,
    prevGmv: 800,
    prevGmvSafe: 800,
    gmvDelta: 200,
    gsv: undefined,
    refundAmount: 60,
    prevRefundAmount: 40,
    refundAmountPayTime: 150,
    prevRefundAmountPayTime: 120,
    prevGsv: 680,
    orders: 50,
    prevOrders: 40,
    buyerCount: 45,
    prevBuyerCount: 30,
    arpu: 22.22,
    prevArpu: 26.67,
    ...overrides,
  };
}

function makeQualityInputs(overrides = {}) {
  return {
    visitorCount: 2000,
    prevVisitorCount: 1600,
    cost: 100,
    prevCost: 80,
    ...overrides,
  };
}

function makeQualityMetrics(overrides = {}) {
  return {
    payCvr: 0.12,
    prevPayCvr: 0.1,
    uvValue: 1.5,
    prevUvValue: 1.2,
    roi: 10,
    prevRoi: 8,
    ...overrides,
  };
}

function makeDouyinChannelGmvSummary(overrides = {}) {
  return {
    liveGmv: 700,
    prevLiveGmv: 500,
    shortvideoGmv: 200,
    prevShortvideoGmv: 160,
    cardGmv: 100,
    prevCardGmv: 80,
    ...overrides,
  };
}

async function loadWeeklyPrimaryMetrics() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-primary-metrics-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-view-model-primary-metrics', [
      'resolvePlatformTabPrimaryMetrics',
      'resolvePlatformTabPrimaryMetricValues',
    ]),
  });
}

function buildParams(overrides = {}) {
  return {
    baseMetrics: makeBaseMetrics(overrides.baseMetrics),
    qualityInputs: makeQualityInputs(overrides.qualityInputs),
    qualityMetrics: makeQualityMetrics(overrides.qualityMetrics),
    douyinChannelGmvSummary: makeDouyinChannelGmvSummary(overrides.douyinChannelGmvSummary),
    isDouyinPlatform: false,
    useDashForTrafficQualityMetrics: false,
    ...overrides.params,
  };
}

function assertStandardPlatformBehavior(resolvePlatformTabPrimaryMetrics) {
  const metrics = resolvePlatformTabPrimaryMetrics(buildParams());

  assertEqual(
    metrics.map((item) => item.key).join('>'),
    'gmv>gsv>refund>buyer>arpu>orders>visitor>pay-cvr>uv-value>roi',
    'standard platform should append traffic quality cards after base cards',
  );
  assertEqual(
    metrics.find((item) => item.key === 'gsv')?.value,
    '¥850',
    'GSV should fall back to GMV minus pay-time refund amount when explicit GSV is missing',
  );
  assertEqual(metrics.find((item) => item.key === 'visitor')?.value, '2,000', 'visitor card should use integer formatting');
  assertEqual(metrics.find((item) => item.key === 'pay-cvr')?.value, '12%', 'pay conversion card should use percent formatting');
  assertEqual(metrics.find((item) => item.key === 'uv-value')?.value, '¥1.50', 'UV value card should use fixed currency formatting');
  assertEqual(metrics.find((item) => item.key === 'roi')?.value, '10.00', 'ROI card should use two-digit decimal formatting');
}

function assertDashBehavior(resolvePlatformTabPrimaryMetrics) {
  const metrics = resolvePlatformTabPrimaryMetrics(buildParams({
    params: {
      useDashForTrafficQualityMetrics: true,
    },
  }));

  for (const key of ['visitor', 'pay-cvr', 'uv-value', 'roi']) {
    const metric = metrics.find((item) => item.key === key);
    assertEqual(metric?.value, '-', `${key} should render a dash when traffic quality metrics are hidden`);
    assertEqual(metric?.wow, undefined, `${key} should hide WoW when traffic quality metrics are hidden`);
  }
}

function assertDouyinPlatformBehavior(resolvePlatformTabPrimaryMetrics) {
  const metrics = resolvePlatformTabPrimaryMetrics(buildParams({
    params: {
      isDouyinPlatform: true,
      useDashForTrafficQualityMetrics: true,
    },
  }));

  assertEqual(
    metrics.map((item) => item.key).join('>'),
    'gmv>gsv>refund>buyer>arpu>orders>live-gmv>video-gmv>card-gmv>roi',
    'Douyin platform should replace traffic quality cards with channel GMV cards',
  );
  assertEqual(metrics.find((item) => item.key === 'live-gmv')?.value, '¥700', 'Douyin live GMV card should stay visible even when traffic quality metrics use dash');
  assertEqual(metrics.find((item) => item.key === 'video-gmv')?.value, '¥200', 'Douyin shortvideo GMV card should stay visible');
  assertEqual(metrics.find((item) => item.key === 'card-gmv')?.value, '¥100', 'Douyin product-card GMV card should stay visible');
  assertEqual(metrics.find((item) => item.key === 'roi')?.value, '-', 'ROI should still follow traffic quality dash behavior');
}

function assertResolvedValueBehavior(resolvePlatformTabPrimaryMetricValues) {
  const fallbackValues = resolvePlatformTabPrimaryMetricValues(buildParams());
  assertEqual(fallbackValues.gsvValue, 850, 'resolved values should expose the GSV fallback value');

  const explicitValues = resolvePlatformTabPrimaryMetricValues(buildParams({
    baseMetrics: {
      gsv: 930,
    },
  }));
  assertEqual(explicitValues.gsvValue, 930, 'explicit GSV should take priority over fallback math');
}

export async function runWeeklyPrimaryMetricsBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    resolvePlatformTabPrimaryMetrics,
    resolvePlatformTabPrimaryMetricValues,
  } = await loadWeeklyPrimaryMetrics();

  assertStandardPlatformBehavior(resolvePlatformTabPrimaryMetrics);
  assertDashBehavior(resolvePlatformTabPrimaryMetrics);
  assertDouyinPlatformBehavior(resolvePlatformTabPrimaryMetrics);
  assertResolvedValueBehavior(resolvePlatformTabPrimaryMetricValues);
}
