/**
 * Weekly platform tab content-adapter behavior guard.
 *
 * PlatformTabContent delegates to three content components. The adapter layer
 * keeps each component's prop surface narrow: Tmall and Douyin get render-ready
 * attribution props, and trend gets only render-ready chart props. Keep those
 * contracts explicit during continued tab decomposition.
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
    throw new Error('weekly platform tab content adapter fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertKeys(...args) {
  currentAssertions().assertKeys(...args);
}

function assertSame(...args) {
  currentAssertions().assertSame(...args);
}

async function loadPlatformTabContentAdapters() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-platform-tab-adapters-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-content-adapters', [
      'buildDouyinPlatformContentProps',
      'buildTmallPlatformContentProps',
      'buildTrendPlatformContentProps',
    ]),
  });
}

function makeColumns() {
  return {
    goodsColumns: [{ key: 'goods' }],
    channelColumns: [{ key: 'channel' }],
    funnelDetailColumnsWithClickStage: [{ key: 'funnel-click' }],
    funnelDetailColumnsWithoutClickStage: [{ key: 'funnel-no-click' }],
    quantColumns: [{ key: 'quant' }],
    douyinLiveColumns: [{ key: 'douyin-live' }],
    douyinLiveDetailColumns: [{ key: 'douyin-live-detail' }],
    douyinShortvideoColumns: [{ key: 'douyin-shortvideo' }],
    douyinCardProductColumns: [{ key: 'douyin-card-product' }],
    douyinCardSourceColumns: [{ key: 'douyin-card-source' }],
  };
}

function makeContentProps() {
  const report = {
    meta: {
      report_id: '2026/4/26~2026/5/2',
    },
    charts: {
      trend_7d: [],
      platforms: [],
    },
  };
  const viewModel = {
    chartData: {
      series: [{ name: 'GMV', data: [1, 2] }],
      xAxis: ['4/26', '4/27'],
    },
    hasChartData: true,
    baseMetrics: {
      gmv: 1000,
      prevGmv: 800,
      gmvDelta: 200,
    },
    attributionSources: {
      attributionAsOfDate: '2026-05-02',
      channelAttributionAsOfDate: '2026-05-01',
    },
    primaryMetrics: [
      {
        key: 'gmv',
        label: 'GMV',
        value: '¥1,000',
        wow: 25,
      },
    ],
    tmallSectionData: {
      goodsTableRows: [{ rowId: 'goods-1', productId: 'P001', productName: '明星商品' }],
      goodsWaterfallSteps: [{ label: '商品A', value: 120 }],
      channelTableRows: [{ rowId: 'channel-1', channelKey: 'search', trafficChannelLabel: '搜索' }],
      channelWaterfallSteps: [{ label: '搜索', value: 80 }],
      funnelChannelSections: [],
      quantRows: [],
      quantRowsByChannel: new Map(),
      tmallAttributionTotals: {
        attributionTotalPrevGmv: 1100,
        attributionTotalGmv: 1500,
        attributionDelta: 400,
        channelAttributionTotalPrevPayAmount: 900,
        channelAttributionTotalPayAmount: 1280,
        channelAttributionDelta: 380,
      },
    },
    douyinSectionData: {
      showDouyinLiveSection: true,
      showDouyinShortvideoSection: false,
      showDouyinCardSection: true,
      douyinChannelAsOfDate: '2026-05-02',
      hasDouyinChannelData: true,
      douyinChannelDonutData: [{ name: '直播', value: 100 }],
      douyinChannelTotalCurrent: 128800,
      douyinChannelTotalPrev: 100000,
      douyinChannelDelta: 28800,
      douyinChannelWaterfallSteps: [{ label: '直播', value: 28800 }],
      hasDouyinChannelContributionData: true,
      selectedDouyinLiveRow: {
        rowId: 'live-selected',
        anchorNickname: '主播A',
        currLiveGmv: 128800,
        prevLiveGmv: 100000,
        liveGmvDelta: 28800,
      },
      selectedDouyinLiveStages: [{
        label: '曝光',
        value: 50000,
        prevValue: 40000,
        wow: 25,
      }],
      selectedDouyinLiveDetailRows: [{ key: 'live_exposure_count' }],
      selectedDouyinLiveQuantRows: [{ rowId: 'watch_rate' }],
      douyinLiveAsOfDate: '2026-05-04',
      douyinLiveTableRows: [{ rowId: 'live-1', liveSessionId: 'L001' }],
      douyinLiveTotalCurrent: 128800,
      douyinLiveTotalPrev: 100000,
      douyinLiveTotalDelta: 28800,
      douyinLiveWaterfallSteps: [{ label: '直播间A', value: 120 }],
      douyinShortvideoAsOfDate: '2026-05-04',
      selectedDouyinShortvideoRow: { rowId: 'SV001', authorNickname: '作者A' },
      selectedDouyinShortvideoDiagnosis: [{ reason: '曝光提升', action: '复用素材结构' }],
      douyinShortvideoTableRows: [{ rowId: 'SV001' }],
      douyinShortvideoTotalCurrent: 128800,
      douyinShortvideoTotalPrev: 100000,
      douyinShortvideoTotalDelta: 28800,
      douyinShortvideoWaterfallSteps: [{ label: '短视频A', value: 80 }],
      douyinCardAsOfDate: '2026-05-04',
      douyinCardProductTableRows: [{ rowId: 'product-1', productId: 'P001' }],
      douyinCardTotalCurrent: 128800,
      douyinCardTotalPrev: 100000,
      douyinCardTotalDelta: 28800,
      douyinCardProductWaterfallSteps: [{ label: '商品A', value: 28800 }],
      diagnosisCardProductId: 'P001',
      diagnosisCardProductName: '精华礼盒',
      douyinCardSourceTableRows: [{ rowId: 'source-1', sourceLevel1: '商城推荐' }],
      douyinCardSourceTotalCurrent: 88800,
      douyinCardSourceTotalPrev: 60000,
      douyinCardSourceTotalDelta: 28800,
      douyinCardSourceWaterfallSteps: [{ label: '商城推荐', value: 28800 }],
      selectedDouyinCardSource: { sourceLevel1: '商城推荐' },
      selectedDouyinCardSourceStages: [{
        label: '曝光',
        value: 50000,
        prevValue: 40000,
        wow: 25,
      }],
      selectedDouyinCardQuantRows: [{ rowId: 'click_rate' }],
      selectedDouyinCardDetailRows: [{ key: 'card_exposure_count' }],
    },
  };

  return {
    isMobile: true,
    report,
    platformLabel: '天猫',
    summaryWeekPeriod: '2026/4/26~2026/5/2',
    isTmallPlatform: true,
    isDouyinPlatform: false,
    columns: makeColumns(),
    viewModel,
  };
}

function assertTmallAdapter(buildTmallPlatformContentProps) {
  const contentProps = makeContentProps();
  const tmallProps = buildTmallPlatformContentProps(contentProps);

  assertKeys(
    tmallProps,
    ['attributionSectionProps', 'summaryCardProps'],
    'Tmall adapter should return render-ready content props',
  );
  assertKeys(
    tmallProps.summaryCardProps,
    ['reportId', 'summaryLabel', 'summaryScope', 'weekPeriod'],
    'Tmall adapter should build summary card props before render',
  );
  assertEqual(
    tmallProps.summaryCardProps.reportId,
    '2026/4/26~2026/5/2',
    'Tmall adapter should resolve summary report id before render',
  );
  assertEqual(
    tmallProps.summaryCardProps.weekPeriod,
    '2026/4/26~2026/5/2',
    'Tmall adapter should preserve summary week period inside card props',
  );
  assertEqual(
    tmallProps.summaryCardProps.summaryLabel,
    '天猫总结',
    'Tmall adapter should build summary label before render',
  );
  assertEqual(
    tmallProps.summaryCardProps.summaryScope,
    'tmall',
    'Tmall adapter should resolve summary scope before render',
  );
  assertKeys(
    tmallProps.attributionSectionProps,
    ['channelSectionProps', 'funnelSectionProps', 'goodsSectionProps'],
    'Tmall adapter should build attribution section props before render',
  );
  assertSame(
    tmallProps.attributionSectionProps.goodsSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.goodsColumns,
    'Tmall adapter should preserve goods columns inside render-ready table props',
  );
  assertSame(
    tmallProps.attributionSectionProps.channelSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.channelColumns,
    'Tmall adapter should preserve channel columns inside render-ready table props',
  );
  assertSame(
    tmallProps.attributionSectionProps.goodsSectionProps.overviewSectionProps.tableProps.dataSource,
    contentProps.viewModel.tmallSectionData.goodsTableRows,
    'Tmall adapter should preserve goods rows inside render-ready table props',
  );
  assertEqual(
    tmallProps.attributionSectionProps.funnelSectionProps.showEmptyFunnelSection,
    true,
    'Tmall adapter should resolve empty funnel visibility before render',
  );
  assertEqual('columns' in tmallProps, false, 'Tmall adapter should not leak raw columns');
  assertEqual('viewModel' in tmallProps, false, 'Tmall adapter should not leak view model');
  assertEqual('isMobile' in tmallProps, false, 'Tmall adapter should not leak raw responsive flag');
  assertEqual('report' in tmallProps, false, 'Tmall adapter should not pass report context');
  assertEqual('platformLabel' in tmallProps, false, 'Tmall adapter should not leak platform label');
}

function assertDouyinAdapter(buildDouyinPlatformContentProps) {
  const contentProps = makeContentProps();
  const douyinProps = buildDouyinPlatformContentProps(contentProps);

  assertKeys(
    douyinProps,
    ['channelSectionProps', 'sectionListProps', 'showEmptyAttributionSection'],
    'Douyin adapter should return render-ready attribution props',
  );
  assertEqual(
    douyinProps.showEmptyAttributionSection,
    false,
    'Douyin adapter should resolve non-empty attribution visibility before render',
  );
  assertSame(
    douyinProps.channelSectionProps.donutChartProps.data,
    contentProps.viewModel.douyinSectionData.douyinChannelDonutData,
    'Douyin adapter should resolve channel props before render',
  );
  assertSame(
    douyinProps.sectionListProps.liveSectionProps.sessionSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinLiveColumns,
    'Douyin adapter should preserve live columns inside render-ready table props',
  );
  assertSame(
    douyinProps.sectionListProps.liveSectionProps.funnelSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinLiveDetailColumns,
    'Douyin adapter should preserve live detail columns inside render-ready funnel props',
  );
  assertSame(
    douyinProps.sectionListProps.shortvideoSectionProps.overviewSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinShortvideoColumns,
    'Douyin adapter should preserve shortvideo columns inside render-ready table props',
  );
  assertSame(
    douyinProps.sectionListProps.cardSectionProps.productSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinCardProductColumns,
    'Douyin adapter should preserve card product columns inside render-ready table props',
  );
  assertSame(
    douyinProps.sectionListProps.cardSectionProps.sourceSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinCardSourceColumns,
    'Douyin adapter should preserve card source columns inside render-ready table props',
  );
  assertSame(
    douyinProps.sectionListProps.cardSectionProps.funnelSectionProps.quantSectionProps.tableProps.columns,
    contentProps.columns.quantColumns,
    'Douyin adapter should preserve quant columns inside render-ready table props',
  );
  assertEqual(
    'columns' in douyinProps,
    false,
    'Douyin adapter should not leak raw column bundle',
  );
  assertEqual(
    'viewModel' in douyinProps,
    false,
    'Douyin adapter should not leak view model',
  );
  assertEqual(
    'isMobile' in douyinProps,
    false,
    'Douyin adapter should not leak raw responsive flag',
  );
  assertEqual(
    'report' in douyinProps,
    false,
    'Douyin adapter should not pass report context',
  );
}

function assertTrendAdapter(buildTrendPlatformContentProps) {
  const contentProps = makeContentProps();
  const trendProps = buildTrendPlatformContentProps(contentProps);

  assertKeys(
    trendProps,
    ['lineChartProps', 'platformLabel', 'summaryText'],
    'Trend adapter should return render-ready trend section props',
  );
  assertEqual(trendProps.platformLabel, '天猫', 'Trend adapter should preserve platform label');
  assertSame(
    trendProps.lineChartProps.data,
    contentProps.viewModel.chartData,
    'Trend adapter should preserve chart data inside render-ready line chart props',
  );
  assertEqual(
    trendProps.summaryText,
    '上周同期：¥800 ｜ 本周 GMV：¥1,000 ｜ 增量：+¥200',
    'Trend adapter should format summary text before render',
  );
  assertEqual('viewModel' in trendProps, false, 'Trend adapter should not pass view model');
  assertEqual('columns' in trendProps, false, 'Trend adapter should not pass table columns');
  assertEqual('report' in trendProps, false, 'Trend adapter should not pass report context');
}

export async function runWeeklyPlatformTabContentAdaptersBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    buildDouyinPlatformContentProps,
    buildTmallPlatformContentProps,
    buildTrendPlatformContentProps,
  } = await loadPlatformTabContentAdapters();

  assertTmallAdapter(buildTmallPlatformContentProps);
  assertDouyinAdapter(buildDouyinPlatformContentProps);
  assertTrendAdapter(buildTrendPlatformContentProps);
}
