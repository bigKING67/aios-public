/**
 * Weekly platform tab Tmall funnel section-list adapter behavior fixtures.
 *
 * TmallFunnelDiagnosisSections should stay render-only. The adapter owns
 * mapping the wide list props into per-channel section contracts and the empty
 * section predicate.
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
    throw new Error('Tmall funnel section-list adapter behavior fixtures require guard assertions.');
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

async function loadTmallFunnelSectionListAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-tmall-funnel-section-list-adapter-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-tmall-funnel-section-list-adapter',
      ['buildTmallFunnelDiagnosisSectionListProps'],
    ),
  });
}

function makeListProps(overrides = {}) {
  const firstChannelSection = {
    channelKey: 'search',
    titleText: '搜索渠道',
    summaryText: '搜索',
    rows: [{ rowId: 'row-1', hasClickStage: true, trafficChannelLabel: '搜索' }],
    stages: [{ key: 'visit', label: '访客', value: 1200, prevValue: 1000 }],
    currPayAmount: 128800,
    prevPayAmount: 100000,
  };
  const secondChannelSection = {
    channelKey: 'recommend',
    titleText: '推荐渠道',
    summaryText: '推荐',
    rows: [{ rowId: 'row-2', hasClickStage: false, trafficChannelLabel: '推荐' }],
    stages: [{ key: 'visit', label: '访客', value: 800, prevValue: 700 }],
    currPayAmount: 68800,
    prevPayAmount: 60000,
  };

  return {
    isMobile: true,
    funnelChannelSections: [firstChannelSection, secondChannelSection],
    quantRows: [{ rowId: 'template-row' }],
    quantRowsByChannel: new Map([
      ['search', [{ rowId: 'backend-row-search' }]],
      ['recommend', [{ rowId: 'backend-row-recommend' }]],
    ]),
    quantColumns: [{ key: 'quant' }],
    funnelDetailColumnsWithClickStage: [{ key: 'with-click' }],
    funnelDetailColumnsWithoutClickStage: [{ key: 'without-click' }],
    resolveFunnelStageColor: (index) => `stage-${index}`,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
    ...overrides,
  };
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('funnelChannelSections' in sectionProps, false, 'channel section props should not pass full section list');
  assertEqual('channelSection' in sectionProps, false, 'channel section props should not pass raw channel section');
  assertEqual('quantRows' in sectionProps, false, 'channel section props should not pass raw quant rows');
  assertEqual('quantRowsByChannel' in sectionProps, false, 'channel section props should not pass raw quant map');
  assertEqual('quantColumns' in sectionProps, false, 'channel section props should not pass raw quant columns');
  assertEqual('isMobile' in sectionProps, false, 'channel section props should not pass responsive flag');
  assertEqual('resolveFunnelStageColor' in sectionProps, false, 'channel section props should not pass color resolver');
  assertEqual('report' in sectionProps, false, 'channel section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'channel section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'channel section props should not pass view model');
}

function assertChannelSectionProps(sectionProps, sourceProps, index) {
  assertKeys(
    sectionProps,
    [
      'channelKey',
      'channelTitleText',
      'overviewSectionProps',
      'quantSectionProps',
      'summaryText',
    ],
    'Tmall funnel section-list adapter should return render-ready channel section props',
  );
  const sourceChannel = sourceProps.funnelChannelSections[index];
  assertEqual(sectionProps.channelKey, sourceChannel.channelKey, 'channel section should preserve channel key');
  assertEqual(sectionProps.channelTitleText, sourceChannel.titleText, 'channel section should preserve title text');
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceChannel.rows,
    'channel overview should preserve channel rows reference',
  );
  const expectedColumns = sourceChannel.rows.some((item) => item.hasClickStage)
    ? sourceProps.funnelDetailColumnsWithClickStage
    : sourceProps.funnelDetailColumnsWithoutClickStage;
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    expectedColumns,
    'channel overview should resolve detail columns in adapter',
  );
  assertEqual(
    sectionProps.overviewSectionProps.funnelData[0].color,
    'stage-0',
    'channel overview should resolve stage colors in adapter',
  );
  const expectedQuantRows = sourceProps.quantRowsByChannel.get(sourceChannel.channelKey);
  assertSame(
    sectionProps.quantSectionProps.tableProps.dataSource,
    expectedQuantRows,
    'channel quant section should receive channel-scoped backend rows',
  );
  assertSame(
    sectionProps.quantSectionProps.tableProps.columns,
    sourceProps.quantColumns,
    'channel quant section should preserve quant columns inside table props only',
  );
  assertEqual(
    sectionProps.summaryText.includes('渠道小结'),
    true,
    'channel section should receive adapter-built summary text',
  );
  assertNoCrossLeaks(sectionProps);
}

function assertDiagnosisSectionsIsRenderOnly() {
  const sectionPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-funnel-diagnosis-sections.tsx';
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-tmall-funnel-section-list-adapter')) {
    fail('TmallFunnelDiagnosisSections must not import its section-list adapter');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-tmall-funnel-section-list-contracts',
    importedName: 'TmallFunnelDiagnosisSectionsProps',
  })) {
    fail('TmallFunnelDiagnosisSections must import its render-ready props contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'TmallFunnelDiagnosisSections') !==
    'TmallFunnelDiagnosisSectionsProps'
  ) {
    fail('TmallFunnelDiagnosisSections must keep its imported render-ready props contract');
  }

  for (const identifierName of [
    'buildTmallFunnelDiagnosisSectionListProps',
    'ColumnsType',
    'FunnelChannelRow',
    'FunnelChannelSection',
    'QuantAttributionRow',
    'isMobile',
    'funnelChannelSections',
    'quantRows',
    'quantRowsByChannel',
    'quantColumns',
    'funnelDetailColumnsWithClickStage',
    'funnelDetailColumnsWithoutClickStage',
    'resolveFunnelStageColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallFunnelDiagnosisSections must stay render-only: ${identifierName}`);
    }
  }

  if (!hasIdentifier(sourceFile, 'channelSectionPropsList')) {
    fail('TmallFunnelDiagnosisSections must consume adapter-provided channelSectionPropsList');
  }
  if (!hasIdentifier(sourceFile, 'showEmptyFunnelSection')) {
    fail('TmallFunnelDiagnosisSections must consume adapter-provided showEmptyFunnelSection');
  }
  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'TmallFunnelChannelSection',
    attributeName: 'key',
    expressionText: 'channelSectionProps.channelKey',
  })) {
    fail('TmallFunnelDiagnosisSections must key channel sections by channelKey');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'TmallFunnelChannelSection',
    spreadName: 'channelSectionProps',
  })) {
    fail('TmallFunnelDiagnosisSections must render adapter-provided channel section props');
  }
  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyEmptyState',
    attributeName: 'description',
    expressionText: '暂无流量漏斗拆解数据',
  })) {
    fail('TmallFunnelDiagnosisSections must keep empty state behavior');
  }
}

export async function runWeeklyTmallFunnelSectionListAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertDiagnosisSectionsIsRenderOnly();

  const {
    buildTmallFunnelDiagnosisSectionListProps,
  } = await loadTmallFunnelSectionListAdapter();

  const sourceProps = makeListProps();
  const bundle = buildTmallFunnelDiagnosisSectionListProps(sourceProps);

  assertKeys(
    bundle,
    ['channelSectionPropsList', 'showEmptyFunnelSection'],
    'Tmall funnel section-list adapter should return channel props list and empty predicate',
  );
  assertEqual(bundle.showEmptyFunnelSection, false, 'non-empty list should not show empty section');
  assertEqual(bundle.channelSectionPropsList.length, 2, 'adapter should build one prop bundle per channel section');
  assertChannelSectionProps(bundle.channelSectionPropsList[0], sourceProps, 0);
  assertChannelSectionProps(bundle.channelSectionPropsList[1], sourceProps, 1);

  const emptyBundle = buildTmallFunnelDiagnosisSectionListProps(
    makeListProps({ funnelChannelSections: [] }),
  );
  assertEqual(emptyBundle.showEmptyFunnelSection, true, 'empty list should show empty section');
  assertEqual(emptyBundle.channelSectionPropsList.length, 0, 'empty list should not build channel section props');
}
