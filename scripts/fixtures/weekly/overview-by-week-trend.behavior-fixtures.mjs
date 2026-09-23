/**
 * Weekly overview by-week trend behavior guard.
 *
 * This section fetches recent weekly reports in period order and converts KPI
 * rows into the visible GMV/GSV comparison chart. Keep period anchoring and GSV
 * fallback rules explicit so chart-data refactors do not change user-facing
 * trend points.
 */

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
    throw new Error('weekly overview by-week trend fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

async function loadOverviewByWeekTrendData() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-trend-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-by-week-trend-data', [
      'buildOverviewByWeekTrendData',
      'resolveOverviewByWeekTrendLoadingState',
      'resolveOverviewByWeekReportMetrics',
      'resolveRecentWeekPeriods',
    ]),
  });
}

function makePeriod(value) {
  return {
    value,
    label: value.replace('~', ' ~ '),
  };
}

function makeReport(kpis) {
  return {
    kpis,
  };
}

function makeKpi(key, value) {
  return {
    key,
    value,
  };
}

function assertRecentWeekPeriodsBehavior(resolveRecentWeekPeriods) {
  const periods = [
    makePeriod('2026/4/26~2026/5/2'),
    makePeriod('2026/4/19~2026/4/25'),
    makePeriod('2026/4/12~2026/4/18'),
    makePeriod('2026/4/5~2026/4/11'),
    makePeriod('2026/3/29~2026/4/4'),
    makePeriod('2026/3/22~2026/3/28'),
  ];

  assertEqual(
    resolveRecentWeekPeriods(periods, '2026/4/19~2026/4/25').join('>'),
    '2026/3/22~2026/3/28>2026/3/29~2026/4/4>2026/4/5~2026/4/11>2026/4/12~2026/4/18>2026/4/19~2026/4/25',
    'summary week should anchor a five-week window and return chart order from oldest to newest',
  );
  assertEqual(
    resolveRecentWeekPeriods(periods, '2026/1/1~2026/1/7').join('>'),
    '2026/3/29~2026/4/4>2026/4/5~2026/4/11>2026/4/12~2026/4/18>2026/4/19~2026/4/25>2026/4/26~2026/5/2',
    'missing summary week should fall back to the first period as anchor',
  );
  assertEqual(
    resolveRecentWeekPeriods([
      makePeriod('invalid'),
      makePeriod('2026/4/26～2026/5/2'),
      makePeriod('2026/4/19 ~ 2026/4/25'),
    ]).join('>'),
    '2026/4/19~2026/4/25>2026/4/26~2026/5/2',
    'period resolver should normalize full-width tilde and whitespace while dropping invalid periods',
  );
}

function assertReportMetricBehavior(resolveOverviewByWeekReportMetrics) {
  const explicitMetrics = resolveOverviewByWeekReportMetrics(makeReport([
    makeKpi('GMV', '1000'),
    makeKpi('GSV', 860),
    makeKpi('refund', 300),
  ]));

  assertEqual(explicitMetrics?.gmv, 1000, 'GMV KPI should be parsed case-insensitively');
  assertEqual(explicitMetrics?.gsv, 860, 'explicit GSV should take priority over refund fallback');

  const fallbackMetrics = resolveOverviewByWeekReportMetrics(makeReport([
    makeKpi('gmv', 1000),
    makeKpi('refund', 120),
  ]));

  assertEqual(fallbackMetrics?.gsv, 880, 'missing GSV should fall back to GMV minus refund');
  assertEqual(
    resolveOverviewByWeekReportMetrics(makeReport([makeKpi('gmv', 1000)])),
    undefined,
    'report without GSV or refund should be skipped',
  );
  assertEqual(
    resolveOverviewByWeekReportMetrics(makeReport([makeKpi('gsv', 900), makeKpi('refund', 100)])),
    undefined,
    'report without valid GMV should be skipped',
  );
}

function assertTrendDataBehavior(buildOverviewByWeekTrendData) {
  const trendData = buildOverviewByWeekTrendData(
    ['2026/3/29~2026/4/4', '2026/4/5~2026/4/11', '2026/4/12~2026/4/18'],
    [
      makeReport([makeKpi('gmv', 900), makeKpi('refund', 90)]),
      undefined,
      makeReport([makeKpi('gmv', 1200), makeKpi('gsv', 1000)]),
    ],
  );

  assertEqual(trendData.length, 2, 'trend builder should skip missing or incomplete reports');
  assertEqual(trendData[0].name, '2026/3/29～2026/4/4', 'trend builder should format period label with full-width tilde');
  assertEqual(trendData[0].value, 900, 'trend builder should expose GMV as primary value');
  assertEqual(trendData[0].secondaryValue, 810, 'trend builder should expose resolved GSV as secondary value');
  assertEqual(trendData[1].name, '2026/4/12～2026/4/18', 'trend builder should preserve recent period/report index pairing');
}

function assertLoadingStateBehavior(resolveOverviewByWeekTrendLoadingState) {
  assertEqual(
    resolveOverviewByWeekTrendLoadingState({
      hasPeriodListLoading: true,
      queryStates: [],
      trendDataLength: 0,
    }),
    true,
    'period-list loading should keep by-week chart in loading state before recent periods resolve',
  );
  assertEqual(
    resolveOverviewByWeekTrendLoadingState({
      hasPeriodListLoading: false,
      queryStates: [{ isLoading: true }],
      trendDataLength: 0,
    }),
    true,
    'detail query loading should keep by-week chart in loading state before chart data exists',
  );
  assertEqual(
    resolveOverviewByWeekTrendLoadingState({
      hasPeriodListLoading: false,
      queryStates: [{ isFetching: true }],
      trendDataLength: 0,
    }),
    true,
    'detail query fetching should keep by-week chart in loading state before chart data exists',
  );
  assertEqual(
    resolveOverviewByWeekTrendLoadingState({
      hasPeriodListLoading: true,
      queryStates: [{ isFetching: true }],
      trendDataLength: 2,
    }),
    false,
    'existing chart data should prevent loading state from replacing visible data',
  );
  assertEqual(
    resolveOverviewByWeekTrendLoadingState({
      hasPeriodListLoading: false,
      queryStates: [],
      trendDataLength: 0,
    }),
    false,
    'no period loading, no detail loading, and no data should allow the empty state',
  );
}

export async function runWeeklyOverviewByWeekTrendBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    buildOverviewByWeekTrendData,
    resolveOverviewByWeekTrendLoadingState,
    resolveOverviewByWeekReportMetrics,
    resolveRecentWeekPeriods,
  } = await loadOverviewByWeekTrendData();

  assertRecentWeekPeriodsBehavior(resolveRecentWeekPeriods);
  assertReportMetricBehavior(resolveOverviewByWeekReportMetrics);
  assertTrendDataBehavior(buildOverviewByWeekTrendData);
  assertLoadingStateBehavior(resolveOverviewByWeekTrendLoadingState);
}
