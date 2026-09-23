/**
 * Weekly platform tab Tmall leaf-adapter behavior fixtures.
 *
 * Tmall goods/channel leaf containers should not manually fan out fields into
 * overview children or build summary text in JSX. The adapter owns field
 * extraction, overview child props, summary text, and narrow prop contracts.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  getInterfaceProperties,
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
    throw new Error('Tmall leaf adapter behavior fixtures require guard assertions.');
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

function assertLeafAdapterConsumesExternalContracts() {
  const leafAdapterPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-leaf-adapter.ts';
  const { sourceFile } = parseTsxFile(leafAdapterPath);

  for (const typeName of [
    'TmallGoodsAttributionLeafPropsBundle',
    'TmallChannelAttributionLeafPropsBundle',
    'BuildTmallGoodsAttributionLeafPropsInput',
    'BuildTmallChannelAttributionLeafPropsInput',
  ]) {
    if (hasLocalTypeDeclaration(sourceFile, typeName)) {
      fail(`Tmall leaf adapter should consume external contracts instead of declaring local contract: ${typeName}`);
    }
  }

  for (const sourceNeedle of [
    'platform-tab-tmall-goods-overview-section',
    'platform-tab-tmall-channel-overview-section',
  ]) {
    if (hasImportSource(sourceFile, sourceNeedle)) {
      fail(`Tmall leaf adapter should not import overview sections: ${sourceNeedle}`);
    }
  }

  for (const identifierName of [
    'WaterfallChartProps',
    'WaterfallSteps',
    'ColumnsType',
    'GoodsTableRow',
    'ChannelAttributionRow',
    'TmallGoodsAttributionOverviewSectionProps',
    'TmallChannelAttributionOverviewSectionProps',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`Tmall leaf adapter should consume external contracts instead of defining/importing props contracts: ${identifierName}`);
    }
  }

  for (const importedName of [
    'BuildTmallGoodsAttributionLeafPropsInput',
    'BuildTmallChannelAttributionLeafPropsInput',
    'TmallGoodsAttributionLeafPropsBundle',
    'TmallChannelAttributionLeafPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-tmall-leaf-contracts',
      importedName,
    })) {
      fail(`Tmall leaf adapter missing external leaf contract import: ${importedName}`);
    }
  }

  if (
    getFunctionParameterType(sourceFile, 'buildTmallGoodsAttributionLeafProps') !==
    'BuildTmallGoodsAttributionLeafPropsInput'
  ) {
    fail('buildTmallGoodsAttributionLeafProps should accept the external input contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'buildTmallChannelAttributionLeafProps') !==
    'BuildTmallChannelAttributionLeafPropsInput'
  ) {
    fail('buildTmallChannelAttributionLeafProps should accept the external input contract');
  }
}

function assertAttributionSectionContractsConsumeLeafContracts() {
  const contractPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-attribution-section-contracts.ts';
  const { sourceFile } = parseTsxFile(contractPath);

  for (const sourceNeedle of [
    'platform-tab-tmall-goods-section',
    'platform-tab-tmall-channel-section',
  ]) {
    if (hasImportSource(sourceFile, sourceNeedle)) {
      fail(`Tmall attribution section contract should depend on leaf contracts, not TSX section props: ${sourceNeedle}`);
    }
  }

  for (const identifierName of [
    'TmallGoodsAttributionSectionProps',
    'TmallChannelAttributionSectionProps',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`Tmall attribution section contract should depend on leaf contracts, not TSX section props: ${identifierName}`);
    }
  }

  for (const importedName of [
    'TmallGoodsAttributionLeafPropsBundle',
    'TmallChannelAttributionLeafPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-tmall-leaf-contracts',
      importedName,
    })) {
      fail(`Tmall attribution section contract missing leaf contract import: ${importedName}`);
    }
  }

  const props = getInterfaceProperties(sourceFile, 'TmallAttributionSectionPropsBundle') || [];
  const propTypes = Object.fromEntries(
    props
      .filter(Boolean)
      .map((property) => [property.name, property.type]),
  );
  if (propTypes.goodsSectionProps !== 'TmallGoodsAttributionLeafPropsBundle') {
    fail('Tmall attribution section contract should type goodsSectionProps with the goods leaf bundle');
  }
  if (propTypes.channelSectionProps !== 'TmallChannelAttributionLeafPropsBundle') {
    fail('Tmall attribution section contract should type channelSectionProps with the channel leaf bundle');
  }
}

async function loadTmallLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-tmall-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-tmall-leaf-adapter', [
      'buildTmallChannelAttributionLeafProps',
      'buildTmallGoodsAttributionLeafProps',
    ]),
  });
}

function makeGoodsProps() {
  return {
    isMobile: true,
    goodsTableRows: [{ rowId: 'goods-1', productName: '精华礼盒' }],
    goodsColumns: [{ key: 'goods' }],
    goodsWaterfallSteps: [{ label: '精华礼盒', value: 28800 }],
    attributionAsOfDate: '2026-05-04',
    attributionTotalPrevGmv: 100000,
    attributionTotalGmv: 128800,
    attributionDelta: 28800,
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function makeChannelProps() {
  return {
    isMobile: false,
    channelTableRows: [{ rowId: 'channel-1', trafficChannelLabel: '搜索' }],
    channelColumns: [{ key: 'channel' }],
    channelWaterfallSteps: [{ label: '搜索', value: 18800 }],
    channelAttributionAsOfDate: '2026-05-03',
    channelAttributionTotalPrevPayAmount: 90000,
    channelAttributionTotalPayAmount: 118800,
    channelAttributionDelta: 28800,
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full data context');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'leaf child props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertNoContextLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'leaf child props should not receive full data context');
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
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

function assertMobileAttributionTableProps(tableProps, expected) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    `${expected.kind} mobile table props should stay narrow`,
  );
  assertSame(tableProps.dataSource, expected.rows, `${expected.kind} mobile table should preserve rows`);
  assertSame(tableProps.columns, expected.columns, `${expected.kind} mobile table should preserve columns`);
  assertEqual(tableProps.size, 'small', `${expected.kind} mobile table should use compact size`);
  assertEqual(tableProps.pagination.pageSize, 8, `${expected.kind} mobile table should use mobile page size`);
  assertEqual(tableProps.pagination.showSizeChanger, false, `${expected.kind} mobile table should hide size changer`);
  assertEqual(tableProps.scroll.x, expected.mobileX, `${expected.kind} mobile table should use mobile x`);
  assertEqual(
    tableProps.rowKey(expected.rows[0]),
    expected.rowId,
    `${expected.kind} mobile table rowKey should use row id`,
  );
  assertNoContextLeaks(tableProps);
}

function assertDesktopAttributionTableProps(tableProps, expected) {
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    `${expected.kind} desktop table props should stay narrow`,
  );
  assertSame(tableProps.dataSource, expected.rows, `${expected.kind} desktop table should preserve rows`);
  assertSame(tableProps.columns, expected.columns, `${expected.kind} desktop table should preserve columns`);
  assertEqual(tableProps.size, 'middle', `${expected.kind} desktop table should use middle size`);
  assertEqual(tableProps.pagination, false, `${expected.kind} desktop table should disable pagination`);
  assertEqual(tableProps.scroll.x, expected.desktopX, `${expected.kind} desktop table should use desktop x`);
  assertEqual(tableProps.scroll.y, 420, `${expected.kind} desktop table should preserve desktop y`);
  assertEqual(
    tableProps.rowKey(expected.rows[0]),
    expected.rowId,
    `${expected.kind} desktop table rowKey should use row id`,
  );
  assertNoContextLeaks(tableProps);
}

function assertGoodsLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'summaryText'],
    'Tmall goods leaf adapter should return overview props and summary text',
  );

  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'Tmall goods overview child props should stay narrow',
  );
  assertMobileAttributionTableProps(bundle.overviewSectionProps.tableProps, {
    kind: 'goods',
    rows: sourceProps.goodsTableRows,
    columns: sourceProps.goodsColumns,
    mobileX: 980,
    rowId: 'goods-1',
  });
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, {
    kind: 'goods',
    title: '商品GMV增量瀑布（对比上周同期）',
    previousValue: sourceProps.attributionTotalPrevGmv,
    currentValue: sourceProps.attributionTotalGmv,
    steps: sourceProps.goodsWaterfallSteps,
    totalColor: sourceProps.waterfallTotalColor,
  });
  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'goods leaf adapter should build attribution summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

function assertChannelLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'summaryText'],
    'Tmall channel leaf adapter should return overview props and summary text',
  );

  assertKeys(
    bundle.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'Tmall channel overview child props should stay narrow',
  );
  assertDesktopAttributionTableProps(bundle.overviewSectionProps.tableProps, {
    kind: 'channel',
    rows: sourceProps.channelTableRows,
    columns: sourceProps.channelColumns,
    desktopX: 1080,
    rowId: 'channel-1',
  });
  assertWaterfallChartProps(bundle.overviewSectionProps.waterfallChartProps, {
    kind: 'channel',
    title: '商品·流量渠道GMV瀑布（对比上周同期）',
    previousValue: sourceProps.channelAttributionTotalPrevPayAmount,
    currentValue: sourceProps.channelAttributionTotalPayAmount,
    steps: sourceProps.channelWaterfallSteps,
    totalColor: sourceProps.waterfallTotalColor,
  });
  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/03 ｜ 上周同期：¥9.00万 ｜ 本周同期：¥11.88万 ｜ 总增量：+¥2.88万',
    'channel leaf adapter should build attribution summary once',
  );
  assertNoCrossLeaks(bundle.overviewSectionProps);
}

export async function runWeeklyTmallLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertLeafAdapterConsumesExternalContracts();
  assertAttributionSectionContractsConsumeLeafContracts();

  const {
    buildTmallChannelAttributionLeafProps,
    buildTmallGoodsAttributionLeafProps,
  } = await loadTmallLeafAdapter();

  const goodsProps = makeGoodsProps();
  assertGoodsLeafProps(
    buildTmallGoodsAttributionLeafProps(goodsProps),
    goodsProps,
  );
  const emptyGoodsWaterfallBundle = buildTmallGoodsAttributionLeafProps({
    ...goodsProps,
    goodsWaterfallSteps: [],
  });
  assertEqual(
    emptyGoodsWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty goods waterfall should not build chart props',
  );
  const emptyGoodsTableBundle = buildTmallGoodsAttributionLeafProps({
    ...goodsProps,
    goodsTableRows: [],
  });
  assertEqual(
    emptyGoodsTableBundle.overviewSectionProps.tableProps,
    null,
    'empty goods table should not build table props',
  );

  const channelProps = makeChannelProps();
  assertChannelLeafProps(
    buildTmallChannelAttributionLeafProps(channelProps),
    channelProps,
  );
  const emptyChannelWaterfallBundle = buildTmallChannelAttributionLeafProps({
    ...channelProps,
    channelWaterfallSteps: [],
  });
  assertEqual(
    emptyChannelWaterfallBundle.overviewSectionProps.waterfallChartProps,
    null,
    'empty channel waterfall should not build chart props',
  );
  const emptyChannelTableBundle = buildTmallChannelAttributionLeafProps({
    ...channelProps,
    channelTableRows: [],
  });
  assertEqual(
    emptyChannelTableBundle.overviewSectionProps.tableProps,
    null,
    'empty channel table should not build table props',
  );
}
