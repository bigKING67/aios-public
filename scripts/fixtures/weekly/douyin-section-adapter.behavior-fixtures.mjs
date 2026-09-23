/**
 * Weekly platform tab Douyin section-adapter behavior fixtures.
 *
 * PlatformTabDouyinContent should stay render-only. The adapter owns the
 * mapping from Douyin content props into the narrow Douyin attribution sections
 * contract, including chart visual tokens.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  getInterfaceProperties,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
  WEEKLY_TABS_ROOT,
} from '../../lib/weekly/behavior-assert-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Douyin section adapter behavior fixtures require guard assertions.');
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

async function loadDouyinSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-section-adapter-',
    entrySource: [
      createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-section-adapter', [
        'buildDouyinAttributionSectionsProps',
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
    douyinLiveColumns: [{ key: 'live' }],
    douyinLiveDetailColumns: [{ key: 'live-detail' }],
    douyinShortvideoColumns: [{ key: 'shortvideo' }],
    douyinCardProductColumns: [{ key: 'card-product' }],
    douyinCardSourceColumns: [{ key: 'card-source' }],
    quantColumns: [{ key: 'quant' }],
  };
}

function makeContentProps() {
  const douyinSectionData = {
    showDouyinLiveSection: true,
    showDouyinShortvideoSection: false,
    showDouyinCardSection: true,
    douyinChannelAsOfDate: '2026-05-02',
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
  };

  return {
    isMobile: true,
    columns: makeColumns(),
    viewModel: {
      douyinSectionData,
      tmallSectionData: { marker: 'should-not-pass' },
      primaryMetrics: [{ key: 'gmv', value: '¥1,000' }],
    },
    report: { marker: 'should-not-pass' },
  };
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function assertPlatformTabDouyinContentIsRenderOnly(repoRoot) {
  const contentPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-content.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, contentPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-section-adapter')) {
    fail('PlatformTabDouyinContent must not import the Douyin section adapter');
  }
  if (hasIdentifier(sourceFile, 'buildDouyinAttributionSectionsProps')) {
    fail('PlatformTabDouyinContent must not build Douyin attribution section props');
  }
  if (hasIdentifier(sourceFile, 'DouyinPlatformContentProps')) {
    fail('PlatformTabDouyinContent must not depend on wider Douyin tab content props');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-attribution-section-contracts',
    importedName: 'DouyinAttributionSectionPropsBundle',
  })) {
    fail('PlatformTabDouyinContent missing render-ready contract import');
  }
  if (getFunctionParameterType(sourceFile, 'PlatformTabDouyinContent') !== 'DouyinAttributionSectionPropsBundle') {
    fail('PlatformTabDouyinContent should accept DouyinAttributionSectionPropsBundle directly');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinAttributionSections',
    spreadName: 'props',
  })) {
    fail('PlatformTabDouyinContent should render DouyinAttributionSections with render-ready props');
  }
}

function assertDouyinSectionAdapterOwnsNoContracts(repoRoot) {
  const adapterPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-section-adapter.ts';
  const { sourceFile } = parseWeeklyFile(repoRoot, adapterPath);

  if (getInterfaceProperties(sourceFile, 'BuildDouyinAttributionSectionsPropsParams')) {
    fail('Douyin section adapter must consume external build params contract, not define it locally');
  }
  for (const identifierName of ['DouyinPlatformColumns', 'PlatformTabViewModel']) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`Douyin section adapter must not depend on wider contracts directly: ${identifierName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-section-contracts',
    importedName: 'BuildDouyinAttributionSectionsPropsParams',
  })) {
    fail('Douyin section adapter should import its external build params contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'buildDouyinAttributionSectionsProps') !==
    'BuildDouyinAttributionSectionsPropsParams'
  ) {
    fail('Douyin section adapter should accept BuildDouyinAttributionSectionsPropsParams directly');
  }
}

function assertDouyinSectionAdapter(
  buildDouyinAttributionSectionsProps,
  expectedWaterfallTotalColor,
  expectedFunnelStageResolver,
) {
  const contentProps = makeContentProps();
  const sectionProps = buildDouyinAttributionSectionsProps(contentProps);

  assertKeys(
    sectionProps,
    [
      'channelSectionProps',
      'sectionListProps',
      'showEmptyAttributionSection',
    ],
    'Douyin section adapter should return render-ready attribution section props',
  );
  assertEqual(
    sectionProps.showEmptyAttributionSection,
    false,
    'adapter should resolve non-empty attribution visibility',
  );
  assertSame(
    sectionProps.channelSectionProps.donutChartProps.data,
    contentProps.viewModel.douyinSectionData.douyinChannelDonutData,
    'adapter should resolve channel donut data before render',
  );
  assertEqual(
    sectionProps.channelSectionProps.waterfallChartProps.totalColor,
    expectedWaterfallTotalColor,
    'adapter should use centralized waterfall total color in channel props',
  );
  assertSame(
    sectionProps.sectionListProps.liveSectionProps.sessionSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinLiveColumns,
    'adapter should preserve live columns inside render-ready table props',
  );
  assertSame(
    sectionProps.sectionListProps.liveSectionProps.funnelSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinLiveDetailColumns,
    'adapter should preserve live detail columns inside render-ready funnel props',
  );
  assertSame(
    sectionProps.sectionListProps.shortvideoSectionProps.overviewSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinShortvideoColumns,
    'adapter should preserve shortvideo columns inside render-ready table props',
  );
  assertSame(
    sectionProps.sectionListProps.cardSectionProps.productSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinCardProductColumns,
    'adapter should preserve card product columns inside render-ready table props',
  );
  assertSame(
    sectionProps.sectionListProps.cardSectionProps.sourceSectionProps.overviewSectionProps.tableProps.columns,
    contentProps.columns.douyinCardSourceColumns,
    'adapter should preserve card source columns inside render-ready table props',
  );
  assertSame(
    sectionProps.sectionListProps.cardSectionProps.funnelSectionProps.quantSectionProps.tableProps.columns,
    contentProps.columns.quantColumns,
    'adapter should preserve quant columns inside render-ready table props',
  );
  assertEqual(
    sectionProps.sectionListProps.cardSectionProps.funnelSectionProps.overviewSectionProps.funnelData[0].color,
    expectedFunnelStageResolver(0),
    'adapter should use centralized funnel stage color resolver before render',
  );
  assertEqual('columns' in sectionProps, false, 'adapter should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'adapter should not pass full view model');
  assertEqual('report' in sectionProps, false, 'adapter should not pass report context');
  assertEqual('tmallSectionData' in sectionProps, false, 'adapter should not leak Tmall data');
  assertEqual('data' in sectionProps, false, 'adapter should not leak raw Douyin data at top level');
  assertEqual('isMobile' in sectionProps, false, 'adapter should not leak raw responsive flag at top level');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'adapter should not leak raw waterfall color at top level');
}

export async function runWeeklyDouyinSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertPlatformTabDouyinContentIsRenderOnly(repoRoot);
  assertDouyinSectionAdapterOwnsNoContracts(repoRoot);

  const {
    buildDouyinAttributionSectionsProps,
    WATERFALL_TOTAL_COLOR,
    getFunnelStageColor,
  } = await loadDouyinSectionAdapter();

  assertDouyinSectionAdapter(
    buildDouyinAttributionSectionsProps,
    WATERFALL_TOTAL_COLOR,
    getFunnelStageColor,
  );
}
