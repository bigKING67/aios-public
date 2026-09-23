/**
 * Weekly platform tab trend-section adapter behavior guard.
 *
 * Trend platform content should translate the wider tab view-model into the
 * narrow chart section contract in one place. This keeps PlatformTabTrendContent
 * render-only and prevents table/report props from leaking into chart sections.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  getInterfaceProperties,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithAttribute,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly platform tab trend-section adapter fixtures require guard assertions.');
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

async function loadPlatformTabTrendSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-platform-tab-trend-section-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-trend-section-adapter', [
      'buildPlatformTrendSectionProps',
      'PLATFORM_TREND_CHART_COLORS',
    ]),
  });
}

function makeTrendContentProps() {
  const chartData = {
    series: [
      { name: 'GMV', data: [1200, 1500, 1700] },
      { name: '订单', data: [24, 31, 36] },
    ],
    xAxis: ['4/26', '4/27', '4/28'],
  };
  const baseMetrics = {
    gmv: 1700,
    prevGmv: 1280,
    gmvDelta: 420,
  };

  return {
    platformLabel: '微信',
    viewModel: {
      chartData,
      hasChartData: true,
      baseMetrics,
      primaryMetrics: [{ key: 'gmv', value: '¥1,700' }],
    },
    columns: { marker: 'should-not-pass' },
    report: { marker: 'should-not-pass' },
  };
}

function parseWeeklyFile(repoRoot, relativePath) {
  return parseTsxFile(path.join(repoRoot, relativePath));
}

function assertSectionIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-trend-section.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, sectionPath);

  for (const attributeName of ['colors', 'height', 'showDataLabel', 'data']) {
    if (hasJsxElementWithAttribute(sourceFile, {
      tagName: 'LineChart',
      attributeName,
    })) {
      fail(`PlatformTrendSection must not own LineChart ${attributeName} directly`);
    }
  }

  for (const identifierName of ['chartData', 'hasChartData']) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`PlatformTrendSection must not consume raw trend view-model fields directly: ${identifierName}`);
    }
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'LineChart',
    spreadName: 'lineChartProps',
  })) {
    fail('PlatformTrendSection must consume adapter-built lineChartProps');
  }
  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('PlatformTrendSection must render adapter-built summaryText');
  }
}

function assertContentIsRenderOnly(repoRoot) {
  const contentPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-trend-content.tsx';
  const { sourceFile } = parseWeeklyFile(repoRoot, contentPath);

  if (hasImportSource(sourceFile, 'platform-tab-trend-section-adapter')) {
    fail('PlatformTabTrendContent must not import the trend section adapter');
  }
  if (hasIdentifier(sourceFile, 'buildPlatformTrendSectionProps')) {
    fail('PlatformTabTrendContent must not build trend section props');
  }
  if (hasIdentifier(sourceFile, 'TrendPlatformContentProps')) {
    fail('PlatformTabTrendContent must not depend on wider tab content props');
  }
  if (hasNamedImport(sourceFile, {
    sourceNeedle: './platform-trend-section',
    importedName: 'PlatformTrendSectionProps',
  })) {
    fail('PlatformTabTrendContent must not import render props from PlatformTrendSection');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-trend-section-contracts',
    importedName: 'PlatformTrendSectionPropsBundle',
  })) {
    fail('PlatformTabTrendContent missing render-ready contract import');
  }
  if (getFunctionParameterType(sourceFile, 'PlatformTabTrendContent') !== 'PlatformTrendSectionPropsBundle') {
    fail('PlatformTabTrendContent should accept PlatformTrendSectionPropsBundle directly');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'PlatformTrendSection',
    spreadName: 'props',
  })) {
    fail('PlatformTabTrendContent should render PlatformTrendSection with render-ready props');
  }
}

function assertTrendAdapterConsumesExternalContract(repoRoot) {
  const adapterPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-trend-section-adapter.ts';
  const { sourceFile } = parseWeeklyFile(repoRoot, adapterPath);

  if (getInterfaceProperties(sourceFile, 'BuildPlatformTrendSectionPropsParams')) {
    fail('trend section adapter should consume external contracts instead of defining params locally');
  }
  if (hasNamedImport(sourceFile, {
    sourceNeedle: '@/components',
    importedName: 'LineChartProps',
  })) {
    fail('trend section adapter should not import LineChartProps directly');
  }
  if (hasImportSource(sourceFile, './platform-trend-section')) {
    fail('trend section adapter should not import render props from PlatformTrendSection');
  }
  if (hasIdentifier(sourceFile, 'PlatformTrendSectionProps')) {
    fail('trend section adapter should not depend on PlatformTrendSectionProps directly');
  }
  for (const importedName of [
    'BuildPlatformTrendSectionPropsParams',
    'PlatformTrendSectionPropsBundle',
  ]) {
    if (!hasNamedImport(sourceFile, {
      sourceNeedle: 'platform-tab-trend-section-contracts',
      importedName,
    })) {
      fail(`trend section adapter missing external contract dependency: ${importedName}`);
    }
  }
}

function assertLineChartProps(lineChartProps, expectedChartData, expectedColors) {
  assertKeys(
    lineChartProps,
    ['colors', 'data', 'height', 'showDataLabel'],
    'line chart props should stay narrow and chart-specific',
  );
  assertSame(
    lineChartProps.data,
    expectedChartData,
    'line chart props should preserve chart data reference',
  );
  assertEqual(lineChartProps.height, 320, 'line chart height should stay stable');
  assertEqual(lineChartProps.showDataLabel, false, 'line chart data labels should stay disabled');
  assertEqual(
    lineChartProps.colors.join('|'),
    expectedColors.join('|'),
    'line chart colors should use platform trend token order',
  );
}

function assertTrendSectionAdapter(buildPlatformTrendSectionProps, expectedColors) {
  const trendContentProps = makeTrendContentProps();
  const sectionProps = buildPlatformTrendSectionProps(trendContentProps);

  assertKeys(
    sectionProps,
    ['lineChartProps', 'platformLabel', 'summaryText'],
    'trend section adapter should keep only PlatformTrendSection props',
  );
  assertEqual(sectionProps.platformLabel, '微信', 'adapter should preserve platform label');
  assertLineChartProps(
    sectionProps.lineChartProps,
    trendContentProps.viewModel.chartData,
    expectedColors,
  );
  assertEqual(
    sectionProps.summaryText,
    '上周同期：¥1,280 ｜ 本周 GMV：¥1,700 ｜ 增量：+¥420',
    'adapter should format the trend summary text from base metrics',
  );
  assertEqual('columns' in sectionProps, false, 'adapter should not pass table columns');
  assertEqual('report' in sectionProps, false, 'adapter should not pass report context');
  assertEqual('primaryMetrics' in sectionProps, false, 'adapter should not pass KPI metrics');
  assertEqual('viewModel' in sectionProps, false, 'adapter should not pass the whole view model');
  assertEqual('gmv' in sectionProps, false, 'adapter should not leak raw GMV after summary formatting');
  assertEqual('prevGmv' in sectionProps, false, 'adapter should not leak raw previous GMV after summary formatting');
  assertEqual('gmvDelta' in sectionProps, false, 'adapter should not leak raw GMV delta after summary formatting');
  assertEqual('chartData' in sectionProps, false, 'adapter should not pass raw chart data outside lineChartProps');
  assertEqual('hasChartData' in sectionProps, false, 'adapter should not pass raw chart availability');

  const emptyProps = buildPlatformTrendSectionProps({
    ...trendContentProps,
    viewModel: {
      ...trendContentProps.viewModel,
      hasChartData: false,
    },
  });
  assertEqual(emptyProps.lineChartProps, null, 'adapter should return null lineChartProps without chart data');
}

export async function runWeeklyPlatformTabTrendSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  assertSectionIsRenderOnly(repoRoot);
  assertContentIsRenderOnly(repoRoot);
  assertTrendAdapterConsumesExternalContract(repoRoot);

  const {
    buildPlatformTrendSectionProps,
    PLATFORM_TREND_CHART_COLORS,
  } = await loadPlatformTabTrendSectionAdapter();

  assertTrendSectionAdapter(buildPlatformTrendSectionProps, PLATFORM_TREND_CHART_COLORS);
}
