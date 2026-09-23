/**
 * Weekly overview by-week trend section adapter behavior guard.
 *
 * OverviewByWeekTrendSection should stay render-only after the hook resolves
 * chart data/loading state. The adapter owns translating that hook result into
 * BarChart props or the empty-state description.
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
    throw new Error('weekly overview by-week trend section adapter fixtures require guard assertions.');
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

async function loadOverviewByWeekTrendSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-by-week-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-by-week-trend-section-adapter', [
      'buildOverviewByWeekTrendSectionProps',
      'OVERVIEW_BY_WEEK_TREND_BAR_COLORS',
    ]),
  });
}

function makeTrendData() {
  return [
    {
      name: '2026/3/29～2026/4/4',
      value: 900,
      secondaryValue: 810,
    },
    {
      name: '2026/4/5～2026/4/11',
      value: 1200,
      secondaryValue: 1000,
    },
  ];
}

function assertSectionIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-by-week-trend-section.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  if (hasIdentifier(sourceFile, 'byWeekBarData')) {
    fail('OverviewByWeekTrendSection must not own by-week chart visibility branching directly');
  }
  if (hasIdentifier(sourceFile, 'OVERVIEW_BY_WEEK_TREND_BAR_COLORS')) {
    fail('OverviewByWeekTrendSection must not own bar chart color wiring directly');
  }
  for (const attributeName of [
    'barColor',
    'data',
    'height',
    'loading',
    'primaryAxisName',
    'primarySeriesName',
    'secondaryBarColor',
    'secondarySeriesName',
    'showValueLabel',
    'singleAxis',
  ]) {
    if (hasJsxElementWithAttribute(sourceFile, {
      tagName: 'BarChart',
      attributeName,
    })) {
      fail(`OverviewByWeekTrendSection must not own BarChart props directly: ${attributeName}`);
    }
  }
  if (hasIdentifier(sourceFile, 'buildOverviewByWeekTrendSectionProps')) {
    fail('OverviewByWeekTrendSection must not call the adapter during render');
  }
  if (hasImportSource(sourceFile, 'overview-by-week-trend-section-adapter')) {
    fail('OverviewByWeekTrendSection must not import the adapter directly');
  }
  if (!hasIdentifier(sourceFile, 'useOverviewByWeekTrendSectionProps')) {
    fail('OverviewByWeekTrendSection should consume render-ready props from its hook wrapper');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'overview-by-week-trend-section-contracts',
    importedName: 'OverviewByWeekTrendSectionProps',
  })) {
    fail('OverviewByWeekTrendSection should import its input props contract');
  }
  if (getFunctionParameterType(sourceFile, 'OverviewByWeekTrendSection') !== 'OverviewByWeekTrendSectionProps') {
    fail('OverviewByWeekTrendSection should use its input props contract');
  }

  if (!hasFunctionObjectParameterBinding(sourceFile, 'OverviewByWeekTrendSection', 'summaryWeekPeriod')) {
    fail('OverviewByWeekTrendSection should consume its summaryWeekPeriod input prop');
  }
  for (const propName of ['barChartProps', 'emptyStateDescription']) {
    if (!hasIdentifier(sourceFile, propName)) {
      fail(`OverviewByWeekTrendSection should consume render-ready prop: ${propName}`);
    }
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'BarChart',
    spreadName: 'barChartProps',
  })) {
    fail('OverviewByWeekTrendSection should pass render-ready barChartProps');
  }
  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyTextEmptyState',
    attributeName: 'description',
    expressionText: "emptyStateDescription ?? ''",
  })) {
    fail('OverviewByWeekTrendSection should render adapter-provided empty state description');
  }
}

function assertNoCrossLeaks(propsBundle) {
  assertEqual('byWeekBarData' in propsBundle, false, 'props bundle should not pass raw hook data at top level');
  assertEqual('byWeekLoading' in propsBundle, false, 'props bundle should not pass raw hook loading state at top level');
  assertEqual('hookResult' in propsBundle, false, 'props bundle should not pass full hook result');
}

function assertBarChartProps(barChartProps, data, colors, loading) {
  assertKeys(
    barChartProps,
    [
      'barColor',
      'data',
      'height',
      'loading',
      'primaryAxisName',
      'primarySeriesName',
      'secondaryBarColor',
      'secondarySeriesName',
      'showValueLabel',
      'singleAxis',
    ],
    'bar chart props should stay narrow and chart-specific',
  );
  assertSame(barChartProps.data, data, 'bar chart props should preserve hook data reference');
  assertEqual(barChartProps.barColor, colors.primary, 'primary bar color should use by-week token');
  assertEqual(barChartProps.secondaryBarColor, colors.secondary, 'secondary bar color should use by-week token');
  assertEqual(barChartProps.primarySeriesName, 'GMV', 'primary series name should stay stable');
  assertEqual(barChartProps.secondarySeriesName, 'GSV', 'secondary series name should stay stable');
  assertEqual(barChartProps.primaryAxisName, '金额', 'primary axis name should stay stable');
  assertEqual(barChartProps.showValueLabel, false, 'by-week labels should stay hidden');
  assertEqual(barChartProps.height, 320, 'by-week chart height should stay stable');
  assertEqual(barChartProps.loading, loading, 'bar chart loading should reflect hook loading state');
  assertEqual(barChartProps.singleAxis, true, 'by-week chart should stay single-axis');
}

export async function runWeeklyOverviewByWeekTrendSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  assertSectionIsRenderOnly(repoRoot);

  const {
    buildOverviewByWeekTrendSectionProps,
    OVERVIEW_BY_WEEK_TREND_BAR_COLORS,
  } = await loadOverviewByWeekTrendSectionAdapter();

  const data = makeTrendData();
  const dataPropsBundle = buildOverviewByWeekTrendSectionProps({
    byWeekBarData: data,
    byWeekLoading: false,
  });

  assertKeys(
    dataPropsBundle,
    ['barChartProps', 'emptyStateDescription'],
    'by-week adapter should expose only chart props or empty description',
  );
  assertNoCrossLeaks(dataPropsBundle);
  assertEqual(dataPropsBundle.emptyStateDescription, null, 'non-empty data should suppress empty state');
  assertBarChartProps(
    dataPropsBundle.barChartProps,
    data,
    OVERVIEW_BY_WEEK_TREND_BAR_COLORS,
    false,
  );

  const loadingData = [];
  const loadingPropsBundle = buildOverviewByWeekTrendSectionProps({
    byWeekBarData: loadingData,
    byWeekLoading: true,
  });

  assertEqual(loadingPropsBundle.emptyStateDescription, null, 'loading state should suppress empty state');
  assertBarChartProps(
    loadingPropsBundle.barChartProps,
    loadingData,
    OVERVIEW_BY_WEEK_TREND_BAR_COLORS,
    true,
  );

  const emptyPropsBundle = buildOverviewByWeekTrendSectionProps({
    byWeekBarData: [],
    byWeekLoading: false,
  });

  assertEqual(emptyPropsBundle.barChartProps, null, 'empty non-loading state should not render BarChart');
  assertEqual(
    emptyPropsBundle.emptyStateDescription,
    '暂无近5周 GMV/GSV 数据',
    'empty state copy should stay stable',
  );
}
