/**
 * Weekly overview KPI section adapter behavior guard.
 *
 * OverviewKpiSection should stay render-only. The adapter owns translating
 * canonical KPI view models into WeeklyKpiCard props, including the shared
 * trend class resolver and a narrow child-props contract.
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
    throw new Error('weekly overview KPI section adapter fixtures require guard assertions.');
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

async function loadOverviewKpiSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-kpi-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-kpi-section-adapter', [
      'buildOverviewKpiCardPropsList',
    ]),
  });
}

function makeKpi(overrides) {
  return {
    key: 'custom',
    label: 'Custom',
    value: 0,
    display_value: '',
    ...overrides,
  };
}

function makeFixtureKpis() {
  return [
    makeKpi({ key: 'orders', label: '订单数', display_value: '128', wow: -12.4, yoy: 0.4 }),
    makeKpi({ key: 'unknown_metric', label: '扩展指标', display_value: '47.2', wow: 1.2 }),
    makeKpi({ key: 'gsv', label: 'GSV', display_value: '¥760', wow: 0.4 }),
    makeKpi({
      key: 'GMV',
      label: 'GMV',
      display_value: '¥1,000',
      wow: 12.4,
      yoy: -0.4,
      report: { marker: 'should-not-pass' },
      columns: { marker: 'should-not-pass' },
      viewModel: { marker: 'should-not-pass' },
    }),
    makeKpi({ key: 'buyer', label: '成交用户', display_value: '96', wow: 0 }),
    makeKpi({ key: 'refund', label: '退款金额', display_value: '', wow: Number.NaN, yoy: undefined }),
    makeKpi({ key: 'arpu', label: '客单价', display_value: '¥10.42', wow: undefined, yoy: 10.6 }),
  ];
}

function assertNoCrossLeaks(cardProps) {
  assertEqual('kpi' in cardProps, false, 'card props should not pass raw KPI object');
  assertEqual('kpis' in cardProps, false, 'card props should not pass the whole KPI list');
  assertEqual('report' in cardProps, false, 'card props should not pass report context');
  assertEqual('columns' in cardProps, false, 'card props should not pass full column bundle');
  assertEqual('viewModel' in cardProps, false, 'card props should not pass view model');
  assertEqual('variant' in cardProps, false, 'overview KPI should rely on WeeklyKpiCard default variant');
}

function assertOverviewKpiCardProps(cardProps, expected, resolveTrendClassName) {
  assertKeys(
    cardProps,
    ['key', 'label', 'resolveTrendClassName', 'trends', 'value'],
    'overview KPI adapter should keep only WeeklyKpiCard props plus React key',
  );
  assertEqual(cardProps.key, expected.key, 'KPI card should preserve sorted key');
  assertEqual(cardProps.label, expected.label, 'KPI card should preserve label');
  assertEqual(cardProps.value, expected.value, 'KPI card should preserve display value');
  assertSame(
    cardProps.resolveTrendClassName,
    resolveTrendClassName,
    'KPI card should preserve trend class resolver reference',
  );
  assertEqual(cardProps.trends.length, 2, 'KPI card should expose WoW and YoY trend rows');
  assertEqual(cardProps.trends[0].key, 'wow', 'first KPI trend should be WoW');
  assertEqual(cardProps.trends[0].label, '环比（同期）', 'WoW trend label should stay stable');
  assertEqual(cardProps.trends[0].displayValue, expected.wowDisplayValue, 'WoW display should use overview formatter');
  assertEqual(cardProps.trends[1].key, 'yoy', 'second KPI trend should be YoY');
  assertEqual(cardProps.trends[1].label, '同比', 'YoY trend label should stay stable');
  assertEqual(cardProps.trends[1].displayValue, expected.yoyDisplayValue, 'YoY display should use overview formatter');
  assertNoCrossLeaks(cardProps);
}

function assertOverviewKpiSectionIsRenderOnly(repoRoot) {
  const sectionPath = 'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-section.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  if (hasImportSource(sourceFile, 'overview-kpi-data')) {
    fail('OverviewKpiSection must not import overview-kpi-data directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewKpiCardViewModels')) {
    fail('OverviewKpiSection must not build KPI view models directly');
  }
  if (hasIdentifier(sourceFile, 'buildOverviewKpiCardPropsList')) {
    fail('OverviewKpiSection must not call the adapter during render');
  }
  if (hasImportSource(sourceFile, 'overview-kpi-section-adapter')) {
    fail('OverviewKpiSection must not import the adapter directly');
  }

  for (const rawInputName of ['kpis', 'resolveTrendClassName']) {
    if (
      hasIdentifier(sourceFile, rawInputName)
      || hasFunctionObjectParameterBinding(sourceFile, 'OverviewKpiSection', rawInputName)
      || hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`OverviewKpiSection must not expose raw KPI input props: ${rawInputName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'overview-kpi-section-contracts',
    importedName: 'OverviewKpiSectionProps',
  })) {
    fail('OverviewKpiSection should import its render-ready props contract');
  }
  if (getFunctionParameterType(sourceFile, 'OverviewKpiSection') !== 'OverviewKpiSectionProps') {
    fail('OverviewKpiSection should use its render-ready props contract');
  }
  if (!hasFunctionObjectParameterBinding(sourceFile, 'OverviewKpiSection', 'kpiCardPropsList')) {
    fail('OverviewKpiSection should consume render-ready KPI card props');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyKpiCard',
    spreadName: 'kpiCardProps',
  })) {
    fail('OverviewKpiSection should pass render-ready KPI card props to WeeklyKpiCard');
  }
}

export async function runWeeklyOverviewKpiSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertOverviewKpiSectionIsRenderOnly(repoRoot);

  const {
    buildOverviewKpiCardPropsList,
  } = await loadOverviewKpiSectionAdapter();

  const resolveTrendClassName = (value) => (value > 0 ? 'up' : 'down');
  const cardPropsList = buildOverviewKpiCardPropsList({
    kpis: makeFixtureKpis(),
    resolveTrendClassName,
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  });

  assertEqual(
    cardPropsList.map((item) => item.key).join('>'),
    'GMV>gsv>refund>buyer>arpu>orders>unknown_metric',
    'overview KPI section adapter should preserve canonical KPI order',
  );
  assertOverviewKpiCardProps(
    cardPropsList[0],
    {
      key: 'GMV',
      label: 'GMV',
      value: '¥1,000',
      wowDisplayValue: '+12%',
      yoyDisplayValue: '0%',
    },
    resolveTrendClassName,
  );
  assertOverviewKpiCardProps(
    cardPropsList[2],
    {
      key: 'refund',
      label: '退款金额',
      value: '--',
      wowDisplayValue: '--',
      yoyDisplayValue: '--',
    },
    resolveTrendClassName,
  );
}
