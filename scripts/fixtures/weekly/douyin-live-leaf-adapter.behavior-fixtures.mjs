/**
 * Weekly platform tab Douyin live leaf-adapter behavior fixtures.
 *
 * Live leaf containers should not manually fan out data fields into their
 * overview/quant children. The adapter owns field extraction and summary text.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasLocalTypeDeclaration,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Douyin live leaf adapter behavior fixtures require guard assertions.');
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

async function loadDouyinLiveLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-live-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-live-leaf-adapter', [
      'buildDouyinLiveSessionAttributionLeafProps',
      'buildDouyinLiveFunnelAttributionLeafProps',
    ]),
  });
}

function assertLiveLeafAdapterOwnsNoContracts() {
  const adapterPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-leaf-adapter.ts';
  const { sourceFile } = parseTsxFile(adapterPath);

  for (const typeName of [
    'DouyinLiveSessionAttributionLeafPropsBundle',
    'DouyinLiveFunnelAttributionLeafPropsBundle',
    'BuildDouyinLiveSessionAttributionLeafPropsInput',
    'BuildDouyinLiveFunnelAttributionLeafPropsInput',
  ]) {
    if (hasLocalTypeDeclaration(sourceFile, typeName)) {
      fail(`live leaf adapter must import leaf contracts instead of declaring local contract: ${typeName}`);
    }
  }

  for (const identifierName of [
    'ColumnsType',
    'DouyinLiveSectionData',
    'DouyinLiveSessionAttributionOverviewSectionProps',
    'DouyinLiveFunnelOverviewSectionProps',
    'DouyinLiveQuantSectionProps',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`live leaf adapter must consume external contracts, not define/import raw section props: ${identifierName}`);
    }
  }

  if (!hasImportSource(sourceFile, 'platform-tab-douyin-live-leaf-contracts')) {
    fail('live leaf adapter should import its leaf contracts');
  }
  for (const importedName of [
    'BuildDouyinLiveSessionAttributionLeafPropsInput',
    'BuildDouyinLiveFunnelAttributionLeafPropsInput',
    'DouyinLiveSessionAttributionLeafPropsBundle',
    'DouyinLiveFunnelAttributionLeafPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-douyin-live-leaf-contracts',
      importedName,
    })) {
      fail(`live leaf adapter missing external leaf contract import: ${importedName}`);
    }
  }
  if (
    getFunctionParameterType(sourceFile, 'buildDouyinLiveSessionAttributionLeafProps') !==
    'BuildDouyinLiveSessionAttributionLeafPropsInput'
  ) {
    fail('buildDouyinLiveSessionAttributionLeafProps should accept the external input contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'buildDouyinLiveFunnelAttributionLeafProps') !==
    'BuildDouyinLiveFunnelAttributionLeafPropsInput'
  ) {
    fail('buildDouyinLiveFunnelAttributionLeafProps should accept the external input contract');
  }
}

function makeLiveData(overrides = {}) {
  return {
    douyinLiveAsOfDate: '2026-05-04',
    douyinLiveTableRows: [{ rowId: 'live-1' }],
    douyinLiveTotalCurrent: 128800,
    douyinLiveTotalPrev: 100000,
    douyinLiveTotalDelta: 28800,
    douyinLiveWaterfallSteps: [{ label: '直播A', value: 28800 }],
    selectedDouyinLiveRow: {
      rowId: 'live-1',
      anchorNickname: '主播A',
      prevLiveGmv: 100000,
      currLiveGmv: 128800,
      liveGmvDelta: 28800,
    },
    selectedDouyinLiveStages: [{
      key: 'exposure',
      label: '曝光',
      value: 50000,
      prevValue: 40000,
      wow: 25,
      conversionLabel: '点击率',
      conversionRate: 0.1234,
      conversionPrevRate: 0.0987,
      conversionWoW: 2.47,
    }],
    selectedDouyinLiveDetailRows: [{ key: 'live_exposure_count' }],
    selectedDouyinLiveQuantRows: [{ rowId: 'watch-rate' }],
    ...overrides,
  };
}

function makeSessionProps() {
  return {
    isMobile: true,
    data: makeLiveData(),
    douyinLiveColumns: [{ key: 'live' }],
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function makeFunnelProps(overrides = {}) {
  return {
    isMobile: true,
    data: makeLiveData(overrides),
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    quantColumns: [{ key: 'quant' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin live data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'leaf child props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertNoContextLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin live data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertFunnelData(funnelData) {
  assertEqual(Array.isArray(funnelData), true, 'funnel overview should receive built funnel chart data');
  assertEqual(funnelData.length, 1, 'funnel chart data should keep stage count');
  assertKeys(
    funnelData[0],
    [
      'color',
      'conversionPrevText',
      'conversionText',
      'conversionWoW',
      'name',
      'prevText',
      'prevValue',
      'value',
      'wow',
    ],
    'built funnel chart data item should keep FunnelChart data shape',
  );
  assertEqual(funnelData[0].name, '曝光', 'funnel chart data should map stage label to name');
  assertEqual(funnelData[0].value, 50000, 'funnel chart data should preserve stage value');
  assertEqual(funnelData[0].prevValue, 40000, 'funnel chart data should preserve previous stage value');
  assertEqual(funnelData[0].wow, 25, 'funnel chart data should preserve stage wow');
  assertEqual(funnelData[0].conversionText, '点击率 12.34%', 'funnel chart data should format conversion text');
  assertEqual(funnelData[0].conversionPrevText, '上周 9.87%', 'funnel chart data should format previous conversion text');
  assertEqual(funnelData[0].conversionWoW, 2.47, 'funnel chart data should preserve conversion wow');
  assertEqual(funnelData[0].prevText, '上周 40,000', 'funnel chart data should format previous value');
  assertEqual(funnelData[0].color, 'stage-0', 'funnel chart data should resolve stage color in adapter');
}

function assertWaterfallChartProps(waterfallChartProps, sourceProps) {
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
    'session waterfall chart props should stay narrow',
  );
  assertEqual(
    waterfallChartProps.title,
    '直播GMV增量瀑布（对比上周同期）',
    'session waterfall title should be adapter-owned',
  );
  assertEqual(waterfallChartProps.startLabel, '上周同期', 'session waterfall should preserve start label');
  assertEqual(waterfallChartProps.endLabel, '本周同期', 'session waterfall should preserve end label');
  assertEqual(waterfallChartProps.startValue, sourceProps.data.douyinLiveTotalPrev, 'session waterfall should preserve previous total');
  assertEqual(waterfallChartProps.endValue, sourceProps.data.douyinLiveTotalCurrent, 'session waterfall should preserve current total');
  assertSame(waterfallChartProps.steps, sourceProps.data.douyinLiveWaterfallSteps, 'session waterfall should preserve steps');
  assertEqual(waterfallChartProps.totalColor, sourceProps.waterfallTotalColor, 'session waterfall should preserve color');
  assertEqual(waterfallChartProps.showBoundaryTotals, false, 'session waterfall should hide boundary totals');
  assertEqual(waterfallChartProps.height, 360, 'session waterfall should preserve height');
  assertEqual(waterfallChartProps.gridBottomPx, 26, 'session waterfall should preserve grid bottom');
  assertNoCrossLeaks(waterfallChartProps);
}

function assertAttributionTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'session overview table props should stay narrow',
  );
  assertSame(
    tableProps.dataSource,
    sourceProps.data.douyinLiveTableRows,
    'session overview table should preserve row list reference',
  );
  assertSame(
    tableProps.columns,
    sourceProps.douyinLiveColumns,
    'session overview table should preserve columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile session overview table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'mobile session overview table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'mobile session overview table should hide size changer');
  assertEqual(tableProps.scroll.x, 980, 'mobile session overview table should use mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.douyinLiveTableRows[0]),
    'live-1',
    'session overview table rowKey should use row id',
  );
  assertNoContextLeaks(tableProps);
}

function assertFunnelTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'funnel detail table props should stay narrow',
  );
  assertSame(
    tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveDetailRows,
    'funnel detail table should preserve detail rows',
  );
  assertSame(
    tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'funnel detail table should preserve detail columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile funnel detail table should use compact size');
  assertEqual(tableProps.pagination, false, 'funnel detail table should disable pagination');
  assertEqual(tableProps.scroll.x, 680, 'mobile funnel detail table should use mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.selectedDouyinLiveDetailRows[0]),
    'live_exposure_count',
    'funnel detail table rowKey should use metric key',
  );
  assertNoContextLeaks(tableProps);
}

function assertQuantTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size', 'variant'],
    'funnel quant table props should stay narrow',
  );
  assertEqual(tableProps.variant, 'quant', 'funnel quant table should use quant variant');
  assertSame(
    tableProps.dataSource,
    sourceProps.data.selectedDouyinLiveQuantRows,
    'funnel quant table should preserve quant rows',
  );
  assertSame(
    tableProps.columns,
    sourceProps.quantColumns,
    'funnel quant table should preserve quant columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile funnel quant table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'mobile funnel quant table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'mobile funnel quant table should hide size changer');
  assertEqual(tableProps.scroll.x, 1180, 'mobile funnel quant table should use quant mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.selectedDouyinLiveQuantRows[0]),
    'watch-rate',
    'funnel quant table rowKey should use row id',
  );
  assertNoContextLeaks(tableProps);
}

function assertSessionLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'summaryText'],
    'session leaf adapter should return overview props and summary text',
  );
  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'session leaf overview props should stay narrow',
  );
  assertAttributionTableProps(bundle.overviewSectionProps.tableProps, sourceProps);
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, sourceProps);
  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'session leaf adapter should build the attribution summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

function assertFunnelLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'quantSectionProps', 'selectedAnchorNickname'],
    'funnel leaf adapter should return overview and quant props',
  );
  assertEqual(
    bundle.selectedAnchorNickname,
    '主播A',
    'funnel leaf adapter should resolve anchor nickname once',
  );
  assertKeys(
    bundle.overviewSectionProps,
    [
      'funnelData',
      'summaryText',
      'tableProps',
    ],
    'funnel overview props should stay narrow',
  );
  assertFunnelData(bundle.overviewSectionProps.funnelData);
  assertFunnelTableProps(bundle.overviewSectionProps.tableProps, sourceProps);
  assertEqual('selectedDouyinLiveRow' in bundle.overviewSectionProps, false, 'funnel overview should not receive selected row');
  assertEqual('selectedDouyinLiveStages' in bundle.overviewSectionProps, false, 'funnel overview should not receive raw stage points');
  assertEqual('resolveFunnelStageColor' in bundle.overviewSectionProps, false, 'funnel overview should not receive stage color resolver');
  assertEqual(
    bundle.overviewSectionProps.summaryText,
    '场次小结｜上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'funnel leaf adapter should build period delta summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);

  assertKeys(
    bundle.quantSectionProps,
    ['tableProps'],
    'funnel quant props should stay narrow',
  );
  assertQuantTableProps(bundle.quantSectionProps.tableProps, sourceProps);
  assertNoCrossLeaks(bundle.quantSectionProps);
}

export async function runWeeklyDouyinLiveLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertLiveLeafAdapterOwnsNoContracts();

  const {
    buildDouyinLiveSessionAttributionLeafProps,
    buildDouyinLiveFunnelAttributionLeafProps,
  } = await loadDouyinLiveLeafAdapter();

  const sessionProps = makeSessionProps();
  assertSessionLeafProps(
    buildDouyinLiveSessionAttributionLeafProps(sessionProps),
    sessionProps,
  );
  const emptyWaterfallBundle = buildDouyinLiveSessionAttributionLeafProps({
    ...sessionProps,
    data: makeLiveData({ douyinLiveWaterfallSteps: [] }),
  });
  assertEqual(
    emptyWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty session waterfall should not build chart props',
  );
  const emptyTableBundle = buildDouyinLiveSessionAttributionLeafProps({
    ...sessionProps,
    data: makeLiveData({ douyinLiveTableRows: [] }),
  });
  assertEqual(
    emptyTableBundle.overviewSectionProps.tableProps,
    null,
    'empty session table should not build table props',
  );

  const funnelProps = makeFunnelProps();
  assertFunnelLeafProps(
    buildDouyinLiveFunnelAttributionLeafProps(funnelProps),
    funnelProps,
  );

  const emptyFunnelBundle = buildDouyinLiveFunnelAttributionLeafProps(
    makeFunnelProps({ selectedDouyinLiveRow: undefined }),
  );
  assertEqual(emptyFunnelBundle.selectedAnchorNickname, '--', 'empty funnel should use placeholder anchor');
  assertEqual(emptyFunnelBundle.overviewSectionProps, null, 'empty funnel should not build overview props');
  assertEqual(emptyFunnelBundle.quantSectionProps, null, 'empty funnel should not build quant props');
}
