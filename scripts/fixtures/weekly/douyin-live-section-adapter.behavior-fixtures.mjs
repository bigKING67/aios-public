/**
 * Weekly platform tab Douyin live-section adapter behavior fixtures.
 *
 * DouyinLiveAttributionSections should stay render-only. The adapter owns the
 * mapping from the live attribution input contract into the two narrow child
 * section contracts: session attribution and live funnel analysis.
 */

import path from 'node:path';
import {
  countCallExpressions,
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
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
    throw new Error('Douyin live section adapter behavior fixtures require guard assertions.');
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

async function loadDouyinLiveSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-live-section-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-live-section-adapter', [
      'buildDouyinLiveAttributionSectionProps',
    ]),
  });
}

function makeLiveSectionProps() {
  const data = {
    selectedDouyinLiveRow: {
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
  };

  return {
    isMobile: true,
    data,
    douyinLiveColumns: [{ key: 'live' }],
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    quantColumns: [{ key: 'quant' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertSessionSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['overviewSectionProps', 'summaryText'],
    'live session adapter should keep only render-ready session section props',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'live session overview props should stay narrow',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'live session section should build attribution summary in adapter',
  );

  const { tableProps, waterfallChartProps } = sectionProps.overviewSectionProps;
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'live session table props should stay render-ready and narrow',
  );
  assertSame(tableProps.dataSource, sourceProps.data.douyinLiveTableRows, 'live session table should preserve rows reference');
  assertSame(tableProps.columns, sourceProps.douyinLiveColumns, 'live session table should preserve columns reference');
  assertEqual(tableProps.size, 'small', 'live session mobile table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'live session mobile table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'live session mobile table should hide size changer');
  assertEqual(tableProps.scroll.x, 980, 'live session mobile table should use mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.douyinLiveTableRows[0]),
    'live-1',
    'live session table rowKey should use stable row id',
  );

  assertKeys(
    waterfallChartProps,
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
    'live session waterfall props should stay render-ready and narrow',
  );
  assertEqual(waterfallChartProps.title, '直播GMV增量瀑布（对比上周同期）', 'live session waterfall title should be adapter-owned');
  assertEqual(waterfallChartProps.startValue, 100000, 'live session waterfall should map previous GMV');
  assertEqual(waterfallChartProps.endValue, 128800, 'live session waterfall should map current GMV');
  assertSame(waterfallChartProps.steps, sourceProps.data.douyinLiveWaterfallSteps, 'live session waterfall should preserve steps reference');
  assertEqual(waterfallChartProps.totalColor, sourceProps.waterfallTotalColor, 'live session waterfall should use centralized total color');
  assertEqual('data' in sectionProps, false, 'live session section should not leak raw data');
  assertEqual('douyinLiveColumns' in sectionProps, false, 'live session section should not leak raw columns');
  assertEqual('isMobile' in sectionProps, false, 'live session section should not leak responsive flag');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'live session section should not leak raw waterfall color');
}

function assertFunnelSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    [
      'overviewSectionProps',
      'quantSectionProps',
      'selectedAnchorNickname',
    ],
    'live funnel adapter should keep only render-ready funnel section props',
  );
  assertEqual(sectionProps.selectedAnchorNickname, '主播A', 'live funnel section should resolve anchor nickname');
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveDetailRows,
    'live funnel overview table should preserve detail rows reference',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'live funnel overview table should preserve live-detail columns reference',
  );
  assertEqual(sectionProps.overviewSectionProps.tableProps.size, 'small', 'live funnel mobile table should use compact size');
  assertEqual(sectionProps.overviewSectionProps.tableProps.pagination, false, 'live funnel table should disable pagination');
  assertEqual(sectionProps.overviewSectionProps.tableProps.scroll.x, 680, 'live funnel mobile table should use mobile x');
  assertEqual(
    sectionProps.overviewSectionProps.tableProps.rowKey(sourceProps.data.selectedDouyinLiveDetailRows[0]),
    'live_exposure_count',
    'live funnel table rowKey should use metric key',
  );
  assertEqual(sectionProps.overviewSectionProps.funnelData[0].color, 'stage-0', 'live funnel adapter should resolve stage colors');
  assertEqual(
    sectionProps.overviewSectionProps.summaryText,
    '场次小结｜上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'live funnel adapter should build period delta summary',
  );
  assertEqual(sectionProps.quantSectionProps.tableProps.variant, 'quant', 'live funnel quant table should use quant variant');
  assertSame(
    sectionProps.quantSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveQuantRows,
    'live funnel quant table should preserve quant rows reference',
  );
  assertSame(
    sectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'live funnel quant table should preserve quant columns reference',
  );
  assertEqual(
    sectionProps.quantSectionProps.tableProps.rowKey(sourceProps.data.selectedDouyinLiveQuantRows[0]),
    'watch_rate',
    'live funnel quant table rowKey should use row id',
  );
  assertEqual('data' in sectionProps, false, 'live funnel section should not leak raw data');
  assertEqual('douyinLiveDetailColumns' in sectionProps, false, 'live funnel section should not leak raw detail columns');
  assertEqual('quantColumns' in sectionProps, false, 'live funnel section should not leak raw quant columns');
  assertEqual('isMobile' in sectionProps, false, 'live funnel section should not leak responsive flag');
  assertEqual('resolveFunnelStageColor' in sectionProps, false, 'live funnel section should not leak stage color resolver');
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass view model');
  assertEqual(
    'douyinLiveDetailColumns' in sectionProps && 'douyinLiveColumns' in sectionProps,
    false,
    'section props should not mix session and funnel table contracts',
  );
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function assertSectionContainerIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-sections.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, sectionPath);

  const bannedIdentifiers = [
    'buildDouyinLiveAttributionSectionProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinLiveSessionRow',
    'DouyinMetricDetailRow',
    'QuantAttributionRow',
    'isMobile',
    'data',
    'douyinLiveColumns',
    'douyinLiveDetailColumns',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ];

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveAttributionSections must stay render-ready: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-live-section-adapter')) {
    fail('DouyinLiveAttributionSections must not import the live section adapter');
  }
  if (countCallExpressions(sourceFile, 'buildDouyinLiveAttributionSubsectionList') > 0) {
    fail('DouyinLiveAttributionSections must not build subsection routing directly');
  }
  if (hasImportSource(sourceFile, 'platform-tab-douyin-live-sections-routing')) {
    fail('DouyinLiveAttributionSections must not import subsection routing directly');
  }
  if (!hasIdentifier(sourceFile, 'subsectionList') || countCallExpressions(sourceFile, 'subsectionList.map') !== 1) {
    fail('DouyinLiveAttributionSections must render adapter-provided subsectionList');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-live-section-contracts',
    importedName: 'DouyinLiveAttributionSectionsProps',
  })) {
    fail('DouyinLiveAttributionSections missing render-ready contract import');
  }
  if (getFunctionParameterType(sourceFile, 'DouyinLiveAttributionSections') !== 'DouyinLiveAttributionSectionsProps') {
    fail('DouyinLiveAttributionSections should accept DouyinLiveAttributionSectionsProps directly');
  }

  for (const identifierName of ['sessionSectionProps', 'funnelSectionProps']) {
    if (!hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveAttributionSections missing required render contract: ${identifierName}`);
    }
  }

  const requiredSectionSpreads = [
    {
      tagName: 'DouyinLiveSessionAttributionSection',
      spreadName: 'sessionSectionProps',
    },
    {
      tagName: 'DouyinLiveFunnelAttributionSection',
      spreadName: 'funnelSectionProps',
    },
  ];

  for (const sectionSpread of requiredSectionSpreads) {
    if (!hasJsxElementWithSpread(sourceFile, sectionSpread)) {
      fail(`DouyinLiveAttributionSections must render ${sectionSpread.tagName} with adapter-built props`);
    }
  }
}

export async function runWeeklyDouyinLiveSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionContainerIsRenderOnly(repoRoot);

  const {
    buildDouyinLiveAttributionSectionProps,
  } = await loadDouyinLiveSectionAdapter();

  const sourceProps = makeLiveSectionProps();
  const bundle = buildDouyinLiveAttributionSectionProps(sourceProps);

  assertKeys(
    bundle,
    ['funnelSectionProps', 'sessionSectionProps', 'subsectionList'],
    'live adapter should return routing list plus the two live section prop groups',
  );
  assertEqual(
    bundle.subsectionList.map((section) => section.kind).join('>'),
    'session>funnel',
    'live adapter should build subsection routing list in stable order',
  );

  assertSessionSectionProps(bundle.sessionSectionProps, sourceProps);
  assertFunnelSectionProps(bundle.funnelSectionProps, sourceProps);
  assertNoCrossLeaks(bundle.sessionSectionProps);
  assertNoCrossLeaks(bundle.funnelSectionProps);
}
