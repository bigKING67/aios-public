/**
 * Weekly platform tab render-state behavior guard.
 *
 * PlatformTab should stay a thin client boundary: resolve context, columns, and
 * delegate the empty/content decision plus content-prop assembly to a pure
 * helper. These checks keep that entry contract explicit while the weekly tab
 * internals continue to be split into smaller view-model modules.
 */

import path from 'node:path';
import {
  importBundledWeeklyBehaviorEntry,
  WEEKLY_TABS_ROOT,
} from '../../lib/weekly/behavior-assert-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly platform tab render-state fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertSame(...args) {
  currentAssertions().assertSame(...args);
}

async function loadPlatformTabRenderState() {
  const repoRoot = process.cwd();
  const tabsRoot = path.join(repoRoot, WEEKLY_TABS_ROOT);
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-platform-tab-state-',
    entrySource: [
      `export { resolvePlatformTabContext } from ${JSON.stringify(path.join(tabsRoot, 'platform-tab-context'))};`,
      `export { buildPlatformTabRenderState } from ${JSON.stringify(path.join(tabsRoot, 'platform-tab-render-state'))};`,
      '',
    ].join('\n'),
  });
}

const METRIC_DEFINITIONS = [
  { key: 'gmv', label: 'GMV' },
  { key: 'orders', label: '订单' },
  { key: 'uv', label: 'UV' },
];

const COLUMNS = {
  marker: 'columns-identity',
};

const CHANNEL_COLORS = {
  video: 'video-color-token',
  live: 'live-color-token',
  productCard: 'product-card-color-token',
};

function makeBaseReport(charts) {
  return {
    meta: {
      report_id: '2026/4/26~2026/5/2',
      period_start: '2026-04-26',
      period_end: '2026-05-02',
    },
    charts: {
      trend_7d: [],
      platforms: [],
      ...charts,
    },
  };
}

function makePlatform(overrides = {}) {
  return {
    platform: 'taobao',
    gmv: 1000,
    prev_gmv: 800,
    gsv: 900,
    orders: 50,
    prev_orders: 40,
    uv: 200,
    buyer_count: 25,
    prev_buyer_count: 20,
    refund_amount_refund_time: 80,
    prev_refund_amount_refund_time: 60,
    refund_amount_pay_time: 100,
    prev_refund_amount_pay_time: 80,
    visitor_count: 200,
    prev_visitor_count: 160,
    cost: 100,
    prev_cost: 80,
    ...overrides,
  };
}

function makeGoodsAttribution() {
  return {
    platform: 'taobao',
    week_period: '2026/4/26~2026/5/2',
    total_gmv: 1000,
    total_prev_gmv: 800,
    items: [
      {
        product_id: 'p-001',
        product_name: 'Alpha Serum',
        gmv: 600,
        prev_gmv: 400,
        gmv_delta: 200,
        gmv_delta_contribution: 1,
        buyer_count: 12,
        visitor_count: 120,
      },
    ],
  };
}

function buildState({
  buildPlatformTabRenderState,
  resolvePlatformTabContext,
  report,
  platform,
  isMobile = false,
}) {
  return buildPlatformTabRenderState({
    report,
    isMobile,
    context: resolvePlatformTabContext(report, platform),
    metricDefinitions: METRIC_DEFINITIONS,
    columns: COLUMNS,
    channelColors: CHANNEL_COLORS,
    resolveCategoryWaterfallColor: (index) => `waterfall-color-${index}`,
  });
}

function assertEmptyState(builders) {
  const report = makeBaseReport({
    platforms: [makePlatform({ platform: 'douyin' })],
  });
  const state = buildState({
    ...builders,
    report,
    platform: 'tmall',
  });

  assertEqual(state.kind, 'empty', 'missing exact platform row should return empty state');
}

function assertTmallContentState(builders) {
  const report = makeBaseReport({
    platforms: [makePlatform()],
    trend_7d: [
      {
        metric: 'taobao_gmv',
        points: [
          { date: '2026-04-26', value: 100 },
          { date: '2026-04-27', value: 120 },
        ],
      },
      {
        metric: 'orders_taobao',
        points: [
          { date: '2026-04-26', value: 10 },
          { date: '2026-04-27', value: 12 },
        ],
      },
    ],
    goods_attribution: [makeGoodsAttribution()],
  });
  const state = buildState({
    ...builders,
    report,
    platform: 'taobao',
    isMobile: true,
  });

  assertEqual(state.kind, 'content', 'matched Tmall alias should return content state');
  const { contentProps } = state;

  assertSame(contentProps.report, report, 'content props should preserve the report reference');
  assertSame(contentProps.columns, COLUMNS, 'content props should preserve the columns reference');
  assertEqual(contentProps.isMobile, true, 'content props should preserve isMobile');
  assertEqual(contentProps.platformLabel, '天猫', 'Tmall alias should resolve to the canonical label');
  assertEqual(contentProps.summaryWeekPeriod, '2026/4/26~2026/5/2', 'content props should preserve summary period');
  assertEqual(contentProps.isTmallPlatform, true, 'Tmall alias should set isTmallPlatform');
  assertEqual(contentProps.isDouyinPlatform, false, 'Tmall alias should not set isDouyinPlatform');
  assertEqual(contentProps.viewModel.baseMetrics.gmv, 1000, 'view model should receive platformData');
  assertEqual(
    contentProps.viewModel.chartData.series.map((item) => item.name).join('>'),
    'GMV>订单',
    'view model should receive metric definitions and platform aliases for trend series',
  );
  assertEqual(
    contentProps.viewModel.tmallSectionData.goodsWaterfallSteps[0]?.color,
    'waterfall-color-0',
    'render-state helper should pass category waterfall color resolver through to Tmall data',
  );
}

function assertDouyinContentState(builders) {
  const report = makeBaseReport({
    platforms: [
      makePlatform({
        platform: 'douyin',
        live_gmv: 700,
        prev_live_gmv: 500,
        shortvideo_gmv: 200,
        prev_shortvideo_gmv: 160,
        card_gmv: 100,
        prev_card_gmv: 80,
      }),
    ],
  });
  const state = buildState({
    ...builders,
    report,
    platform: 'douyin',
  });

  assertEqual(state.kind, 'content', 'matched Douyin platform should return content state');
  const { contentProps } = state;

  assertEqual(contentProps.platformLabel, '抖音', 'Douyin platform should resolve to the canonical label');
  assertEqual(contentProps.isDouyinPlatform, true, 'Douyin alias should set isDouyinPlatform');
  assertEqual(
    contentProps.viewModel.primaryMetrics.map((item) => item.key).join('>'),
    'gmv>gsv>refund>buyer>arpu>orders>live-gmv>video-gmv>card-gmv>roi',
    'Douyin content state should assemble Douyin channel metric cards',
  );
  assertEqual(
    contentProps.viewModel.douyinSectionData.douyinChannelBreakdown
      .map((item) => `${item.key}:${item.color}`)
      .join('|'),
    'video:video-color-token|live:live-color-token|product-card:product-card-color-token',
    'render-state helper should pass channel color tokens through to Douyin data',
  );
}

function assertTrafficDashState(builders) {
  const report = makeBaseReport({
    platforms: [
      makePlatform({
        platform: 'xhs',
        visitor_count: 999,
        prev_visitor_count: 500,
        pay_cvr: 0.4,
        prev_pay_cvr: 0.2,
        uv_value: 5,
        prev_uv_value: 4,
        roi: 8,
        prev_roi: 6,
      }),
    ],
  });
  const state = buildState({
    ...builders,
    report,
    platform: 'xhs',
  });

  assertEqual(state.kind, 'content', 'matched Xiaohongshu alias should return content state');
  assertEqual(state.contentProps.platformLabel, '小红书', 'Xiaohongshu alias should resolve to the canonical label');

  for (const key of ['visitor', 'pay-cvr', 'uv-value', 'roi']) {
    const metric = state.contentProps.viewModel.primaryMetrics.find((item) => item.key === key);
    assertEqual(metric?.value, '-', `${key} should keep traffic-quality metrics hidden for platform aliases that use dash`);
    assertEqual(metric?.wow, undefined, `${key} should not expose trend when dash is required`);
  }
}

export async function runWeeklyPlatformTabRenderStateBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const builders = await loadPlatformTabRenderState();

  assertEmptyState(builders);
  assertTmallContentState(builders);
  assertDouyinContentState(builders);
  assertTrafficDashState(builders);
}
