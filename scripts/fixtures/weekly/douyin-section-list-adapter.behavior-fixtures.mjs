/**
 * Weekly platform tab Douyin section-list adapter behavior fixtures.
 *
 * DouyinAttributionSectionList should stay routing/render-only. The adapter
 * owns mapping the wide list props into live, shortvideo, and card section
 * contracts so JSX containers do not regress into broad prop plumbing.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import path from 'node:path';
import {
  countCallExpressions,
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Douyin section-list adapter behavior fixtures require guard assertions.');
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

async function loadDouyinSectionListAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-section-list-adapter-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-douyin-section-list-adapter',
      ['buildDouyinAttributionSectionListProps'],
    ),
  });
}

function makeListProps() {
  return {
    isMobile: true,
    data: {
      showDouyinLiveSection: true,
      showDouyinShortvideoSection: true,
      showDouyinCardSection: true,
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

function assertNoCrossLeaks(sectionProps) {
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass view model');
}

function assertSectionContainerIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-section-list.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  for (const identifierName of [
    'buildDouyinAttributionSectionListProps',
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
      fail(`DouyinAttributionSectionList must stay render-ready: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-section-list-adapter')) {
    fail('DouyinAttributionSectionList must not import its adapter');
  }
  if (countCallExpressions(sourceFile, 'buildDouyinAttributionSectionList') > 0) {
    fail('DouyinAttributionSectionList must not build routing list directly');
  }
  if (hasImportSource(sourceFile, 'platform-tab-douyin-section-list-routing')) {
    fail('DouyinAttributionSectionList must not import section-list routing directly');
  }
  if (countCallExpressions(sourceFile, 'sectionList.map') !== 1) {
    fail('DouyinAttributionSectionList must render adapter-provided sectionList');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-section-list-contracts',
    importedName: 'DouyinAttributionSectionListProps',
  })) {
    fail('DouyinAttributionSectionList missing render contract import');
  }
  if (
    getFunctionParameterType(sourceFile, 'DouyinAttributionSectionList') !==
    'DouyinAttributionSectionListProps'
  ) {
    fail('DouyinAttributionSectionList should accept render-ready props directly');
  }
  for (const propName of [
    'sectionList,',
    'liveSectionProps',
    'shortvideoSectionProps',
    'cardSectionProps',
  ]) {
    const normalizedPropName = propName.replace(',', '');
    if (!hasFunctionObjectParameterBinding(sourceFile, 'DouyinAttributionSectionList', normalizedPropName)) {
      fail(`DouyinAttributionSectionList missing required render prop: ${normalizedPropName}`);
    }
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinLiveAttributionSections',
    spreadName: 'liveSectionProps',
  })) {
    fail('DouyinAttributionSectionList must spread liveSectionProps into live section');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinShortvideoAttributionSections',
    spreadName: 'shortvideoSectionProps',
  })) {
    fail('DouyinAttributionSectionList must spread shortvideoSectionProps into shortvideo section');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinCardAttributionSections',
    spreadName: 'cardSectionProps',
  })) {
    fail('DouyinAttributionSectionList must spread cardSectionProps into card section');
  }
}

function assertLiveSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['funnelSectionProps', 'sessionSectionProps', 'subsectionList'],
    'section-list adapter should return render-ready live section props',
  );
  assertEqual(
    sectionProps.subsectionList.map((section) => section.kind).join('>'),
    'session>funnel',
    'live section should receive stable subsection routing list',
  );

  assertKeys(
    sectionProps.sessionSectionProps,
    ['overviewSectionProps', 'summaryText'],
    'live session section should receive render-ready props',
  );
  assertSame(
    sectionProps.sessionSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinLiveTableRows,
    'live session section should preserve table rows inside table props',
  );
  assertSame(
    sectionProps.sessionSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveColumns,
    'live session section should preserve columns inside table props',
  );
  assertEqual(
    sectionProps.sessionSectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'live session waterfall should resolve total color before render',
  );
  assertEqual(
    sectionProps.sessionSectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'live session section should receive adapter-built summary text',
  );

  assertKeys(
    sectionProps.funnelSectionProps,
    ['overviewSectionProps', 'quantSectionProps', 'selectedAnchorNickname'],
    'live funnel section should receive render-ready props',
  );
  assertEqual(
    sectionProps.funnelSectionProps.selectedAnchorNickname,
    '主播A',
    'live funnel section should receive selected anchor nickname',
  );
  assertSame(
    sectionProps.funnelSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveDetailRows,
    'live funnel section should preserve detail rows inside table props',
  );
  assertSame(
    sectionProps.funnelSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'live funnel section should preserve detail columns inside table props',
  );
  assertEqual(
    sectionProps.funnelSectionProps.overviewSectionProps.funnelData[0].color,
    'stage-0',
    'live funnel section should resolve stage colors before render',
  );
  assertSame(
    sectionProps.funnelSectionProps.quantSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveQuantRows,
    'live funnel quant section should preserve quant rows inside table props',
  );
  assertSame(
    sectionProps.funnelSectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'live funnel quant section should preserve quant columns inside table props',
  );

  const leakedKeys = [
    'data',
    'douyinLiveColumns',
    'douyinLiveDetailColumns',
    'isMobile',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ];
  for (const key of leakedKeys) {
    assertEqual(key in sectionProps, false, `live section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.sessionSectionProps, false, `live session section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.funnelSectionProps, false, `live funnel section should not leak raw prop: ${key}`);
  }
  assertNoCrossLeaks(sectionProps);
}

function assertShortvideoSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['analysisSectionProps', 'overviewSectionProps', 'subsectionList'],
    'section-list adapter should return render-ready shortvideo section props',
  );
  assertEqual(
    sectionProps.subsectionList.map((section) => section.kind).join('>'),
    'overview>analysis',
    'shortvideo section should receive stable subsection routing list',
  );

  assertKeys(
    sectionProps.overviewSectionProps,
    ['overviewSectionProps', 'summaryText'],
    'shortvideo overview section should receive render-ready props',
  );
  assertSame(
    sectionProps.overviewSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinShortvideoTableRows,
    'shortvideo overview section should preserve table rows inside table props',
  );
  assertSame(
    sectionProps.overviewSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'shortvideo overview section should preserve columns inside table props',
  );
  assertEqual(
    sectionProps.overviewSectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'shortvideo overview waterfall should resolve total color before render',
  );
  assertEqual(
    sectionProps.overviewSectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'shortvideo overview section should receive adapter-built summary text',
  );

  assertKeys(
    sectionProps.analysisSectionProps,
    ['diagnosisCardProps', 'selectedAuthorNickname', 'tableProps'],
    'shortvideo analysis section should receive render-ready props',
  );
  assertEqual(
    sectionProps.analysisSectionProps.selectedAuthorNickname,
    '作者A',
    'shortvideo analysis section should receive selected author nickname',
  );
  assertSame(
    sectionProps.analysisSectionProps.tableProps.dataSource[0],
    sourceProps.data.selectedDouyinShortvideoRow,
    'shortvideo analysis section should preserve selected row inside table props',
  );
  assertSame(
    sectionProps.analysisSectionProps.tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'shortvideo analysis section should preserve columns inside table props',
  );
  assertEqual(
    sectionProps.analysisSectionProps.diagnosisCardProps.items[0].key,
    'SV001-diagnosis-0',
    'shortvideo analysis diagnosis item should keep selected row id key',
  );

  const leakedKeys = [
    'data',
    'douyinShortvideoColumns',
    'isMobile',
    'waterfallTotalColor',
  ];
  for (const key of leakedKeys) {
    assertEqual(key in sectionProps, false, `shortvideo section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.overviewSectionProps, false, `shortvideo overview section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.analysisSectionProps, false, `shortvideo analysis section should not leak raw prop: ${key}`);
  }
  assertNoCrossLeaks(sectionProps);
}

function assertCardSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    [
      'funnelSectionProps',
      'productSectionProps',
      'sourceSectionProps',
      'subsectionList',
    ],
    'section-list adapter should return render-ready card section props',
  );
  assertEqual(
    sectionProps.subsectionList.map((section) => section.kind).join('>'),
    'product>source>funnel',
    'card section should receive stable subsection routing list',
  );

  assertSame(
    sectionProps.productSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardProductTableRows,
    'card product section should preserve product rows inside table props',
  );
  assertSame(
    sectionProps.productSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinCardProductColumns,
    'card product section should preserve product columns inside table props',
  );
  assertEqual(
    sectionProps.productSectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'card product waterfall should resolve total color before render',
  );
  assertEqual(
    sectionProps.productSectionProps.summaryText.includes('同期口径截止'),
    true,
    'card product section should receive adapter-built summary text',
  );

  assertSame(
    sectionProps.sourceSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardSourceTableRows,
    'card source section should preserve source rows inside table props',
  );
  assertSame(
    sectionProps.sourceSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinCardSourceColumns,
    'card source section should preserve source columns inside table props',
  );
  assertEqual(
    sectionProps.sourceSectionProps.sourceDescription,
    '聚焦商品 精华礼盒（P001）拆解 12 个一级来源渠道。',
    'card source section should receive adapter-built description',
  );

  assertEqual(
    sectionProps.funnelSectionProps.selectedSourceLevelText,
    '商城推荐',
    'card funnel section should receive resolved source title text',
  );
  assertSame(
    sectionProps.funnelSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinCardDetailRows,
    'card funnel section should preserve detail rows inside table props',
  );
  assertSame(
    sectionProps.funnelSectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'card funnel section should preserve live-detail columns inside table props',
  );
  assertEqual(
    sectionProps.funnelSectionProps.overviewSectionProps.funnelData[0].color,
    'stage-0',
    'card funnel section should resolve stage colors before render',
  );
  assertSame(
    sectionProps.funnelSectionProps.quantSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinCardQuantRows,
    'card funnel quant section should preserve quant rows inside table props',
  );
  assertSame(
    sectionProps.funnelSectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'card funnel quant section should preserve quant columns inside table props',
  );

  const leakedKeys = [
    'data',
    'douyinCardProductColumns',
    'douyinCardSourceColumns',
    'douyinLiveDetailColumns',
    'isMobile',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ];
  for (const key of leakedKeys) {
    assertEqual(key in sectionProps, false, `card section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.productSectionProps, false, `card product section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.sourceSectionProps, false, `card source section should not leak raw prop: ${key}`);
    assertEqual(key in sectionProps.funnelSectionProps, false, `card funnel section should not leak raw prop: ${key}`);
  }
  assertNoCrossLeaks(sectionProps);
}

export async function runWeeklyDouyinSectionListAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionContainerIsRenderOnly(repoRoot);

  const {
    buildDouyinAttributionSectionListProps,
  } = await loadDouyinSectionListAdapter();

  const sourceProps = makeListProps();
  const bundle = buildDouyinAttributionSectionListProps(sourceProps);

  assertKeys(
    bundle,
    ['cardSectionProps', 'liveSectionProps', 'sectionList', 'shortvideoSectionProps'],
    'section-list adapter should return routing list plus live, shortvideo, and card section props',
  );
  assertEqual(
    bundle.sectionList.map((section) => section.kind).join('>'),
    'live>shortvideo>card',
    'section-list adapter should build visible Douyin section routing list in stable order',
  );
  assertLiveSectionProps(bundle.liveSectionProps, sourceProps);
  assertShortvideoSectionProps(bundle.shortvideoSectionProps, sourceProps);
  assertCardSectionProps(bundle.cardSectionProps, sourceProps);
}
