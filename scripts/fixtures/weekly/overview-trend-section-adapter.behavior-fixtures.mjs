/**
 * Weekly overview trend section adapter behavior guard.
 *
 * OverviewTrendSection should stay render-only. The adapter owns translating
 * the GMV trend view model into LineChart props, including stable chart
 * colors, height, and label visibility.
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
    throw new Error('weekly overview trend section adapter fixtures require guard assertions.');
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

async function loadOverviewTrendSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-trend-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-trend-section-adapter', [
      'buildOverviewTrendSectionProps',
      'OVERVIEW_TREND_CHART_COLORS',
    ]),
  });
}

function makePoint(date, value) {
  return {
    date,
    value,
  };
}

function makeReport(trend7d, periodStart = '2026-04-25') {
  return {
    meta: {
      period_start: periodStart,
    },
    charts: {
      trend_7d: trend7d,
    },
  };
}

function makeCurrentPoints() {
  return [
    makePoint('2026-04-25', 100),
    makePoint('2026-04-26', 120),
    makePoint('2026-04-27', 90),
    makePoint('2026-04-28', 130),
    makePoint('2026-04-29', 150),
    makePoint('2026-04-30', 140),
    makePoint('2026-05-01', 180),
  ];
}

function makePreviousPoints() {
  return [
    makePoint('2026-04-18', 80),
    makePoint('2026-04-19', 110),
    makePoint('2026-04-20', 70),
    makePoint('2026-04-21', 100),
    makePoint('2026-04-22', 125),
    makePoint('2026-04-23', 118),
    makePoint('2026-04-24', 160),
  ];
}

function assertSectionIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-section.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  if (hasImportSource(sourceFile, 'overview-trend-data')) {
    fail('OverviewTrendSection must not import overview-trend-data directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewTrendChartData')) {
    fail('OverviewTrendSection must not build trend chart data directly');
  }
  if (hasIdentifier(sourceFile, 'OVERVIEW_TREND_CHART_COLORS')) {
    fail('OverviewTrendSection must not own chart color wiring directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewTrendSectionProps')) {
    fail('OverviewTrendSection must not call the adapter during render');
  }
  if (hasImportSource(sourceFile, 'overview-trend-section-adapter')) {
    fail('OverviewTrendSection must not import the adapter directly');
  }

  for (const rawInputName of ['report', 'chartData', 'trendSeries']) {
    if (
      hasIdentifier(sourceFile, rawInputName)
      || hasFunctionObjectParameterBinding(sourceFile, 'OverviewTrendSection', rawInputName)
      || hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`OverviewTrendSection must not expose raw input props: ${rawInputName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'overview-trend-section-contracts',
    importedName: 'OverviewTrendSectionPropsBundle',
  })) {
    fail('OverviewTrendSection should import its render-ready props contract');
  }
  if (getFunctionParameterType(sourceFile, 'OverviewTrendSection') !== 'OverviewTrendSectionPropsBundle') {
    fail('OverviewTrendSection should use its render-ready props contract');
  }
  if (!hasFunctionObjectParameterBinding(sourceFile, 'OverviewTrendSection', 'lineChartProps')) {
    fail('OverviewTrendSection should consume render-ready line chart props');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'LineChart',
    spreadName: 'lineChartProps',
  })) {
    fail('OverviewTrendSection should pass render-ready lineChartProps');
  }
}

function assertNoCrossLeaks(propsBundle) {
  assertEqual('report' in propsBundle, false, 'props bundle should not pass report context');
  assertEqual('chartData' in propsBundle, false, 'props bundle should not pass raw chart data outside lineChartProps');
  assertEqual('trendSeries' in propsBundle, false, 'props bundle should not pass raw trend series');
}

function assertLineChartProps(lineChartProps, expectedColors) {
  assertKeys(
    lineChartProps,
    ['colors', 'data', 'height', 'showDataLabel'],
    'line chart props should stay narrow and chart-specific',
  );
  assertEqual(lineChartProps.height, 320, 'line chart height should stay stable');
  assertEqual(lineChartProps.showDataLabel, true, 'line chart data labels should stay enabled');
  assertEqual(
    lineChartProps.colors.join('|'),
    expectedColors.join('|'),
    'line chart colors should use overview trend token order',
  );
  assertEqual(lineChartProps.data.series.length, 2, 'line chart data should keep current and previous series');
  assertEqual(lineChartProps.data.series[0]?.name, '本周', 'current series name should stay stable');
  assertEqual(lineChartProps.data.series[1]?.name, '上周', 'previous series name should stay stable');
  assertEqual(
    lineChartProps.data.series[0]?.data.join(','),
    '100,120,90,130,150,140,180',
    'current series data should be preserved',
  );
  assertEqual(
    lineChartProps.data.series[1]?.data.join(','),
    '80,110,70,100,125,118,160',
    'previous series data should be preserved',
  );
  assertEqual(
    lineChartProps.data.xAxis.join('>'),
    '周六>周日>周一>周二>周三>周四>周五',
    'xAxis labels should stay stable',
  );
}

export async function runWeeklyOverviewTrendSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionIsRenderOnly(repoRoot);

  const {
    buildOverviewTrendSectionProps,
    OVERVIEW_TREND_CHART_COLORS,
  } = await loadOverviewTrendSectionAdapter();

  const propsBundle = buildOverviewTrendSectionProps(
    makeReport([
      { metric: 'gmv', points: makeCurrentPoints() },
      { metric: 'gmv_prev_week', points: makePreviousPoints() },
    ]),
  );

  assertKeys(
    propsBundle,
    ['lineChartProps'],
    'overview trend section adapter should expose only line chart props',
  );
  assertNoCrossLeaks(propsBundle);
  assertLineChartProps(propsBundle.lineChartProps, OVERVIEW_TREND_CHART_COLORS);

  const emptyPropsBundle = buildOverviewTrendSectionProps(
    makeReport([{ metric: 'gsv', points: makeCurrentPoints() }]),
  );
  assertEqual(
    emptyPropsBundle.lineChartProps,
    null,
    'adapter should return null lineChartProps when overview trend data is unavailable',
  );
}
