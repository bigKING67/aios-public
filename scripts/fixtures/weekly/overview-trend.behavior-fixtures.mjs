/**
 * Weekly overview trend chart behavior guard.
 *
 * The overview trend chart is the visible 7-day GMV line chart in the weekly
 * report. Keep metric selection, period anchoring, and chart-series semantics
 * explicit so refactors do not silently change the top-level trend surface.
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
    throw new Error('weekly overview trend fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

async function loadOverviewTrendData() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-trend-chart-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-trend-data', [
      'buildOverviewTrendChartData',
      'resolveOverviewTrendSeries',
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

function assertSeriesResolutionBehavior(resolveOverviewTrendSeries) {
  const currentPoints = makeCurrentPoints();
  const previousPoints = makePreviousPoints();
  const series = resolveOverviewTrendSeries(
    makeReport([
      { metric: 'refund', points: [makePoint('2026-04-25', 10)] },
      { metric: 'gmv_prev_week', points: previousPoints },
      { metric: 'gmv', points: currentPoints },
    ]),
  );

  assertEqual(series?.currentPoints, currentPoints, 'series resolver should select GMV as current points');
  assertEqual(series?.previousPoints, previousPoints, 'series resolver should select gmv_prev_week as previous points');
  assertEqual(
    resolveOverviewTrendSeries(makeReport([{ metric: 'gsv', points: currentPoints }])),
    null,
    'series resolver should return null when GMV trend is missing',
  );
  assertEqual(
    resolveOverviewTrendSeries({ charts: { trend_7d: null }, meta: {} }),
    null,
    'series resolver should return null when trend_7d is not an array',
  );
}

function assertChartDataBehavior(buildOverviewTrendChartData) {
  const currentPoints = makeCurrentPoints();
  const previousPoints = makePreviousPoints();
  const chartData = buildOverviewTrendChartData(
    makeReport([
      { metric: 'gmv', points: currentPoints },
      { metric: 'gmv_prev_week', points: previousPoints },
    ]),
  );

  assertEqual(chartData?.series.length, 2, 'chart data should keep current and previous series');
  assertEqual(chartData?.series[0]?.name, '本周', 'current series name should stay stable');
  assertEqual(chartData?.series[1]?.name, '上周', 'previous series name should stay stable');
  assertEqual(chartData?.series[0]?.data.join(','), '100,120,90,130,150,140,180', 'current data should be preserved');
  assertEqual(chartData?.series[1]?.data.join(','), '80,110,70,100,125,118,160', 'previous data should be preserved');
  assertEqual(
    chartData?.xAxis.join('>'),
    '周六>周日>周一>周二>周三>周四>周五',
    'xAxis day labels should stay Saturday-to-Friday',
  );
  assertEqual(chartData?.dates?.thisWeek[0], '2026/4/25', 'this-week tooltip dates should use YYYY/M/D format');
  assertEqual(chartData?.dates?.prevWeek[0], '2026/4/18', 'previous-week tooltip dates should use YYYY/M/D format');
  assertEqual(chartData?.periodInfo?.thisWeekStart, '2026-04-25', 'periodInfo should keep report.meta.period_start');
  assertEqual(chartData?.periodInfo?.prevWeekStart, '2026-04-18', 'periodInfo should derive previous week start');

  const simulatedPrevious = buildOverviewTrendChartData(
    makeReport([{ metric: 'gmv', points: currentPoints }]),
  );

  assertEqual(
    simulatedPrevious?.series[1]?.data.join(','),
    '85,102,77,111,128,119,153',
    'missing previous week should preserve simulated previous-series fallback',
  );
  assertEqual(
    simulatedPrevious?.dates?.prevWeek.length,
    0,
    'simulated previous-series fallback should keep previous tooltip dates empty',
  );
  assertEqual(
    buildOverviewTrendChartData(makeReport([{ metric: 'gmv', points: [] }])),
    null,
    'empty GMV points should return null',
  );
}

export async function runWeeklyOverviewTrendBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const {
    buildOverviewTrendChartData,
    resolveOverviewTrendSeries,
  } = await loadOverviewTrendData();

  assertSeriesResolutionBehavior(resolveOverviewTrendSeries);
  assertChartDataBehavior(buildOverviewTrendChartData);
}
