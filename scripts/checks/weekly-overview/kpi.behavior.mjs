#!/usr/bin/env node

/**
 * Weekly overview KPI behavior guard.
 *
 * The overview KPI cards are the first metric surface in the weekly report.
 * Keep card ordering, display fallbacks, and WoW/YoY trend formatting explicit
 * so view-model refactors do not silently change the top-level summary cards.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-overview-kpi-behavior';
const {
  assertEqual,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadOverviewKpiData() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-kpi-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-kpi-data', [
      'buildOverviewKpiCardViewModels',
      'formatOverviewTrendPercent',
      'sortOverviewKpis',
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
    makeKpi({ key: 'GMV', label: 'GMV', display_value: '¥1,000', wow: 12.4, yoy: -0.4 }),
    makeKpi({ key: 'buyer', label: '成交用户', display_value: '96', wow: 0 }),
    makeKpi({ key: 'refund', label: '退款金额', display_value: '', wow: Number.NaN, yoy: undefined }),
    makeKpi({ key: 'arpu', label: '客单价', display_value: '¥10.42', wow: undefined, yoy: 10.6 }),
  ];
}

function assertTrendPercentBehavior(formatOverviewTrendPercent) {
  assertEqual(formatOverviewTrendPercent(undefined), '--', 'missing trend should render --');
  assertEqual(formatOverviewTrendPercent(Number.NaN), '--', 'non-finite trend should render --');
  assertEqual(formatOverviewTrendPercent(0.4), '0%', 'rounded zero should render without sign');
  assertEqual(formatOverviewTrendPercent(12.4), '+12%', 'positive trend should render rounded percent with plus sign');
  assertEqual(formatOverviewTrendPercent(-12.6), '-13%', 'negative trend should render rounded percent with minus sign');
}

function assertSortBehavior(sortOverviewKpis) {
  const sorted = sortOverviewKpis(makeFixtureKpis());

  assertEqual(
    sorted.map((item) => item.key).join('>'),
    'GMV>gsv>refund>buyer>arpu>orders>unknown_metric',
    'overview KPI cards should keep canonical order and append unknown metrics',
  );
}

function assertCardViewModelBehavior(buildOverviewKpiCardViewModels) {
  const cards = buildOverviewKpiCardViewModels(makeFixtureKpis());

  assertEqual(
    cards.map((item) => item.key).join('>'),
    'GMV>gsv>refund>buyer>arpu>orders>unknown_metric',
    'card view-model should preserve sorted order',
  );
  assertEqual(cards[0].label, 'GMV', 'card view-model should preserve labels');
  assertEqual(cards[0].value, '¥1,000', 'card view-model should preserve display_value');
  assertEqual(cards.find((item) => item.key === 'refund')?.value, '--', 'missing display_value should fall back to --');

  const gmvTrends = cards[0].trends;
  assertEqual(gmvTrends.length, 2, 'card view-model should expose WoW and YoY trend rows');
  assertEqual(gmvTrends[0].key, 'wow', 'first trend row should be WoW');
  assertEqual(gmvTrends[0].displayValue, '+12%', 'WoW display value should use overview percent formatter');
  assertEqual(gmvTrends[1].key, 'yoy', 'second trend row should be YoY');
  assertEqual(gmvTrends[1].displayValue, '0%', 'YoY rounded zero should render without sign');

  const refundTrends = cards.find((item) => item.key === 'refund')?.trends ?? [];
  assertEqual(refundTrends[0].value, undefined, 'non-finite WoW should be removed from trend value');
  assertEqual(refundTrends[0].displayValue, '--', 'non-finite WoW should render --');
}

async function main() {
  const {
    buildOverviewKpiCardViewModels,
    formatOverviewTrendPercent,
    sortOverviewKpis,
  } = await loadOverviewKpiData();

  assertTrendPercentBehavior(formatOverviewTrendPercent);
  assertSortBehavior(sortOverviewKpis);
  assertCardViewModelBehavior(buildOverviewKpiCardViewModels);

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
