/**
 * Weekly platform tab Douyin attribution top-level adapter behavior fixtures.
 *
 * DouyinAttributionSections should stay render-only. The adapter owns mapping
 * the wide attribution input contract into the channel section, section list,
 * and empty-state visibility contract.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxElement,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
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
    throw new Error('Douyin attribution section adapter behavior fixtures require guard assertions.');
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

function fail(...args) {
  currentAssertions().fail(...args);
}

async function loadDouyinAttributionSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-attribution-section-adapter-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-douyin-attribution-section-adapter',
      ['buildDouyinAttributionSectionProps'],
    ),
  });
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function makeAttributionProps(overrides = {}) {
  const data = {
    showDouyinLiveSection: false,
    showDouyinShortvideoSection: false,
    showDouyinCardSection: false,
    douyinChannelAsOfDate: '2026-05-04',
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
    ...overrides,
  };

  return {
    isMobile: true,
    data,
    douyinLiveColumns: [{ key: 'live' }],
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    douyinShortvideoColumns: [{ key: 'shortvideo' }],
    douyinCardProductColumns: [{ key: 'card-product' }],
    douyinCardSourceColumns: [{ key: 'card-source' }],
    quantColumns: [{ key: 'quant' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertChannelSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['donutChartProps', 'summaryText', 'waterfallChartProps'],
    'top-level adapter should return render-ready channel section props',
  );
  assertKeys(
    sectionProps.donutChartProps,
    ['data', 'height', 'title', 'totalLabel'],
    'channel section donut props should stay narrow',
  );
  assertSame(
    sectionProps.donutChartProps.data,
    sourceProps.data.douyinChannelDonutData,
    'channel donut should preserve donut data reference',
  );
  assertEqual(sectionProps.donutChartProps.height, 360, 'channel donut should preserve height');
  assertKeys(
    sectionProps.waterfallChartProps,
    [
      'endLabel',
      'endValue',
      'gridBottomPx',
      'height',
      'showBoundaryTotals',
      'startLabel',
      'startValue',
      'steps',
      'title',
      'totalColor',
    ],
    'channel section waterfall props should stay narrow',
  );
  assertSame(
    sectionProps.waterfallChartProps.steps,
    sourceProps.data.douyinChannelWaterfallSteps,
    'channel waterfall should preserve waterfall steps reference',
  );
  assertEqual(
    sectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'channel waterfall should preserve waterfall total color',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'channel section should receive adapter-built summary text',
  );
  assertEqual('data' in sectionProps, false, 'channel section props should not leak raw data');
  assertEqual(
    'waterfallTotalColor' in sectionProps,
    false,
    'channel section props should not leak waterfall color token',
  );
}

function assertSectionListProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    [
      'cardSectionProps',
      'liveSectionProps',
      'sectionList',
      'shortvideoSectionProps',
    ],
    'top-level adapter should return render-ready section-list props',
  );
  assertSame(
    sectionProps.liveSectionProps.sessionSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinLiveTableRows,
    'section-list live props should resolve live rows before render',
  );
  assertSame(
    sectionProps.liveSectionProps.sessionSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveColumns,
    'section-list live props should preserve live columns inside table props',
  );
  assertEqual(
    sectionProps.liveSectionProps.sessionSectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'section-list live props should resolve total color before render',
  );
  assertSame(
    sectionProps.liveSectionProps.funnelSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveDetailRows,
    'section-list live funnel props should preserve detail rows before render',
  );
  assertSame(
    sectionProps.liveSectionProps.funnelSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'section-list live funnel props should preserve live-detail columns inside table props',
  );
  assertSame(
    sectionProps.liveSectionProps.funnelSectionProps.quantSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveQuantRows,
    'section-list live quant props should preserve quant rows before render',
  );
  assertSame(
    sectionProps.liveSectionProps.funnelSectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'section-list live quant props should preserve quant columns inside table props',
  );
  assertSame(
    sectionProps.shortvideoSectionProps.overviewSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'section-list shortvideo props should preserve shortvideo columns inside table props',
  );
  assertSame(
    sectionProps.shortvideoSectionProps.overviewSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinShortvideoTableRows,
    'section-list shortvideo props should resolve shortvideo rows before render',
  );
  assertEqual(
    sectionProps.shortvideoSectionProps.overviewSectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'section-list shortvideo props should resolve total color before render',
  );
  assertSame(
    sectionProps.shortvideoSectionProps.analysisSectionProps.tableProps.dataSource[0],
    sourceProps.data.selectedDouyinShortvideoRow,
    'section-list shortvideo analysis props should preserve selected row before render',
  );
  assertSame(
    sectionProps.cardSectionProps.productSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardProductTableRows,
    'section-list card props should resolve product rows before render',
  );
  assertSame(
    sectionProps.cardSectionProps.sourceSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardSourceTableRows,
    'section-list card props should resolve source rows before render',
  );
  assertEqual(
    sectionProps.cardSectionProps.funnelSectionProps.overviewSectionProps.funnelData[0].color,
    'stage-0',
    'section-list card props should resolve stage colors before render',
  );

  const leakedKeys = [
    'data',
    'douyinCardProductColumns',
    'douyinCardSourceColumns',
    'douyinLiveColumns',
    'douyinLiveDetailColumns',
    'douyinShortvideoColumns',
    'isMobile',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ];
  for (const key of leakedKeys) {
    assertEqual(key in sectionProps, false, `section-list props should not leak raw prop: ${key}`);
  }
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass view model');
}

function assertSectionContainerIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-sections.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, sectionPath);

  for (const identifierName of [
    'buildDouyinAttributionSectionProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinCardProductRow',
    'DouyinCardSourceRow',
    'DouyinLiveSessionRow',
    'DouyinMetricDetailRow',
    'DouyinShortvideoRow',
    'QuantAttributionRow',
    'isMobile',
    'data',
    'douyinLiveColumns',
    'douyinLiveDetailColumns',
    'douyinShortvideoColumns',
    'douyinCardProductColumns',
    'douyinCardSourceColumns',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinAttributionSections must stay render-ready: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-attribution-section-adapter')) {
    fail('DouyinAttributionSections must not import its adapter');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-section-contracts',
    importedName: 'DouyinAttributionSectionsProps',
  })) {
    fail('DouyinAttributionSections missing render contract import');
  }
  if (
    getFunctionParameterType(sourceFile, 'DouyinAttributionSections') !==
    'DouyinAttributionSectionsProps'
  ) {
    fail('DouyinAttributionSections should accept render-ready props directly');
  }

  for (const identifierName of [
    'channelSectionProps',
    'sectionListProps',
    'showEmptyAttributionSection',
  ]) {
    if (!hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinAttributionSections missing required render prop: ${identifierName}`);
    }
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinChannelAttributionSection',
    spreadName: 'channelSectionProps',
  })) {
    fail('DouyinAttributionSections must spread channelSectionProps into channel section');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinAttributionSectionList',
    spreadName: 'sectionListProps',
  })) {
    fail('DouyinAttributionSections must spread sectionListProps into section list');
  }
  if (!hasJsxElement(sourceFile, 'DouyinEmptyAttributionSection')) {
    fail('DouyinAttributionSections must render the empty attribution section');
  }
}

function assertBundle(bundle, sourceProps, expectedEmpty) {
  assertKeys(
    bundle,
    ['channelSectionProps', 'sectionListProps', 'showEmptyAttributionSection'],
    'top-level adapter should return channel, section-list, and empty-state contract',
  );
  assertChannelSectionProps(bundle.channelSectionProps, sourceProps);
  assertSectionListProps(bundle.sectionListProps, sourceProps);
  assertEqual(
    bundle.showEmptyAttributionSection,
    expectedEmpty,
    'top-level adapter should preserve resolved empty-state visibility',
  );
  assertNoCrossLeaks(bundle.channelSectionProps);
  assertNoCrossLeaks(bundle.sectionListProps);
}

export async function runWeeklyDouyinAttributionSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionContainerIsRenderOnly(repoRoot);

  const {
    buildDouyinAttributionSectionProps,
  } = await loadDouyinAttributionSectionAdapter();

  const emptyProps = makeAttributionProps();
  assertBundle(buildDouyinAttributionSectionProps(emptyProps), emptyProps, true);

  const liveProps = makeAttributionProps({ showDouyinLiveSection: true });
  assertBundle(buildDouyinAttributionSectionProps(liveProps), liveProps, false);
}
