/**
 * Weekly platform tab KPI section adapter behavior guard.
 *
 * PlatformKpiSection should stay render-only. The adapter owns translating
 * PlatformMetricCard rows into WeeklyKpiCard contracts, including the stable
 * platform variant and placeholder YoY trend row.
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
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly platform KPI section adapter fixtures require guard assertions.');
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

async function loadPlatformKpiSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-platform-kpi-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-kpi-section-adapter', [
      'buildPlatformKpiCardPropsList',
    ]),
  });
}

function assertPlatformKpiSectionIsRenderOnly(repoRoot) {
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-kpi-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-kpi-section-adapter')) {
    fail('PlatformKpiSection must not import the adapter directly');
  }
  if (hasIdentifier(sourceFile, 'buildPlatformKpiCardPropsList')) {
    fail('PlatformKpiSection must not call the adapter during render');
  }
  if (hasImportSource(sourceFile, 'platform-tab-metrics')) {
    fail('PlatformKpiSection must not expose raw metric input props');
  }
  for (const rawInputName of ['metrics', 'resolveTrendClassName']) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(sourceFile, 'PlatformKpiSection', rawInputName)
    ) {
      fail(`PlatformKpiSection should consume render-ready card props only: ${rawInputName}`);
    }
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-kpi-section-contracts',
    importedName: 'PlatformKpiSectionProps',
  })) {
    fail('PlatformKpiSection should import its render-ready props contract');
  }
  if (getFunctionParameterType(sourceFile, 'PlatformKpiSection') !== 'PlatformKpiSectionProps') {
    fail('PlatformKpiSection should keep its render-ready props contract');
  }
  if (!hasFunctionObjectParameterBinding(sourceFile, 'PlatformKpiSection', 'kpiCardPropsList')) {
    fail('PlatformKpiSection should consume render-ready KPI card props');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyKpiCard',
    spreadName: 'kpiCardProps',
  })) {
    fail('PlatformKpiSection should render adapter-provided KPI card props');
  }
}

function makeMetrics() {
  return [
    {
      key: 'gmv',
      label: 'GMV',
      value: '¥1,700',
      wow: 12.5,
    },
    {
      key: 'orders',
      label: '订单',
      value: '42',
      wow: undefined,
      report: { marker: 'should-not-pass' },
      columns: { marker: 'should-not-pass' },
      viewModel: { marker: 'should-not-pass' },
    },
  ];
}

function assertNoCrossLeaks(cardProps) {
  assertEqual('metric' in cardProps, false, 'card props should not pass raw metric object');
  assertEqual('metrics' in cardProps, false, 'card props should not pass the whole metrics list');
  assertEqual('report' in cardProps, false, 'card props should not pass report context');
  assertEqual('columns' in cardProps, false, 'card props should not pass full column bundle');
  assertEqual('viewModel' in cardProps, false, 'card props should not pass view model');
}

function assertKpiCardProps(cardProps, metric, resolveTrendClassName) {
  assertKeys(
    cardProps,
    ['key', 'label', 'resolveTrendClassName', 'trends', 'value', 'variant'],
    'platform KPI adapter should keep only WeeklyKpiCard props plus React key',
  );
  assertEqual(cardProps.key, metric.key, 'KPI card should preserve metric key');
  assertEqual(cardProps.label, metric.label, 'KPI card should preserve metric label');
  assertEqual(cardProps.value, metric.value, 'KPI card should preserve display value');
  assertEqual(cardProps.variant, 'platform', 'KPI card should use platform variant');
  assertSame(
    cardProps.resolveTrendClassName,
    resolveTrendClassName,
    'KPI card should preserve trend class resolver reference',
  );
  assertEqual(cardProps.trends.length, 2, 'KPI card should expose WoW and YoY trend rows');
  assertEqual(cardProps.trends[0].key, 'wow', 'first KPI trend should be WoW');
  assertEqual(cardProps.trends[0].label, '环比（同期）', 'WoW trend label should stay stable');
  assertEqual(cardProps.trends[0].value, metric.wow, 'WoW trend should map metric wow value');
  assertEqual(cardProps.trends[1].key, 'yoy', 'second KPI trend should be YoY');
  assertEqual(cardProps.trends[1].label, '同比', 'YoY trend label should stay stable');
  assertEqual(cardProps.trends[1].displayValue, '--', 'platform KPI YoY trend should use placeholder display');
  assertNoCrossLeaks(cardProps);
}

export async function runWeeklyPlatformKpiSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  assertPlatformKpiSectionIsRenderOnly(repoRoot);

  const {
    buildPlatformKpiCardPropsList,
  } = await loadPlatformKpiSectionAdapter();

  const metrics = makeMetrics();
  const resolveTrendClassName = (value) => (value > 0 ? 'up' : 'down');
  const cardPropsList = buildPlatformKpiCardPropsList({
    metrics,
    resolveTrendClassName,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  });

  assertEqual(cardPropsList.length, 2, 'adapter should build one card props bundle per KPI metric');
  assertKpiCardProps(cardPropsList[0], metrics[0], resolveTrendClassName);
  assertKpiCardProps(cardPropsList[1], metrics[1], resolveTrendClassName);
}
