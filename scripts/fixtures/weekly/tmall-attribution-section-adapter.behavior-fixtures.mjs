/**
 * Weekly platform tab Tmall section-adapter behavior fixtures.
 *
 * PlatformTabTmallAttributionSections should stay render-only. The adapter owns
 * the mapping from the wide Tmall view-model plus table columns into the three
 * narrow section contracts: goods, channel, and funnel diagnosis.
 */

import path from 'node:path';
import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
  WEEKLY_TABS_ROOT,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasObjectLiteralProperty,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Tmall attribution section adapter behavior fixtures require guard assertions.');
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

async function loadTmallAttributionSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-tmall-section-adapter-',
    entrySource: [
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-tmall-attribution-section-adapter', [
        'buildTmallAttributionSectionProps',
      ]),
      [
        'export {',
        '  WATERFALL_TOTAL_COLOR,',
        '  getFunnelStageColor,',
        `} from ${JSON.stringify(path.join(repoRoot, WEEKLY_TABS_ROOT, 'platform-tab-chart-visuals'))};`,
        '',
      ].join('\n'),
    ],
  });
}

function makeColumns() {
  return {
    goodsColumns: [{ key: 'goods' }],
    channelColumns: [{ key: 'channel' }],
    funnelDetailColumnsWithClickStage: [{ key: 'funnel-click' }],
    funnelDetailColumnsWithoutClickStage: [{ key: 'funnel-no-click' }],
    quantColumns: [{ key: 'quant' }],
  };
}

function makeViewModel() {
  const goodsTableRows = [{ rowId: 'goods-1', productId: 'P001', productName: '明星商品' }];
  const goodsWaterfallSteps = [{ label: '商品A', value: 120 }];
  const channelTableRows = [{ rowId: 'channel-1', channelKey: 'search', trafficChannelLabel: '搜索' }];
  const channelWaterfallSteps = [{ label: '搜索', value: 80 }];
  const funnelRows = [{ rowId: 'funnel-1', hasClickStage: true, trafficChannelLabel: '搜索' }];
  const funnelStages = [{ key: 'visit', label: '访客', value: 1200, prevValue: 1000 }];
  const funnelChannelSections = [{
    channelKey: 'search',
    titleText: '搜索渠道',
    summaryText: '搜索',
    rows: funnelRows,
    stages: funnelStages,
    currPayAmount: 1280,
    prevPayAmount: 900,
  }];
  const quantRows = [{ rowId: 'quant-1', factorKey: 'click_rate' }];
  const quantRowsByChannel = new Map([['search', quantRows]]);

  return {
    attributionSources: {
      attributionAsOfDate: '2026-05-02',
      channelAttributionAsOfDate: '2026-05-01',
    },
    tmallSectionData: {
      goodsTableRows,
      goodsWaterfallSteps,
      channelTableRows,
      channelWaterfallSteps,
      funnelChannelSections,
      quantRows,
      quantRowsByChannel,
      tmallAttributionTotals: {
        attributionTotalPrevGmv: 1100,
        attributionTotalGmv: 1500,
        attributionDelta: 400,
        channelAttributionTotalPrevPayAmount: 900,
        channelAttributionTotalPayAmount: 1280,
        channelAttributionDelta: 380,
      },
    },
    douyinSectionData: { marker: 'should-not-pass' },
    primaryMetrics: [{ key: 'gmv', value: '¥1,500' }],
  };
}

function assertGoodsSectionProps(sectionProps, columns, viewModel, expectedColor) {
  assertKeys(
    sectionProps,
    [
      'overviewSectionProps',
      'summaryText',
    ],
    'goods section adapter should keep only render-ready goods section props',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'goods overview section props should stay narrow',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/02 ｜ 上周同期：¥1,100 ｜ 本周同期：¥1,500 ｜ 总增量：+¥400',
    'goods section should build attribution summary in adapter',
  );

  const { tableProps, waterfallChartProps } = sectionProps.overviewSectionProps;
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'goods table props should stay render-ready and narrow',
  );
  assertSame(tableProps.dataSource, viewModel.tmallSectionData.goodsTableRows, 'goods table should preserve rows reference');
  assertSame(tableProps.columns, columns.goodsColumns, 'goods table should preserve columns reference');
  assertEqual(tableProps.size, 'small', 'goods mobile table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'goods mobile table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'goods mobile table should hide size changer');
  assertEqual(tableProps.scroll.x, 980, 'goods mobile table should use mobile x');
  assertEqual(
    tableProps.rowKey(viewModel.tmallSectionData.goodsTableRows[0]),
    'goods-1',
    'goods table rowKey should use stable row id',
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
    'goods waterfall props should stay render-ready and narrow',
  );
  assertEqual(waterfallChartProps.title, '商品GMV增量瀑布（对比上周同期）', 'goods waterfall title should be adapter-owned');
  assertEqual(waterfallChartProps.startValue, 1100, 'goods waterfall should map previous GMV');
  assertEqual(waterfallChartProps.endValue, 1500, 'goods waterfall should map current GMV');
  assertSame(waterfallChartProps.steps, viewModel.tmallSectionData.goodsWaterfallSteps, 'goods waterfall should preserve steps reference');
  assertEqual(waterfallChartProps.totalColor, expectedColor, 'goods waterfall should use centralized total color');
  assertEqual('goodsTableRows' in sectionProps, false, 'goods section should not leak raw rows');
  assertEqual('goodsColumns' in sectionProps, false, 'goods section should not leak raw columns');
  assertEqual('isMobile' in sectionProps, false, 'goods section should not leak responsive flag');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'goods section should not leak raw waterfall color');
}

function assertChannelSectionProps(sectionProps, columns, viewModel, expectedColor) {
  assertKeys(
    sectionProps,
    [
      'overviewSectionProps',
      'summaryText',
    ],
    'channel section adapter should keep only render-ready channel section props',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    [
      'tableProps',
      'waterfallChartProps',
    ],
    'channel overview section props should stay narrow',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/01 ｜ 上周同期：¥900 ｜ 本周同期：¥1,280 ｜ 总增量：+¥380',
    'channel section should build attribution summary in adapter',
  );

  const { tableProps, waterfallChartProps } = sectionProps.overviewSectionProps;
  assertKeys(
    tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'channel table props should stay render-ready and narrow',
  );
  assertSame(tableProps.dataSource, viewModel.tmallSectionData.channelTableRows, 'channel table should preserve rows reference');
  assertSame(tableProps.columns, columns.channelColumns, 'channel table should preserve columns reference');
  assertEqual(tableProps.size, 'small', 'channel mobile table should use compact size');
  assertEqual(tableProps.pagination.pageSize, 8, 'channel mobile table should use mobile page size');
  assertEqual(tableProps.pagination.showSizeChanger, false, 'channel mobile table should hide size changer');
  assertEqual(tableProps.scroll.x, 920, 'channel mobile table should use mobile x');
  assertEqual(
    tableProps.rowKey(viewModel.tmallSectionData.channelTableRows[0]),
    'channel-1',
    'channel table rowKey should use stable row id',
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
    'channel waterfall props should stay render-ready and narrow',
  );
  assertEqual(waterfallChartProps.title, '商品·流量渠道GMV瀑布（对比上周同期）', 'channel waterfall title should be adapter-owned');
  assertEqual(waterfallChartProps.startValue, 900, 'channel waterfall should map previous pay amount');
  assertEqual(waterfallChartProps.endValue, 1280, 'channel waterfall should map current pay amount');
  assertSame(waterfallChartProps.steps, viewModel.tmallSectionData.channelWaterfallSteps, 'channel waterfall should preserve steps reference');
  assertEqual(waterfallChartProps.totalColor, expectedColor, 'channel waterfall should use centralized total color');
  assertEqual('channelTableRows' in sectionProps, false, 'channel section should not leak raw rows');
  assertEqual('channelColumns' in sectionProps, false, 'channel section should not leak raw columns');
  assertEqual('isMobile' in sectionProps, false, 'channel section should not leak responsive flag');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'channel section should not leak raw waterfall color');
}

function assertFunnelSectionProps(sectionProps, columns, viewModel, expectedResolver) {
  assertKeys(
    sectionProps,
    [
      'channelSectionPropsList',
      'showEmptyFunnelSection',
    ],
    'funnel section adapter should return render-ready diagnosis section props',
  );
  assertEqual(sectionProps.showEmptyFunnelSection, false, 'funnel section should not show empty state when channel list exists');
  assertEqual(sectionProps.channelSectionPropsList.length, 1, 'funnel section should build one channel props bundle');

  const channelSectionProps = sectionProps.channelSectionPropsList[0];
  assertKeys(
    channelSectionProps,
    [
      'channelKey',
      'channelTitleText',
      'overviewSectionProps',
      'quantSectionProps',
      'summaryText',
    ],
    'funnel channel section props should stay render-ready',
  );
  const sourceChannel = viewModel.tmallSectionData.funnelChannelSections[0];
  assertEqual(channelSectionProps.channelKey, 'search', 'funnel channel props should preserve channel key');
  assertEqual(channelSectionProps.channelTitleText, '搜索渠道', 'funnel channel props should preserve channel title');
  assertSame(
    channelSectionProps.overviewSectionProps.tableProps.dataSource,
    sourceChannel.rows,
    'funnel channel overview should preserve channel rows reference',
  );
  assertSame(
    channelSectionProps.overviewSectionProps.tableProps.columns,
    columns.funnelDetailColumnsWithClickStage,
    'funnel channel overview should resolve click-stage columns before render',
  );
  assertEqual(
    channelSectionProps.overviewSectionProps.funnelData[0].color,
    expectedResolver(0),
    'funnel channel overview should resolve stage colors before render',
  );
  assertSame(
    channelSectionProps.quantSectionProps.tableProps.dataSource,
    viewModel.tmallSectionData.quantRows,
    'funnel channel quant section should receive channel-scoped backend rows',
  );
  assertSame(
    channelSectionProps.quantSectionProps.tableProps.columns,
    columns.quantColumns,
    'funnel channel quant section should preserve quant columns inside table props only',
  );
  assertEqual(
    channelSectionProps.summaryText.includes('渠道小结'),
    true,
    'funnel channel section should receive adapter-built summary text',
  );

  const leakedKeys = [
    'funnelChannelSections',
    'funnelDetailColumnsWithClickStage',
    'funnelDetailColumnsWithoutClickStage',
    'isMobile',
    'quantColumns',
    'quantRows',
    'quantRowsByChannel',
    'resolveFunnelStageColor',
  ];
  for (const key of leakedKeys) {
    assertEqual(key in sectionProps, false, `funnel section should not leak raw list prop: ${key}`);
    assertEqual(key in channelSectionProps, false, `funnel channel section should not leak raw list prop: ${key}`);
  }
  assertEqual('channelSection' in channelSectionProps, false, 'funnel channel section should not leak raw channel section');
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass the whole view model');
  assertEqual('columns' in sectionProps, false, 'section props should not pass the whole column bundle');
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
}

function assertRenderOnlyTmallAttributionSections() {
  const repoRoot = process.cwd();
  const relativePath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-attribution-sections.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, relativePath));

  if (hasImportSource(sourceFile, 'platform-tab-tmall-attribution-section-adapter')) {
    fail(`${relativePath} should stay render-only and must not import its section adapter`);
  }

  const bannedIdentifiers = [
    'buildTmallAttributionSectionProps',
    'TmallPlatformColumns',
    'PlatformTabViewModel',
  ];

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`${relativePath} should stay render-only and must not contain ${identifierName}`);
    }
  }

  for (const rawPropName of [
    'isMobile',
    'columns',
    'viewModel',
  ]) {
    if (
      hasIdentifier(sourceFile, rawPropName) ||
      hasFunctionObjectParameterBinding(
        sourceFile,
        'PlatformTabTmallAttributionSections',
        rawPropName,
      ) ||
      hasObjectLiteralProperty(sourceFile, rawPropName)
    ) {
      fail(`${relativePath} should stay render-only and must not consume raw prop ${rawPropName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-tmall-attribution-section-contracts',
    importedName: 'PlatformTabTmallAttributionSectionsProps',
  })) {
    fail(`${relativePath} should keep render-ready Tmall attribution contract import`);
  }

  if (
    getFunctionParameterType(sourceFile, 'PlatformTabTmallAttributionSections') !==
    'PlatformTabTmallAttributionSectionsProps'
  ) {
    fail(`${relativePath} should accept PlatformTabTmallAttributionSectionsProps directly`);
  }

  for (const propName of [
    'goodsSectionProps',
    'channelSectionProps',
    'funnelSectionProps',
  ]) {
    if (
      !hasFunctionObjectParameterBinding(
        sourceFile,
        'PlatformTabTmallAttributionSections',
        propName,
      )
    ) {
      fail(`${relativePath} should keep render-ready Tmall attribution contract prop ${propName}`);
    }
  }

  for (const { tagName, spreadName } of [
    { tagName: 'TmallGoodsAttributionSection', spreadName: 'goodsSectionProps' },
    { tagName: 'TmallChannelAttributionSection', spreadName: 'channelSectionProps' },
    { tagName: 'TmallFunnelDiagnosisSections', spreadName: 'funnelSectionProps' },
  ]) {
    if (!hasJsxElementWithSpread(sourceFile, { tagName, spreadName })) {
      fail(`${relativePath} should render ${tagName} with ${spreadName}`);
    }
  }
}

export async function runWeeklyTmallAttributionSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertRenderOnlyTmallAttributionSections();

  const {
    buildTmallAttributionSectionProps,
    WATERFALL_TOTAL_COLOR,
    getFunnelStageColor,
  } = await loadTmallAttributionSectionAdapter();

  const columns = makeColumns();
  const viewModel = makeViewModel();
  const bundle = buildTmallAttributionSectionProps({
    isMobile: true,
    columns,
    viewModel,
  });

  assertKeys(
    bundle,
    ['channelSectionProps', 'funnelSectionProps', 'goodsSectionProps'],
    'Tmall adapter should return the three section prop groups',
  );
  assertGoodsSectionProps(bundle.goodsSectionProps, columns, viewModel, WATERFALL_TOTAL_COLOR);
  assertChannelSectionProps(bundle.channelSectionProps, columns, viewModel, WATERFALL_TOTAL_COLOR);
  assertFunnelSectionProps(bundle.funnelSectionProps, columns, viewModel, getFunnelStageColor);
  assertNoCrossLeaks(bundle.goodsSectionProps);
  assertNoCrossLeaks(bundle.channelSectionProps);
  assertNoCrossLeaks(bundle.funnelSectionProps);
}
