/**
 * Weekly platform tab Tmall funnel leaf-adapter behavior fixtures.
 *
 * Tmall funnel channel containers should stay render-only. The adapter owns
 * click-stage routing, detail table columns/scroll, funnel chart data, summary
 * text, quant fallback rows, and narrow overview/quant child props.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithAttribute,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
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
    throw new Error('Tmall funnel leaf adapter behavior fixtures require guard assertions.');
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

async function loadTmallFunnelLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-tmall-funnel-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-tmall-funnel-leaf-adapter', [
      'buildTmallFunnelChannelLeafProps',
    ]),
  });
}

function makeFunnelRow(overrides = {}) {
  return {
    rowId: 'row-1',
    productId: 'P001',
    productName: '精华礼盒',
    trafficChannel: 'search',
    trafficChannelLabel: '搜索',
    metricSource: 'search',
    hasClickStage: true,
    currVisitorCount: 1000,
    prevVisitorCount: 820,
    currImpressionCount: 5000,
    prevImpressionCount: 4300,
    currClickCount: 900,
    prevClickCount: 720,
    currCartCount: 180,
    prevCartCount: 140,
    currPayBuyerCount: 80,
    prevPayBuyerCount: 62,
    currPayAmount: 128800,
    prevPayAmount: 100000,
    payAmountWoW: 0.288,
    currCtr: 0.18,
    prevCtr: 0.167,
    currClickToCartRate: 0.2,
    prevClickToCartRate: 0.194,
    currCartToPayRate: 0.444,
    prevCartToPayRate: 0.443,
    currCost: 12000,
    prevCost: 10000,
    costWoW: 0.2,
    currRoi: 10.73,
    prevRoi: 10,
    roiWoW: 0.073,
    currAvgClickCost: 13.33,
    prevAvgClickCost: 13.89,
    currCpm: 2.4,
    prevCpm: 2.33,
    currClickConversionRate: 0.089,
    prevClickConversionRate: 0.086,
    currWangwangConsultCount: 28,
    prevWangwangConsultCount: 22,
    currMemberJoinCount: 18,
    prevMemberJoinCount: 13,
    currNewBuyerCount: 36,
    prevNewBuyerCount: 25,
    currCouponClaimCount: 80,
    prevCouponClaimCount: 66,
    currTotalFavoriteCartCount: 250,
    prevTotalFavoriteCartCount: 190,
    ...overrides,
  };
}

function makeChannelSection(overrides = {}) {
  const rows = overrides.rows || [makeFunnelRow(overrides.rowOverrides)];

  return {
    channelKey: 'search',
    titleText: '搜索渠道',
    summaryText: '搜索',
    rows,
    stages: [
      {
        key: 'impression',
        label: '曝光',
        value: 5000,
        prevValue: 4300,
        wow: 0.1628,
      },
      {
        key: 'click',
        label: '点击',
        value: 900,
        prevValue: 720,
        wow: 0.25,
        conversionLabel: '点击率',
        conversionRate: 0.18,
        conversionPrevRate: 0.167,
        conversionWoW: 0.013,
      },
    ],
    currPayAmount: 128800,
    prevPayAmount: 100000,
    ...overrides,
  };
}

function makeProps(overrides = {}) {
  const quantRows = [
    {
      rowId: 'template-click-rate',
      factorKey: 'click_rate',
      factorLabel: '点击率',
      currValue: 0.18,
      prevValue: 0.167,
      changeRate: 0.013,
      lnContribution: 1200,
      contributionRate: 4.17,
      effect: '拉动',
      reason: '点击率提升',
      action: '复用搜索词',
      priority: 'P1',
    },
  ];

  return {
    isMobile: overrides.isMobile ?? true,
    channelSection: makeChannelSection(overrides.channelSection || {}),
    quantRows,
    quantRowsByChannel: new Map(overrides.quantRowsByChannelEntries || []),
    quantColumns: [{ key: 'quant' }],
    funnelDetailColumnsWithClickStage: [{ key: 'with-click' }],
    funnelDetailColumnsWithoutClickStage: [{ key: 'without-click' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoContextLeaks(sectionProps) {
  assertEqual('channelSection' in sectionProps, false, 'child props should not pass the full channel section');
  assertEqual('quantRowsByChannel' in sectionProps, false, 'child props should not pass the quant map');
  assertEqual('report' in sectionProps, false, 'child props should not pass report context');
  assertEqual('viewModel' in sectionProps, false, 'child props should not pass view model');
}

function assertChannelSectionIsRenderOnly() {
  const sectionPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-funnel-channel-section.tsx';
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-tmall-funnel-leaf-adapter')) {
    fail('TmallFunnelChannelSection must not import its leaf adapter');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-tmall-funnel-channel-section-contracts',
    importedName: 'TmallFunnelChannelSectionProps',
  })) {
    fail('TmallFunnelChannelSection must import its render-ready props contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'TmallFunnelChannelSection') !==
    'TmallFunnelChannelSectionProps'
  ) {
    fail('TmallFunnelChannelSection must keep its imported render-ready props contract');
  }

  for (const identifierName of [
    'buildTmallFunnelChannelLeafProps',
    'ColumnsType',
    'QuantAttributionRow',
    'isMobile',
    'channelSection',
    'quantRows',
    'quantRowsByChannel',
    'quantColumns',
    'funnelDetailColumnsWithClickStage',
    'funnelDetailColumnsWithoutClickStage',
    'resolveFunnelStageColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallFunnelChannelSection must stay render-only: ${identifierName}`);
    }
  }

  for (const { tagName, attributeName } of [
    { tagName: 'TmallFunnelChannelOverviewSection', attributeName: 'rowKey' },
    { tagName: 'TmallFunnelChannelOverviewSection', attributeName: 'dataSource' },
    { tagName: 'TmallFunnelChannelOverviewSection', attributeName: 'columns' },
    { tagName: 'TmallFunnelChannelOverviewSection', attributeName: 'pagination' },
    { tagName: 'TmallFunnelChannelOverviewSection', attributeName: 'scroll' },
  ]) {
    if (hasJsxElementWithAttribute(sourceFile, { tagName, attributeName })) {
      fail(`TmallFunnelChannelSection must not own ${tagName} ${attributeName}`);
    }
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklySectionHeader',
    attributeName: 'title',
    expressionText: '`GMV波动归因 · 商品 · 流量渠道 · ${channelTitleText}`',
  })) {
    fail('TmallFunnelChannelSection missing adapter-provided channel title rendering');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'TmallFunnelChannelOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('TmallFunnelChannelSection must render adapter-provided overviewSectionProps');
  }
  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('TmallFunnelChannelSection must render adapter-provided summaryText');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'TmallFunnelChannelQuantSection',
    spreadName: 'quantSectionProps',
  })) {
    fail('TmallFunnelChannelSection must render adapter-provided quantSectionProps');
  }
}

function assertFunnelLeafAdapterConsumesExternalContracts() {
  const adapterPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-funnel-leaf-adapter.ts';
  const { sourceFile } = parseTsxFile(adapterPath);

  for (const typeName of [
    'BuildTmallFunnelChannelLeafPropsParams',
    'TmallFunnelChannelLeafPropsBundle',
  ]) {
    if (hasLocalTypeDeclaration(sourceFile, typeName)) {
      fail(`Tmall funnel leaf adapter should import leaf contracts instead of declaring local contract: ${typeName}`);
    }
  }

  for (const importedName of [
    'BuildTmallFunnelChannelLeafPropsParams',
    'TmallFunnelChannelLeafPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-tmall-funnel-leaf-contracts',
      importedName,
    })) {
      fail(`Tmall funnel leaf adapter missing external leaf contract import: ${importedName}`);
    }
  }

  if (
    getFunctionParameterType(sourceFile, 'buildTmallFunnelChannelLeafProps') !==
    'BuildTmallFunnelChannelLeafPropsParams'
  ) {
    fail('buildTmallFunnelChannelLeafProps should accept the external input contract');
  }
}

function assertOverviewProps(bundle, sourceProps) {
  assertKeys(
    bundle.overviewSectionProps,
    [
      'funnelData',
      'tableProps',
    ],
    'Tmall funnel overview props should stay narrow',
  );
  assertKeys(
    bundle.overviewSectionProps.tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'Tmall funnel table props should stay narrow',
  );
  assertSame(bundle.overviewSectionProps.tableProps.dataSource, sourceProps.channelSection.rows, 'overview table should preserve rows');
  assertSame(bundle.overviewSectionProps.tableProps.columns, sourceProps.funnelDetailColumnsWithClickStage, 'click-stage overview table should use click-stage columns');
  assertEqual(bundle.overviewSectionProps.tableProps.size, 'small', 'mobile overview table should use compact size');
  assertEqual(bundle.overviewSectionProps.tableProps.pagination.pageSize, 6, 'mobile overview table should use page size 6');
  assertEqual(bundle.overviewSectionProps.tableProps.pagination.showSizeChanger, false, 'mobile overview table should hide size changer');
  assertEqual(bundle.overviewSectionProps.tableProps.scroll.x, 1240, 'click-stage overview table should use click-stage mobile x');
  assertEqual(
    bundle.overviewSectionProps.tableProps.rowKey(sourceProps.channelSection.rows[0]),
    'row-1',
    'overview table rowKey should use row id',
  );

  assertEqual(bundle.overviewSectionProps.funnelData.length, 2, 'overview should map funnel stages');
  assertEqual(bundle.overviewSectionProps.funnelData[0].name, '曝光', 'funnel stage should map name');
  assertEqual(bundle.overviewSectionProps.funnelData[0].prevText, '上周 4,300', 'funnel stage should map previous text');
  assertEqual(bundle.overviewSectionProps.funnelData[0].color, 'stage-0', 'funnel stage should use resolver color');
  assertEqual(bundle.overviewSectionProps.funnelData[1].conversionText, '点击率 18.00%', 'funnel stage should map conversion text');
  assertEqual(bundle.overviewSectionProps.funnelData[1].conversionPrevText, '上周 16.70%', 'funnel stage should map previous conversion text');
  assertEqual(bundle.overviewSectionProps.funnelData[1].color, 'stage-1', 'second stage should use resolver color');
  assertNoContextLeaks(bundle.overviewSectionProps);
  assertNoContextLeaks(bundle.overviewSectionProps.tableProps);
}

function assertQuantProps(bundle, sourceProps) {
  assertKeys(
    bundle.quantSectionProps,
    ['tableProps', 'title'],
    'Tmall funnel quant props should stay narrow',
  );
  assertEqual(
    bundle.quantSectionProps.title,
    '量化归因（GMV = 曝光 × 点击率 × 点击加购率 × 加购转化率 × 客单价）',
    'click-stage quant should use click-stage formula',
  );
  assertKeys(
    bundle.quantSectionProps.tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size', 'variant'],
    'Tmall funnel quant table props should stay narrow',
  );
  assertEqual(bundle.quantSectionProps.tableProps.variant, 'quant', 'quant table should use quant variant');
  assertSame(bundle.quantSectionProps.tableProps.columns, sourceProps.quantColumns, 'quant table should preserve columns');
  assertEqual(bundle.quantSectionProps.tableProps.dataSource.length > 0, true, 'quant table should build fallback rows');
  assertEqual(bundle.quantSectionProps.tableProps.size, 'small', 'mobile quant table should use compact size');
  assertEqual(bundle.quantSectionProps.tableProps.pagination.pageSize, 8, 'mobile quant table should use page size 8');
  assertEqual(bundle.quantSectionProps.tableProps.pagination.showSizeChanger, false, 'mobile quant table should hide size changer');
  assertEqual(bundle.quantSectionProps.tableProps.scroll.x, 1180, 'mobile quant table should use mobile x');
  assertEqual(
    bundle.quantSectionProps.tableProps.rowKey(bundle.quantSectionProps.tableProps.dataSource[0]),
    `search-${bundle.quantSectionProps.tableProps.dataSource[0].rowId}`,
    'quant table rowKey should prefix channel key',
  );
  assertNoContextLeaks(bundle.quantSectionProps);
  assertNoContextLeaks(bundle.quantSectionProps.tableProps);
}

function assertLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['overviewSectionProps', 'quantSectionProps', 'summaryText'],
    'Tmall funnel leaf adapter should return overview props, summary text, and quant props',
  );
  assertOverviewProps(bundle, sourceProps);
  assertEqual(
    bundle.summaryText,
    '渠道小结｜上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'Tmall funnel leaf adapter should build period delta summary once',
  );
  assertQuantProps(bundle, sourceProps);
}

export async function runWeeklyTmallFunnelLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertFunnelLeafAdapterConsumesExternalContracts();
  assertChannelSectionIsRenderOnly();

  const {
    buildTmallFunnelChannelLeafProps,
  } = await loadTmallFunnelLeafAdapter();

  const props = makeProps();
  assertLeafProps(
    buildTmallFunnelChannelLeafProps(props),
    props,
  );

  const backendRows = [{ rowId: 'backend-row' }];
  const backendBundle = buildTmallFunnelChannelLeafProps(
    makeProps({ quantRowsByChannelEntries: [['search', backendRows]] }),
  );
  assertSame(
    backendBundle.quantSectionProps.tableProps?.dataSource,
    backendRows,
    'adapter should prefer backend quant rows when available',
  );

  const noClickProps = makeProps({
    channelSection: {
      rows: [makeFunnelRow({ hasClickStage: false, trafficChannelLabel: '' })],
      stages: [
        {
          key: 'visitor',
          label: '访客',
          value: 1200,
          prevValue: 1000,
          wow: 0.2,
        },
      ],
    },
  });
  const noClickBundle = buildTmallFunnelChannelLeafProps(noClickProps);
  assertSame(
    noClickBundle.overviewSectionProps.tableProps.columns,
    noClickProps.funnelDetailColumnsWithoutClickStage,
    'non-click-stage overview should use non-click-stage columns',
  );
  assertEqual(noClickBundle.overviewSectionProps.tableProps.scroll.x, 980, 'non-click-stage overview should use compact mobile x');
  assertEqual(
    noClickBundle.quantSectionProps.title,
    '量化归因（GMV = 访客 × 点击加购率 × 加购转化率 × 客单价）',
    'non-click-stage quant should use visitor formula',
  );

  const desktopBundle = buildTmallFunnelChannelLeafProps(
    makeProps({ channelSection: { rows: [makeFunnelRow()] } , isMobile: false }),
  );
  assertEqual(
    desktopBundle.overviewSectionProps.tableProps.pagination,
    false,
    'desktop overview should disable pagination',
  );
  assertEqual(
    desktopBundle.overviewSectionProps.tableProps.scroll.x,
    1860,
    'desktop click-stage overview should use click-stage desktop x',
  );
  assertEqual(
    desktopBundle.overviewSectionProps.tableProps.scroll.y,
    420,
    'desktop overview should preserve desktop y',
  );
}
