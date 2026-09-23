/**
 * Weekly platform tab Douyin channel leaf-adapter behavior fixtures.
 *
 * The channel section should stay render-only. The adapter owns data field
 * extraction, chart prop construction, summary text, and empty chart contracts.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import path from 'node:path';
import {
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithAttribute,
  hasJsxElementWithExpressionChild,
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
    throw new Error('Douyin channel leaf adapter behavior fixtures require guard assertions.');
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

async function loadDouyinChannelLeafAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-channel-leaf-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-channel-leaf-adapter', [
      'buildDouyinChannelAttributionLeafProps',
    ]),
  });
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function makeChannelData(overrides = {}) {
  return {
    douyinChannelAsOfDate: '2026-05-04',
    hasDouyinChannelData: true,
    douyinChannelDonutData: [
      { name: '短视频', value: 32000, prevValue: 26000, color: '#3264f6' },
      { name: '直播', value: 56800, prevValue: 34000, color: '#445df6' },
    ],
    douyinChannelTotalCurrent: 128800,
    douyinChannelTotalPrev: 100000,
    douyinChannelDelta: 28800,
    douyinChannelWaterfallSteps: [
      { name: '短视频', delta: 6000, current: 32000, prev: 26000, share: 20.83, color: '#3264f6' },
      { name: '直播', delta: 22800, current: 56800, prev: 34000, share: 79.17, color: '#445df6' },
    ],
    hasDouyinChannelContributionData: true,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
    ...overrides,
  };
}

function makeChannelProps(overrides = {}) {
  return {
    data: makeChannelData(overrides),
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertNoOuterContextLeaks(sectionProps) {
  assertEqual('report' in sectionProps, false, 'leaf child props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'leaf child props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'leaf child props should not pass view model');
}

function assertChannelSectionIsRenderOnly() {
  const repoRoot = process.cwd();
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-channel-section.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, sectionPath);

  for (const identifierName of [
    'buildDouyinChannelAttributionLeafProps',
    'DouyinSectionData',
    'formatDouyinChannelAttributionSummary',
    'douyinChannelDonutData',
    'douyinChannelTotalCurrent',
    'douyinChannelTotalPrev',
    'douyinChannelWaterfallSteps',
    'hasDouyinChannelData',
    'hasDouyinChannelContributionData',
    'data',
    'waterfallTotalColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinChannelAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-channel-leaf-adapter')) {
    fail('DouyinChannelAttributionSection must not import its adapter');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-channel-leaf-contracts',
    importedName: 'DouyinChannelAttributionSectionProps',
  })) {
    fail('DouyinChannelAttributionSection missing render contract import');
  }
  if (
    getFunctionParameterType(sourceFile, 'DouyinChannelAttributionSection') !==
    'DouyinChannelAttributionSectionProps'
  ) {
    fail('DouyinChannelAttributionSection should accept render-ready props directly');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DonutChart',
    spreadName: 'donutChartProps',
  })) {
    fail('DouyinChannelAttributionSection must render adapter-provided donutChartProps');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WaterfallChart',
    spreadName: 'waterfallChartProps',
  })) {
    fail('DouyinChannelAttributionSection must render adapter-provided waterfallChartProps');
  }
  for (const { tagName, attributeName } of [
    { tagName: 'DonutChart', attributeName: 'height' },
    { tagName: 'DonutChart', attributeName: 'data' },
    { tagName: 'WaterfallChart', attributeName: 'height' },
    { tagName: 'WaterfallChart', attributeName: 'totalColor' },
    { tagName: 'WaterfallChart', attributeName: 'steps' },
    { tagName: 'WaterfallChart', attributeName: 'startValue' },
    { tagName: 'WaterfallChart', attributeName: 'endValue' },
  ]) {
    if (hasJsxElementWithAttribute(sourceFile, { tagName, attributeName })) {
      fail(`DouyinChannelAttributionSection must not own ${tagName} ${attributeName}`);
    }
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('DouyinChannelAttributionSection must render adapter-built summaryText');
  }
}

function assertLeafAdapterConsumesExternalContract() {
  const repoRoot = process.cwd();
  const leafAdapterPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-channel-leaf-adapter.ts';
  const { sourceFile } = parseWeeklyFile(repoRoot, leafAdapterPath);

  for (const identifierName of [
    'export interface DouyinChannelAttributionLeafPropsBundle',
    'interface BuildDouyinChannelAttributionLeafPropsInput',
    'DonutChartProps',
    'WaterfallChartProps',
    'DouyinSectionData',
    'DouyinChannelAttributionSectionProps',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`channel leaf adapter should consume external contracts instead of defining/importing section props: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-channel-section')) {
    fail('channel leaf adapter should not import section props from render component');
  }
  if (!hasImportSource(sourceFile, 'platform-tab-douyin-channel-leaf-contracts')) {
    fail('channel leaf adapter should import its leaf contracts');
  }
  for (const importedName of [
    'BuildDouyinChannelAttributionLeafPropsInput',
    'DouyinChannelAttributionLeafPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-douyin-channel-leaf-contracts',
      importedName,
    })) {
      fail(`channel leaf adapter missing external input contract: ${importedName}`);
    }
  }
  if (
    getFunctionParameterType(sourceFile, 'buildDouyinChannelAttributionLeafProps') !==
    'BuildDouyinChannelAttributionLeafPropsInput'
  ) {
    fail('channel leaf adapter missing external input contract');
  }
}

function assertChannelLeafProps(bundle, sourceProps) {
  assertKeys(
    bundle,
    ['donutChartProps', 'summaryText', 'waterfallChartProps'],
    'channel leaf adapter should return chart props and summary text',
  );

  assertKeys(
    bundle.donutChartProps,
    ['data', 'height', 'title', 'totalLabel'],
    'channel donut chart props should stay narrow',
  );
  assertEqual(
    bundle.donutChartProps.title,
    '渠道结构（外层本周 / 内层上周）',
    'channel donut should preserve title',
  );
  assertSame(
    bundle.donutChartProps.data,
    sourceProps.data.douyinChannelDonutData,
    'channel donut should preserve data reference',
  );
  assertEqual(bundle.donutChartProps.totalLabel, '渠道GMV', 'channel donut should preserve total label');
  assertEqual(bundle.donutChartProps.height, 360, 'channel donut should preserve height');
  assertNoOuterContextLeaks(bundle.donutChartProps);

  assertKeys(
    bundle.waterfallChartProps,
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
    'channel waterfall chart props should stay narrow',
  );
  assertEqual(
    bundle.waterfallChartProps.title,
    '渠道GMV增量瀑布（对比上周同期）',
    'channel waterfall should preserve title',
  );
  assertEqual(bundle.waterfallChartProps.startLabel, '上周同期', 'channel waterfall should preserve start label');
  assertEqual(bundle.waterfallChartProps.endLabel, '本周同期', 'channel waterfall should preserve end label');
  assertEqual(bundle.waterfallChartProps.startValue, sourceProps.data.douyinChannelTotalPrev, 'channel waterfall should preserve previous total');
  assertEqual(bundle.waterfallChartProps.endValue, sourceProps.data.douyinChannelTotalCurrent, 'channel waterfall should preserve current total');
  assertSame(bundle.waterfallChartProps.steps, sourceProps.data.douyinChannelWaterfallSteps, 'channel waterfall should preserve steps');
  assertEqual(bundle.waterfallChartProps.totalColor, sourceProps.waterfallTotalColor, 'channel waterfall should preserve total color');
  assertEqual(bundle.waterfallChartProps.showBoundaryTotals, false, 'channel waterfall should hide boundary totals');
  assertEqual(bundle.waterfallChartProps.height, 360, 'channel waterfall should preserve height');
  assertEqual(bundle.waterfallChartProps.gridBottomPx, 26, 'channel waterfall should preserve grid bottom');
  assertNoOuterContextLeaks(bundle.waterfallChartProps);

  assertEqual(
    bundle.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'channel leaf adapter should build attribution summary once',
  );
}

export async function runWeeklyDouyinChannelLeafAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    buildDouyinChannelAttributionLeafProps,
  } = await loadDouyinChannelLeafAdapter();

  assertChannelSectionIsRenderOnly();
  assertLeafAdapterConsumesExternalContract();

  const props = makeChannelProps();
  assertChannelLeafProps(
    buildDouyinChannelAttributionLeafProps(props),
    props,
  );

  const emptyDonutBundle = buildDouyinChannelAttributionLeafProps(
    makeChannelProps({ hasDouyinChannelData: false }),
  );
  assertEqual(emptyDonutBundle.donutChartProps, null, 'empty donut should not build chart props');
  assertEqual(
    emptyDonutBundle.waterfallChartProps !== null,
    true,
    'empty donut should not affect waterfall chart props',
  );

  const emptyWaterfallBundle = buildDouyinChannelAttributionLeafProps(
    makeChannelProps({ hasDouyinChannelContributionData: false }),
  );
  assertEqual(emptyWaterfallBundle.donutChartProps !== null, true, 'empty waterfall should not affect donut chart props');
  assertEqual(emptyWaterfallBundle.waterfallChartProps, null, 'empty waterfall should not build chart props');
}
