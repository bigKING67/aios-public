/**
 * Weekly platform tab Douyin card leaf-adapter behavior fixtures.
 *
 * Card leaf containers should not manually fan out data fields into their
 * overview/quant children. The adapter owns field extraction, descriptions,
 * summary text, and empty selected-source contracts.
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
    throw new Error('Douyin card leaf adapter behavior fixtures require guard assertions.');
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

async function loadDouyinCardLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-card-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-card-leaf-adapter', [
      'buildDouyinCardProductAttributionLeafProps',
      'buildDouyinCardSourceAttributionLeafProps',
      'buildDouyinCardSourceFunnelLeafProps',
    ]),
  });
}

function makeCardData(overrides = {}) {
  const selectedDouyinCardSource = {
    rowId: 'source-1',
    sourceLevel1: '商城推荐',
  };

  return {
    douyinCardAsOfDate: '2026-05-04',
    douyinCardProductTableRows: [{ rowId: 'product-1', productId: 'P001' }],
    douyinCardTotalCurrent: 128800,
    douyinCardTotalPrev: 100000,
    douyinCardTotalDelta: 28800,
    douyinCardProductWaterfallSteps: [{ label: '商品A', value: 28800 }],
    diagnosisCardProductId: 'P001',
    diagnosisCardProductName: '精华礼盒',
    douyinCardSourceTableRows: [selectedDouyinCardSource],
    douyinCardSourceTotalCurrent: 88800,
    douyinCardSourceTotalPrev: 60000,
    douyinCardSourceTotalDelta: 28800,
    douyinCardSourceWaterfallSteps: [{ label: '商城推荐', value: 28800 }],
    selectedDouyinCardSource,
    selectedDouyinCardSourceStages: [{
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
    selectedDouyinCardQuantRows: [{ rowId: 'click-rate', factorKey: 'click_rate' }],
    selectedDouyinCardDetailRows: [{ key: 'card_exposure_count' }],
    ...overrides,
  };
}

function makeProductProps() {
  return {
    isMobile: true,
    data: makeCardData(),
    douyinCardProductColumns: [{ key: 'card-product' }],
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function makeSourceProps(overrides = {}) {
  return {
    isMobile: true,
    data: makeCardData(overrides),
    douyinCardSourceColumns: [{ key: 'card-source' }],
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function makeFunnelProps(overrides = {}) {
  return {
    isMobile: true,
    data: makeCardData(overrides),
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    quantColumns: [{ key: 'quant' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin card data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'leaf child props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertNoContextLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full Douyin card data');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertLeafAdapterConsumesExternalContracts() {
  const leafAdapterPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-leaf-adapter.ts';
  const { sourceFile } = parseTsxFile(leafAdapterPath);

  const forbiddenImportSources = [
    'platform-tab-douyin-card-product-section',
    'platform-tab-douyin-card-source-section',
  ];
  for (const sourceNeedle of forbiddenImportSources) {
    if (hasImportSource(sourceFile, sourceNeedle)) {
      fail(`card leaf adapter should not import section components/contracts directly: ${sourceNeedle}`);
    }
  }

  const forbiddenIdentifiers = [
    'DouyinCardProductAttributionSectionProps',
    'DouyinCardSourceAttributionSectionProps',
    'ColumnsType',
    'DouyinCardSectionData',
    'DouyinCardProductAttributionOverviewSectionProps',
    'DouyinCardSourceAttributionOverviewSectionProps',
    'DouyinCardSourceFunnelOverviewSectionProps',
    'DouyinCardSourceQuantSectionProps',
  ];
  for (const identifierName of forbiddenIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(
        `card leaf adapter should consume external contracts instead of defining/importing section props: ${identifierName}`,
      );
    }
  }

  const forbiddenLocalTypeNames = [
    'DouyinCardProductAttributionLeafPropsBundle',
    'DouyinCardSourceAttributionLeafPropsBundle',
    'DouyinCardSourceFunnelLeafPropsBundle',
    'BuildDouyinCardProductAttributionLeafPropsInput',
    'BuildDouyinCardSourceAttributionLeafPropsInput',
    'BuildDouyinCardSourceFunnelLeafPropsInput',
  ];
  for (const typeName of forbiddenLocalTypeNames) {
    if (hasLocalTypeDeclaration(sourceFile, typeName)) {
      fail(`card leaf adapter should import leaf contracts instead of declaring local contract: ${typeName}`);
    }
  }

  const requiredInputContracts = [
    'BuildDouyinCardProductAttributionLeafPropsInput',
    'BuildDouyinCardSourceAttributionLeafPropsInput',
    'BuildDouyinCardSourceFunnelLeafPropsInput',
  ];
  for (const importedName of requiredInputContracts) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-douyin-card-leaf-contracts',
      importedName,
    })) {
      fail(`card leaf adapter missing external input contract: ${importedName}`);
    }
  }

  const builderInputTypes = [
    [
      'buildDouyinCardProductAttributionLeafProps',
      'BuildDouyinCardProductAttributionLeafPropsInput',
    ],
    [
      'buildDouyinCardSourceAttributionLeafProps',
      'BuildDouyinCardSourceAttributionLeafPropsInput',
    ],
    [
      'buildDouyinCardSourceFunnelLeafProps',
      'BuildDouyinCardSourceFunnelLeafPropsInput',
    ],
  ];
  for (const [functionName, expectedType] of builderInputTypes) {
    const actualType = getFunctionParameterType(sourceFile, functionName);
    if (actualType !== expectedType) {
      fail(`${functionName} should receive external input contract ${expectedType}`);
    }
  }
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

function assertWaterfallChartProps(waterfallChartProps, expected) {
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
    `${expected.kind} waterfall chart props should stay narrow`,
  );
  assertEqual(waterfallChartProps.title, expected.title, `${expected.kind} waterfall title should be adapter-owned`);
  assertEqual(waterfallChartProps.startLabel, '上周同期', `${expected.kind} waterfall should preserve start label`);
  assertEqual(waterfallChartProps.endLabel, '本周同期', `${expected.kind} waterfall should preserve end label`);
  assertEqual(waterfallChartProps.startValue, expected.previousValue, `${expected.kind} waterfall should preserve previous total`);
  assertEqual(waterfallChartProps.endValue, expected.currentValue, `${expected.kind} waterfall should preserve current total`);
  assertSame(waterfallChartProps.steps, expected.steps, `${expected.kind} waterfall should preserve steps`);
  assertEqual(waterfallChartProps.totalColor, expected.totalColor, `${expected.kind} waterfall should preserve color`);
  assertEqual(waterfallChartProps.showBoundaryTotals, false, `${expected.kind} waterfall should hide boundary totals`);
  assertEqual(waterfallChartProps.height, 360, `${expected.kind} waterfall should preserve height`);
  assertEqual(waterfallChartProps.gridBottomPx, 26, `${expected.kind} waterfall should preserve grid bottom`);
  assertNoCrossLeaks(waterfallChartProps);
}

function assertAttributionTableProps(tableProps, expected) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    `${expected.kind} overview table props should stay narrow`,
  );
  assertSame(tableProps.dataSource, expected.rows, `${expected.kind} overview table should preserve row list reference`);
  assertSame(tableProps.columns, expected.columns, `${expected.kind} overview table should preserve columns`);
  assertEqual(tableProps.size, 'small', `mobile ${expected.kind} overview table should use compact size`);
  assertEqual(tableProps.pagination.pageSize, 8, `mobile ${expected.kind} overview table should use mobile page size`);
  assertEqual(tableProps.pagination.showSizeChanger, false, `mobile ${expected.kind} overview table should hide size changer`);
  assertEqual(tableProps.scroll.x, expected.mobileX, `mobile ${expected.kind} overview table should use mobile x`);
  assertEqual(
    tableProps.rowKey(expected.rows[0]),
    expected.rowId,
    `${expected.kind} overview table rowKey should use row id`,
  );
  assertNoContextLeaks(tableProps);
}

function assertFunnelTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'card source funnel detail table props should stay narrow',
  );
  assertSame(
    tableProps.dataSource,
    sourceProps.data.selectedDouyinCardDetailRows,
    'card source funnel detail table should preserve detail rows',
  );
  assertSame(
    tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'card source funnel detail table should preserve detail columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile card source funnel detail table should use compact size');
  assertEqual(tableProps.pagination, false, 'card source funnel detail table should disable pagination');
  assertEqual(tableProps.scroll.x, 680, 'mobile card source funnel detail table should use mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.selectedDouyinCardDetailRows[0]),
    'card_exposure_count',
    'card source funnel detail table rowKey should use metric key',
  );
  assertNoContextLeaks(tableProps);
}

function assertQuantTableProps(tableProps, sourceProps) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size', 'variant'],
    'card source quant table props should stay narrow',
  );
  assertEqual(tableProps.variant, 'quant', 'card source quant table should use quant variant');
  assertSame(
    tableProps.dataSource,
    sourceProps.data.selectedDouyinCardQuantRows,
    'card source quant table should preserve quant rows',
  );
  assertSame(
    tableProps.columns,
    sourceProps.quantColumns,
    'card source quant table should preserve quant columns',
  );
  assertEqual(tableProps.size, 'small', 'mobile card source quant table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'mobile card source quant table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'mobile card source quant table should hide size changer');
  assertEqual(tableProps.scroll.x, 1180, 'mobile card source quant table should use quant mobile x');
  assertEqual(
    tableProps.rowKey(sourceProps.data.selectedDouyinCardQuantRows[0]),
    'card-click-rate',
    'card source quant table rowKey should prefix row id',
  );
  assertNoContextLeaks(tableProps);
}

function assertProductLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'summaryText'],
    'card product leaf adapter should return overview props and summary text',
  );
  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'card product overview child props should stay narrow',
  );
  assertAttributionTableProps(bundle.overviewSectionProps.tableProps, {
    kind: 'product',
    rows: sourceProps.data.douyinCardProductTableRows,
    columns: sourceProps.douyinCardProductColumns,
    mobileX: 960,
    rowId: 'product-1',
  });
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, {
    kind: 'product',
    title: '商品卡商品GMV增量瀑布（对比上周同期）',
    previousValue: sourceProps.data.douyinCardTotalPrev,
    currentValue: sourceProps.data.douyinCardTotalCurrent,
    steps: sourceProps.data.douyinCardProductWaterfallSteps,
    totalColor: sourceProps.waterfallTotalColor,
  });
  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'product leaf adapter should build the attribution summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

function assertSourceLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'sourceDescription', 'summaryText'],
    'card source leaf adapter should return description, overview props, and summary text',
  );
  assertEqual(
    bundle.sourceDescription,
    '聚焦商品 精华礼盒（P001）拆解 12 个一级来源渠道。',
    'source leaf adapter should build focused product description',
  );
  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'card source overview child props should stay narrow',
  );
  assertAttributionTableProps(bundle.overviewSectionProps.tableProps, {
    kind: 'source',
    rows: sourceProps.data.douyinCardSourceTableRows,
    columns: sourceProps.douyinCardSourceColumns,
    mobileX: 920,
    rowId: 'source-1',
  });
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, {
    kind: 'source',
    title: '商品卡来源渠道GMV增量瀑布（对比上周同期）',
    previousValue: sourceProps.data.douyinCardSourceTotalPrev,
    currentValue: sourceProps.data.douyinCardSourceTotalCurrent,
    steps: sourceProps.data.douyinCardSourceWaterfallSteps,
    totalColor: sourceProps.waterfallTotalColor,
  });
  assertEqual(
    bundle.summaryText,
    '渠道小结｜上周同期：¥6.00万 ｜ 本周同期：¥8.88万 ｜ 总增量：+¥2.88万',
    'source leaf adapter should build period delta summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

function assertFunnelLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'quantSectionProps', 'selectedSourceLevelText'],
    'card source funnel leaf adapter should return title text, overview props, and quant props',
  );
  assertEqual(bundle.selectedSourceLevelText, '商城推荐', 'funnel leaf should resolve selected source title text');
  assertKeys(
    bundle.overviewSectionProps,
    [
      'funnelData',
      'tableProps',
    ],
    'card source funnel overview props should stay narrow',
  );
  assertFunnelData(bundle.overviewSectionProps.funnelData);
  assertFunnelTableProps(bundle.overviewSectionProps.tableProps, sourceProps);
  assertEqual('selectedDouyinCardSourceStages' in bundle.overviewSectionProps, false, 'funnel overview should not receive raw stage points');
  assertEqual('resolveFunnelStageColor' in bundle.overviewSectionProps, false, 'funnel overview should not receive stage color resolver');
  assertNoCrossLeaks(bundle.overviewSectionProps);

  assertKeys(
    bundle.quantSectionProps,
    ['tableProps'],
    'card source quant props should stay narrow',
  );
  assertQuantTableProps(bundle.quantSectionProps.tableProps, sourceProps);
  assertNoCrossLeaks(bundle.quantSectionProps);
}

export async function runWeeklyDouyinCardLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertLeafAdapterConsumesExternalContracts();

  const {
    buildDouyinCardProductAttributionLeafProps,
    buildDouyinCardSourceAttributionLeafProps,
    buildDouyinCardSourceFunnelLeafProps,
  } = await loadDouyinCardLeafAdapter();

  const productProps = makeProductProps();
  assertProductLeafProps(
    buildDouyinCardProductAttributionLeafProps(productProps),
    productProps,
  );
  const emptyProductWaterfallBundle = buildDouyinCardProductAttributionLeafProps({
    ...productProps,
    data: makeCardData({ douyinCardProductWaterfallSteps: [] }),
  });
  assertEqual(
    emptyProductWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty product waterfall should not build chart props',
  );
  const emptyProductTableBundle = buildDouyinCardProductAttributionLeafProps({
    ...productProps,
    data: makeCardData({ douyinCardProductTableRows: [] }),
  });
  assertEqual(
    emptyProductTableBundle.overviewSectionProps.tableProps,
    null,
    'empty product table should not build table props',
  );

  const sourceProps = makeSourceProps();
  assertSourceLeafProps(
    buildDouyinCardSourceAttributionLeafProps(sourceProps),
    sourceProps,
  );
  const emptySourceWaterfallBundle = buildDouyinCardSourceAttributionLeafProps(
    makeSourceProps({ douyinCardSourceWaterfallSteps: [] }),
  );
  assertEqual(
    emptySourceWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty source waterfall should not build chart props',
  );
  const emptySourceTableBundle = buildDouyinCardSourceAttributionLeafProps(
    makeSourceProps({ douyinCardSourceTableRows: [] }),
  );
  assertEqual(
    emptySourceTableBundle.overviewSectionProps.tableProps,
    null,
    'empty source table should not build table props',
  );

  const fallbackSourceBundle = buildDouyinCardSourceAttributionLeafProps(
    makeSourceProps({ diagnosisCardProductId: '', diagnosisCardProductName: '' }),
  );
  assertEqual(
    fallbackSourceBundle.sourceDescription,
    '按一级来源渠道拆解商品卡 GMV 波动。',
    'source leaf adapter should build fallback source description',
  );

  const funnelProps = makeFunnelProps();
  assertFunnelLeafProps(
    buildDouyinCardSourceFunnelLeafProps(funnelProps),
    funnelProps,
  );

  const emptyFunnelBundle = buildDouyinCardSourceFunnelLeafProps(
    makeFunnelProps({ selectedDouyinCardSource: undefined }),
  );
  assertEqual(emptyFunnelBundle.selectedSourceLevelText, '--', 'empty funnel should use placeholder source text');
  assertEqual(emptyFunnelBundle.overviewSectionProps, null, 'empty funnel should not build overview props');
  assertEqual(emptyFunnelBundle.quantSectionProps, null, 'empty funnel should not build quant props');
}
