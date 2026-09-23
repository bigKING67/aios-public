/**
 * Weekly overview platform breakdown section adapter behavior guard.
 *
 * OverviewPlatformBreakdownSection should stay render-only. The adapter owns
 * translating the platform view model into DonutChart/WaterfallChart props and
 * keeping chart titles, dimensions, totals, and summary text stable.
 */

import path from 'node:path';
import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithExpressionChild,
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
    throw new Error('weekly overview platform breakdown section adapter fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertKeys(...args) {
  currentAssertions().assertKeys(...args);
}

function fail(...args) {
  currentAssertions().fail(...args);
}

async function loadOverviewPlatformBreakdownSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-platform-adapter-',
    entrySource: [
      createWeeklyTabsEntrySource(repoRoot, 'overview-platform-breakdown-section-adapter', [
        'buildOverviewPlatformBreakdownSectionProps',
      ]),
      createWeeklyTabsEntrySource(repoRoot, 'overview-platform-breakdown-data', [
        'OVERVIEW_PLATFORM_TOTAL_BAR_COLOR',
      ]),
      `export { PLATFORM_LEGEND_COLORS } from ${JSON.stringify(path.join(repoRoot, 'apps/web-vite/src/lib/platform-colors'))};`,
      '',
    ],
  });
}

function makeCharts(platforms) {
  return {
    platforms,
  };
}

function assertNoCrossLeaks(propsBundle) {
  assertEqual('report' in propsBundle, false, 'props bundle should not pass report context');
  assertEqual('charts' in propsBundle, false, 'props bundle should not pass raw charts context');
  assertEqual('platformViewModel' in propsBundle, false, 'props bundle should not pass full view model');
  assertEqual('breakdown' in propsBundle, false, 'props bundle should not pass raw breakdown rows');
}

function assertSectionIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-platform-breakdown-section.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  if (hasImportSource(sourceFile, 'overview-platform-breakdown-data')) {
    fail('OverviewPlatformBreakdownSection must not import overview-platform-breakdown-data directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewPlatformBreakdownViewModel')) {
    fail('OverviewPlatformBreakdownSection must not build platform breakdown view models directly');
  }
  if (hasIdentifier(sourceFile, 'OVERVIEW_PLATFORM_TOTAL_BAR_COLOR')) {
    fail('OverviewPlatformBreakdownSection must not own chart color wiring directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewPlatformBreakdownSectionProps')) {
    fail('OverviewPlatformBreakdownSection must not call the adapter during render');
  }
  if (hasImportSource(sourceFile, 'overview-platform-breakdown-section-adapter')) {
    fail('OverviewPlatformBreakdownSection must not import the adapter directly');
  }

  for (const rawInputName of ['report', 'charts', 'platformViewModel', 'breakdown']) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(
        sourceFile,
        'OverviewPlatformBreakdownSection',
        rawInputName,
      ) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`OverviewPlatformBreakdownSection must not expose raw input props: ${rawInputName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'overview-platform-breakdown-section-contracts',
    importedName: 'OverviewPlatformBreakdownSectionPropsBundle',
  })) {
    fail('OverviewPlatformBreakdownSection should import its render-ready props contract');
  }
  if (
    getFunctionParameterType(sourceFile, 'OverviewPlatformBreakdownSection') !==
    'OverviewPlatformBreakdownSectionPropsBundle'
  ) {
    fail('OverviewPlatformBreakdownSection should use its render-ready props contract');
  }

  for (const propName of ['donutChartProps', 'waterfallChartProps', 'summaryText']) {
    if (!hasFunctionObjectParameterBinding(
      sourceFile,
      'OverviewPlatformBreakdownSection',
      propName,
    )) {
      fail(`OverviewPlatformBreakdownSection should consume render-ready prop: ${propName}`);
    }
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DonutChart',
    spreadName: 'donutChartProps',
  })) {
    fail('OverviewPlatformBreakdownSection should pass render-ready donutChartProps');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WaterfallChart',
    spreadName: 'waterfallChartProps',
  })) {
    fail('OverviewPlatformBreakdownSection should pass render-ready waterfallChartProps');
  }
  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('OverviewPlatformBreakdownSection should render adapter-provided summaryText');
  }
}

function assertDonutChartProps(donutChartProps, platformLegendColors) {
  assertKeys(
    donutChartProps,
    ['data', 'height', 'title', 'totalLabel'],
    'donut chart props should stay narrow and chart-specific',
  );
  assertEqual(
    donutChartProps.title,
    '平台贡献分布（外圈本周 / 内圈上周）',
    'donut chart title should stay stable',
  );
  assertEqual(donutChartProps.totalLabel, '本周同期GMV', 'donut chart total label should stay stable');
  assertEqual(donutChartProps.height, 360, 'donut chart height should stay stable');
  assertEqual(
    donutChartProps.data.map((item) => `${item.name}:${item.value}:${item.prevValue}:${item.color}`).join('|'),
    [
      `天猫:120:100:${platformLegendColors.tmall}`,
      `抖音:220:160:${platformLegendColors.douyin}`,
      `小红书:80:100:${platformLegendColors.xiaohongshu}`,
      `微信:50:60:${platformLegendColors.wechat}`,
      `京东:30:25:${platformLegendColors.jd}`,
    ].join('|'),
    'donut chart data should preserve canonical platform totals and colors',
  );
}

function assertWaterfallChartProps(waterfallChartProps, totalColor, platformLegendColors) {
  assertKeys(
    waterfallChartProps,
    [
      'endLabel',
      'endValue',
      'height',
      'showBoundaryTotals',
      'startLabel',
      'startValue',
      'steps',
      'title',
      'totalColor',
    ],
    'waterfall chart props should stay narrow and chart-specific',
  );
  assertEqual(
    waterfallChartProps.title,
    '平台增量瀑布（对比上周同期）',
    'waterfall chart title should stay stable',
  );
  assertEqual(waterfallChartProps.startLabel, '上周同期', 'waterfall start label should stay stable');
  assertEqual(waterfallChartProps.endLabel, '本周同期', 'waterfall end label should stay stable');
  assertEqual(waterfallChartProps.startValue, 445, 'waterfall start value should use previous total');
  assertEqual(waterfallChartProps.endValue, 500, 'waterfall end value should use current total');
  assertEqual(waterfallChartProps.totalColor, totalColor, 'waterfall total color should use overview token');
  assertEqual(waterfallChartProps.showBoundaryTotals, false, 'waterfall should hide boundary totals in overview section');
  assertEqual(waterfallChartProps.height, 360, 'waterfall chart height should stay stable');
  assertEqual(
    waterfallChartProps.steps.map((item) => `${item.name}:${item.delta}:${item.current}:${item.prev}:${item.share}:${item.color}`).join('|'),
    [
      `天猫:20:120:100:36.36363636363637:${platformLegendColors.tmall}`,
      `抖音:60:220:160:109.09090909090908:${platformLegendColors.douyin}`,
      `小红书:-20:80:100:-36.36363636363637:${platformLegendColors.xiaohongshu}`,
      `微信:-10:50:60:-18.181818181818183:${platformLegendColors.wechat}`,
      `京东:5:30:25:9.090909090909092:${platformLegendColors.jd}`,
    ].join('|'),
    'waterfall steps should preserve platform deltas, shares, and colors',
  );
}

export async function runWeeklyOverviewPlatformBreakdownSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  assertSectionIsRenderOnly(repoRoot);

  const {
    buildOverviewPlatformBreakdownSectionProps,
    OVERVIEW_PLATFORM_TOTAL_BAR_COLOR,
    PLATFORM_LEGEND_COLORS,
  } = await loadOverviewPlatformBreakdownSectionAdapter();

  const propsBundle = buildOverviewPlatformBreakdownSectionProps({
    charts: makeCharts([
      { platform: 'tmall', gmv: 120, prev_gmv: 100 },
      { platform: 'douyin', gmv: 220, prev_gmv: 160 },
      { platform: 'xhs', gmv: 80, prev_gmv: 100 },
      { platform: 'wechat', gmv: 50, prev_gmv: 60 },
      { platform: 'jd', gmv: 30, prev_gmv: 25 },
    ]),
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  });

  assertKeys(
    propsBundle,
    ['donutChartProps', 'summaryText', 'waterfallChartProps'],
    'overview platform section adapter should expose only leaf props and summary',
  );
  assertNoCrossLeaks(propsBundle);
  assertDonutChartProps(propsBundle.donutChartProps, PLATFORM_LEGEND_COLORS);
  assertWaterfallChartProps(
    propsBundle.waterfallChartProps,
    OVERVIEW_PLATFORM_TOTAL_BAR_COLOR,
    PLATFORM_LEGEND_COLORS,
  );
  assertEqual(
    propsBundle.summaryText,
    '上周同期：¥445 ｜ 本周同期：¥500 ｜ 总增量：+¥55',
    'summary text should use shared period delta formatter',
  );
}
