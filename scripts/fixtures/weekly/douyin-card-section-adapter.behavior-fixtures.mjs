/**
 * Weekly platform tab Douyin card-section adapter behavior fixtures.
 *
 * DouyinCardAttributionSections should stay routing/render-only. The adapter
 * owns the mapping from the card attribution container props into the three
 * narrow child section contracts: product, source, and source funnel.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import path from 'node:path';
import {
  countCallExpressions,
  hasFunctionObjectParameterBinding,
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxAttribute,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasObjectLiteralProperty,
  hasPropertyAccessExpression,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Douyin card section adapter behavior fixtures require guard assertions.');
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

async function loadDouyinCardSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-card-section-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-card-section-adapter', [
      'buildDouyinCardAttributionSectionProps',
    ]),
  });
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function makeCardSectionProps() {
  const data = {
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
  };

  return {
    isMobile: true,
    data,
    douyinCardProductColumns: [{ key: 'card-product' }],
    douyinCardSourceColumns: [{ key: 'card-source' }],
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    quantColumns: [{ key: 'quant' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertProductSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['overviewSectionProps', 'summaryText'],
    'card product adapter should return render-ready product section props',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    ['tableProps', 'waterfallChartProps'],
    'card product adapter should keep narrow overview props',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardProductTableRows,
    'product section table should preserve product rows reference',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinCardProductColumns,
    'product section table should preserve product columns reference',
  );
  assertEqual(sectionProps.overviewSectionProps.tableProps.size, 'small', 'product mobile table should use compact size');
  assertEqual(sectionProps.overviewSectionProps.tableProps.scroll.x, 960, 'product mobile table should use mobile x');
  assertEqual(
    sectionProps.overviewSectionProps.tableProps.rowKey(sourceProps.data.douyinCardProductTableRows[0]),
    'product-1',
    'product section table rowKey should use row id',
  );
  assertEqual(
    sectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'product waterfall should preserve total color',
  );
  assertSame(
    sectionProps.overviewSectionProps.waterfallChartProps.steps,
    sourceProps.data.douyinCardProductWaterfallSteps,
    'product waterfall should preserve steps',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'product section should receive adapter-built summary text',
  );
}

function assertSourceSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['overviewSectionProps', 'sourceDescription', 'summaryText'],
    'card source adapter should return render-ready source section props',
  );
  assertEqual(
    sectionProps.sourceDescription,
    '聚焦商品 精华礼盒（P001）拆解 12 个一级来源渠道。',
    'source section should receive adapter-built source description',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    ['tableProps', 'waterfallChartProps'],
    'card source adapter should keep narrow overview props',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinCardSourceTableRows,
    'source section table should preserve source rows reference',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinCardSourceColumns,
    'source section table should preserve source columns reference',
  );
  assertEqual(sectionProps.overviewSectionProps.tableProps.size, 'small', 'source mobile table should use compact size');
  assertEqual(sectionProps.overviewSectionProps.tableProps.scroll.x, 920, 'source mobile table should use mobile x');
  assertEqual(
    sectionProps.overviewSectionProps.tableProps.rowKey(sourceProps.data.douyinCardSourceTableRows[0]),
    'source-1',
    'source section table rowKey should use row id',
  );
  assertEqual(
    sectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'source waterfall should preserve total color',
  );
  assertSame(
    sectionProps.overviewSectionProps.waterfallChartProps.steps,
    sourceProps.data.douyinCardSourceWaterfallSteps,
    'source waterfall should preserve steps',
  );
  assertEqual(
    sectionProps.summaryText,
    '渠道小结｜上周同期：¥6.00万 ｜ 本周同期：¥8.88万 ｜ 总增量：+¥2.88万',
    'source section should receive adapter-built summary text',
  );
}

function assertFunnelSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    [
      'overviewSectionProps',
      'quantSectionProps',
      'selectedSourceLevelText',
    ],
    'card funnel adapter should keep only render-ready funnel section props',
  );
  assertEqual(sectionProps.selectedSourceLevelText, '商城推荐', 'card funnel section should resolve source title text');
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinCardDetailRows,
    'card funnel overview table should preserve detail rows reference',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinLiveDetailColumns,
    'card funnel overview table should preserve live-detail columns reference',
  );
  assertEqual(sectionProps.overviewSectionProps.tableProps.size, 'small', 'card funnel mobile table should use compact size');
  assertEqual(sectionProps.overviewSectionProps.tableProps.pagination, false, 'card funnel table should disable pagination');
  assertEqual(sectionProps.overviewSectionProps.tableProps.scroll.x, 680, 'card funnel mobile table should use mobile x');
  assertEqual(
    sectionProps.overviewSectionProps.tableProps.rowKey(sourceProps.data.selectedDouyinCardDetailRows[0]),
    'card_exposure_count',
    'card funnel table rowKey should use metric key',
  );
  assertEqual(sectionProps.overviewSectionProps.funnelData[0].color, 'stage-0', 'card funnel adapter should resolve stage colors');
  assertEqual(sectionProps.quantSectionProps.tableProps.variant, 'quant', 'card funnel quant table should use quant variant');
  assertSame(
    sectionProps.quantSectionProps.tableProps.dataSource,
    sourceProps.data.selectedDouyinCardQuantRows,
    'card funnel quant table should preserve quant rows reference',
  );
  assertSame(
    sectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'card funnel quant table should preserve quant columns reference',
  );
  assertEqual(
    sectionProps.quantSectionProps.tableProps.rowKey(sourceProps.data.selectedDouyinCardQuantRows[0]),
    'card-click_rate',
    'card funnel quant table rowKey should prefix row id',
  );
  assertEqual('data' in sectionProps, false, 'card funnel section should not leak raw data');
  assertEqual('douyinLiveDetailColumns' in sectionProps, false, 'card funnel section should not leak raw detail columns');
  assertEqual('quantColumns' in sectionProps, false, 'card funnel section should not leak raw quant columns');
  assertEqual('isMobile' in sectionProps, false, 'card funnel section should not leak responsive flag');
  assertEqual('resolveFunnelStageColor' in sectionProps, false, 'card funnel section should not leak stage color resolver');
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('data' in sectionProps, false, 'section props should not leak raw data');
  assertEqual('isMobile' in sectionProps, false, 'section props should not leak responsive flag');
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass view model');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'section props should not leak waterfall color token');
  assertEqual(
    'waterfallTotalColor' in sectionProps && 'resolveFunnelStageColor' in sectionProps,
    false,
    'section props should not mix waterfall and funnel visual contracts',
  );
}

function assertSectionContainerIsRenderOnly(repoRoot) {
  const sectionPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-attribution-sections.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, sectionPath);

  if (hasIdentifier(sourceFile, 'buildDouyinCardAttributionSectionProps')) {
    fail('DouyinCardAttributionSections must stay render-ready: buildDouyinCardAttributionSectionProps');
  }
  if (hasImportSource(sourceFile, 'platform-tab-douyin-card-section-adapter')) {
    fail('DouyinCardAttributionSections must stay render-ready: platform-tab-douyin-card-section-adapter');
  }

  const bannedTypeNames = [
    'buildDouyinCardAttributionSectionProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinCardProductRow',
    'DouyinCardSourceRow',
    'DouyinMetricDetailRow',
    'QuantAttributionRow',
  ];

  for (const typeName of bannedTypeNames) {
    if (hasIdentifier(sourceFile, typeName)) {
      fail(`DouyinCardAttributionSections must stay render-ready: ${typeName}`);
    }
  }

  const bannedRawProps = [
    'isMobile',
    'data',
    'douyinCardProductColumns',
    'douyinCardSourceColumns',
    'douyinLiveDetailColumns',
    'quantColumns',
    'resolveFunnelStageColor',
    'waterfallTotalColor',
  ];

  for (const propName of bannedRawProps) {
    if (
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinCardAttributionSections', propName) ||
      hasObjectLiteralProperty(sourceFile, propName) ||
      hasJsxAttribute(sourceFile, propName)
    ) {
      fail(`DouyinCardAttributionSections must stay render-ready: ${propName}`);
    }
  }

  if (countCallExpressions(sourceFile, 'buildDouyinCardAttributionSubsectionList') > 0) {
    fail('DouyinCardAttributionSections must not build subsection routing directly');
  }
  if (hasImportSource(sourceFile, 'platform-tab-douyin-card-sections-routing')) {
    fail('DouyinCardAttributionSections must not import subsection routing directly');
  }
  if (!hasPropertyAccessExpression(sourceFile, 'subsectionList.map')) {
    fail('DouyinCardAttributionSections must render adapter-provided subsectionList');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-card-section-contracts',
    importedName: 'DouyinCardAttributionSectionsProps',
  })) {
    fail('DouyinCardAttributionSections missing render-ready contract import');
  }

  if (getFunctionParameterType(sourceFile, 'DouyinCardAttributionSections') !== 'DouyinCardAttributionSectionsProps') {
    fail('DouyinCardAttributionSections should accept DouyinCardAttributionSectionsProps directly');
  }

  for (const propName of [
    'subsectionList',
    'productSectionProps',
    'sourceSectionProps',
    'funnelSectionProps',
  ]) {
    if (!hasFunctionObjectParameterBinding(sourceFile, 'DouyinCardAttributionSections', propName)) {
      fail(`DouyinCardAttributionSections missing required render contract: ${propName}`);
    }
  }

  for (const { tagName, spreadName } of [
    { tagName: 'DouyinCardProductAttributionSection', spreadName: 'productSectionProps' },
    { tagName: 'DouyinCardSourceAttributionSection', spreadName: 'sourceSectionProps' },
    { tagName: 'DouyinCardSourceFunnelSection', spreadName: 'funnelSectionProps' },
  ]) {
    if (!hasJsxElementWithSpread(sourceFile, { tagName, spreadName })) {
      fail(`DouyinCardAttributionSections should render ${tagName} with ${spreadName}`);
    }
  }
}

export async function runWeeklyDouyinCardSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionContainerIsRenderOnly(repoRoot);

  const {
    buildDouyinCardAttributionSectionProps,
  } = await loadDouyinCardSectionAdapter();

  const sourceProps = makeCardSectionProps();
  const bundle = buildDouyinCardAttributionSectionProps(sourceProps);

  assertKeys(
    bundle,
    ['funnelSectionProps', 'productSectionProps', 'sourceSectionProps', 'subsectionList'],
    'card adapter should return routing list plus the three card section prop groups',
  );
  assertEqual(
    bundle.subsectionList.map((section) => section.kind).join('>'),
    'product>source>funnel',
    'card adapter should build subsection routing list in stable order',
  );

  assertProductSectionProps(bundle.productSectionProps, sourceProps);
  assertSourceSectionProps(bundle.sourceSectionProps, sourceProps);
  assertFunnelSectionProps(bundle.funnelSectionProps, sourceProps);
  assertNoCrossLeaks(bundle.productSectionProps);
  assertNoCrossLeaks(bundle.sourceSectionProps);
  assertNoCrossLeaks(bundle.funnelSectionProps);
}
