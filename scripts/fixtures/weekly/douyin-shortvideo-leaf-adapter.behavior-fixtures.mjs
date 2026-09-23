/**
 * Weekly platform tab Douyin shortvideo leaf-adapter behavior fixtures.
 *
 * Shortvideo leaf containers should not manually fan out data fields into
 * overview/diagnosis/table children. The adapter owns field extraction,
 * summary text, diagnosis item mapping, and responsive table props.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  hasIdentifier,
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
    throw new Error('Douyin shortvideo leaf adapter behavior fixtures require guard assertions.');
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

async function loadDouyinShortvideoLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-shortvideo-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-douyin-shortvideo-leaf-adapter',
      ['buildDouyinShortvideoOverviewLeafProps', 'buildDouyinShortvideoAnalysisLeafProps'],
    ),
  });
}

function assertShortvideoLeafAdapterOwnsNoContracts() {
  const adapterPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-leaf-adapter.ts';
  const { sourceFile } = parseTsxFile(adapterPath);

  const forbiddenIdentifiers = [
    'ColumnsType',
    'DouyinSectionData',
    'DouyinShortvideoAttributionOverviewSectionProps',
    'WeeklyDataTableProps',
    'WeeklyDiagnosisCardProps',
  ];

  for (const identifierName of forbiddenIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(
        `shortvideo leaf adapter should consume external contracts instead of defining/importing section props: ${identifierName}`,
      );
    }
  }

  const forbiddenLocalTypeNames = [
    'DouyinShortvideoOverviewLeafPropsBundle',
    'DouyinShortvideoAnalysisLeafPropsBundle',
    'BuildDouyinShortvideoOverviewLeafPropsInput',
    'BuildDouyinShortvideoAnalysisLeafPropsInput',
  ];
  for (const typeName of forbiddenLocalTypeNames) {
    if (hasLocalTypeDeclaration(sourceFile, typeName)) {
      fail(`shortvideo leaf adapter should import leaf contracts instead of declaring local contract: ${typeName}`);
    }
  }

  const requiredContracts = [
    'BuildDouyinShortvideoOverviewLeafPropsInput',
    'BuildDouyinShortvideoAnalysisLeafPropsInput',
    'DouyinShortvideoOverviewLeafPropsBundle',
    'DouyinShortvideoAnalysisLeafPropsBundle',
  ];
  for (const importedName of requiredContracts) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-douyin-shortvideo-leaf-contracts',
      importedName,
    })) {
      fail(`shortvideo leaf adapter missing external contract import: ${importedName}`);
    }
  }

  const builderInputTypes = [
    [
      'buildDouyinShortvideoOverviewLeafProps',
      'BuildDouyinShortvideoOverviewLeafPropsInput',
    ],
    [
      'buildDouyinShortvideoAnalysisLeafProps',
      'BuildDouyinShortvideoAnalysisLeafPropsInput',
    ],
  ];
  for (const [functionName, expectedType] of builderInputTypes) {
    const actualType = getFunctionParameterType(sourceFile, functionName);
    if (actualType !== expectedType) {
      fail(`${functionName} should receive external input contract ${expectedType}`);
    }
  }
}

function makeShortvideoData(overrides = {}) {
  const selectedDouyinShortvideoRow = {
    rowId: 'shortvideo-1',
    authorNickname: '作者A',
  };

  return {
    douyinShortvideoAsOfDate: '2026-05-04',
    douyinShortvideoTableRows: [selectedDouyinShortvideoRow],
    douyinShortvideoTotalCurrent: 128800,
    douyinShortvideoTotalPrev: 100000,
    douyinShortvideoTotalDelta: 28800,
    douyinShortvideoWaterfallSteps: [{ label: '短视频A', value: 28800 }],
    selectedDouyinShortvideoRow,
    selectedDouyinShortvideoDiagnosis: [
      { reason: '曝光提升', action: '复用素材结构' },
      { reason: '成交转化提升', action: '强化同款商品挂载' },
    ],
    ...overrides,
  };
}

function makeOverviewProps() {
  return {
    isMobile: true,
    data: makeShortvideoData(),
    douyinShortvideoColumns: [{ key: 'shortvideo' }],
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function makeAnalysisProps(overrides = {}) {
  return {
    isMobile: true,
    data: makeShortvideoData(overrides),
    douyinShortvideoColumns: [{ key: 'shortvideo' }],
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin shortvideo data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'leaf child props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertNoContextLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin shortvideo data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
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
    'overview waterfall chart props should stay narrow',
  );
  assertEqual(
    waterfallChartProps.title,
    '短视频GMV增量瀑布（对比上周同期）',
    'overview waterfall title should be adapter-owned',
  );
  assertEqual(waterfallChartProps.startLabel, '上周同期', 'overview waterfall should preserve start label');
  assertEqual(waterfallChartProps.endLabel, '本周同期', 'overview waterfall should preserve end label');
  assertEqual(waterfallChartProps.startValue, sourceProps.data.douyinShortvideoTotalPrev, 'overview waterfall should preserve previous total');
  assertEqual(waterfallChartProps.endValue, sourceProps.data.douyinShortvideoTotalCurrent, 'overview waterfall should preserve current total');
  assertSame(waterfallChartProps.steps, sourceProps.data.douyinShortvideoWaterfallSteps, 'overview waterfall should preserve steps');
  assertEqual(waterfallChartProps.totalColor, sourceProps.waterfallTotalColor, 'overview waterfall should preserve color');
  assertEqual(waterfallChartProps.showBoundaryTotals, false, 'overview waterfall should hide boundary totals');
  assertEqual(waterfallChartProps.height, 360, 'overview waterfall should preserve height');
  assertEqual(waterfallChartProps.gridBottomPx, 26, 'overview waterfall should preserve grid bottom');
  assertNoCrossLeaks(waterfallChartProps);
}

function assertAttributionTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'shortvideo overview table props should stay narrow',
  );
  assertSame(
    tableProps.dataSource,
    sourceProps.data.douyinShortvideoTableRows,
    'overview table should preserve row list reference',
  );
  assertSame(
    tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'overview table should preserve columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile overview table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'mobile overview table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'mobile overview table should hide size changer');
  assertEqual(tableProps.scroll.x, 980, 'mobile overview table should use mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.douyinShortvideoTableRows[0]),
    'shortvideo-1',
    'overview table rowKey should use row id',
  );
  assertNoContextLeaks(tableProps);
}

function assertOverviewLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'summaryText'],
    'shortvideo overview leaf adapter should return overview props and summary text',
  );
  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'shortvideo overview child props should stay narrow',
  );
  assertAttributionTableProps(bundle.overviewSectionProps.tableProps, sourceProps);
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, sourceProps);
  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'overview leaf adapter should build the attribution summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

function assertAnalysisLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['diagnosisCardProps', 'selectedAuthorNickname', 'tableProps'],
    'shortvideo analysis leaf adapter should return author, diagnosis, and table props',
  );
  assertEqual(bundle.selectedAuthorNickname, '作者A', 'analysis leaf should resolve selected author name');
  assertKeys(
    bundle.diagnosisCardProps,
    ['items', 'title'],
    'diagnosis card props should stay narrow',
  );
  assertEqual(bundle.diagnosisCardProps.title, '原因与动作建议', 'diagnosis card should preserve title');
  assertEqual(bundle.diagnosisCardProps.items.length, 2, 'diagnosis card should map diagnosis items');
  assertEqual(
    bundle.diagnosisCardProps.items[0].key,
    'shortvideo-1-diagnosis-0',
    'diagnosis item key should be based on selected row id',
  );
  assertEqual(bundle.diagnosisCardProps.items[0].reason, '曝光提升', 'diagnosis item should preserve reason');
  assertEqual(bundle.diagnosisCardProps.items[0].action, '复用素材结构', 'diagnosis item should preserve action');
  assertNoCrossLeaks(bundle.diagnosisCardProps);

  assertKeys(
    bundle.tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'shortvideo table props should stay narrow',
  );
  assertSame(bundle.tableProps.dataSource[0], sourceProps.data.selectedDouyinShortvideoRow, 'table should preserve selected row reference');
  assertSame(bundle.tableProps.columns, sourceProps.douyinShortvideoColumns, 'table should preserve columns');
  assertEqual(bundle.tableProps.size, 'small', 'mobile table should use compact size');
  assertEqual(bundle.tableProps.pagination, false, 'table should disable pagination');
  assertEqual(bundle.tableProps.scroll.x, 980, 'mobile table scroll should use mobile x');
  assertEqual(
    bundle.tableProps.rowKey(sourceProps.data.selectedDouyinShortvideoRow),
    'shortvideo-1',
    'table rowKey should use row id',
  );
  assertNoContextLeaks(bundle.tableProps);
}

export async function runWeeklyDouyinShortvideoLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertShortvideoLeafAdapterOwnsNoContracts();

  const {
    buildDouyinShortvideoOverviewLeafProps,
    buildDouyinShortvideoAnalysisLeafProps,
  } = await loadDouyinShortvideoLeafAdapter();

  const overviewProps = makeOverviewProps();
  assertOverviewLeafProps(
    buildDouyinShortvideoOverviewLeafProps(overviewProps),
    overviewProps,
  );
  const emptyWaterfallBundle = buildDouyinShortvideoOverviewLeafProps({
    ...overviewProps,
    data: makeShortvideoData({ douyinShortvideoWaterfallSteps: [] }),
  });
  assertEqual(
    emptyWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty overview waterfall should not build chart props',
  );
  const emptyTableBundle = buildDouyinShortvideoOverviewLeafProps({
    ...overviewProps,
    data: makeShortvideoData({ douyinShortvideoTableRows: [] }),
  });
  assertEqual(
    emptyTableBundle.overviewSectionProps.tableProps,
    null,
    'empty overview table should not build table props',
  );

  const analysisProps = makeAnalysisProps();
  assertAnalysisLeafProps(
    buildDouyinShortvideoAnalysisLeafProps(analysisProps),
    analysisProps,
  );

  const emptyAnalysisBundle = buildDouyinShortvideoAnalysisLeafProps(
    makeAnalysisProps({ selectedDouyinShortvideoRow: undefined }),
  );
  assertEqual(emptyAnalysisBundle.selectedAuthorNickname, '--', 'empty analysis should use placeholder author');
  assertEqual(emptyAnalysisBundle.diagnosisCardProps, null, 'empty analysis should not build diagnosis props');
  assertEqual(emptyAnalysisBundle.tableProps, null, 'empty analysis should not build table props');
}
