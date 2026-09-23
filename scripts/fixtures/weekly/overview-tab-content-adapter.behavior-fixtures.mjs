/**
 * Weekly overview tab content-adapter behavior fixtures.
 *
 * OverviewTab is the orchestration boundary. It may pass the raw report into a
 * tab-level adapter once, but leaf section prop construction must stay out of
 * the TSX render body.
 */

import path from 'node:path';
import {
  countCallExpressions,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasPropertyAccessExpression,
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
    throw new Error('weekly overview tab content adapter fixtures require guard assertions.');
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

async function loadOverviewTabContentAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-tab-adapter-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'overview-tab-content-adapter', [
      'buildOverviewTabContentProps',
    ]),
  });
}

function makeReport() {
  return {
    meta: {
      report_id: '2026/4/26~2026/5/2',
      period_start: '2026-04-26',
      period_end: '2026-05-02',
    },
    kpis: [
      {
        key: 'GMV',
        label: 'GMV',
        display_value: '¥1,000',
        value: 1000,
        wow: 12.4,
        yoy: -0.4,
      },
      {
        key: 'orders',
        label: '订单数',
        display_value: '128',
        value: 128,
        wow: -12.4,
        yoy: 0.4,
      },
    ],
    charts: {
      trend_7d: [
        {
          metric: 'gmv',
          points: [
            { date: '2026-04-26', value: 100 },
            { date: '2026-04-27', value: 120 },
          ],
        },
        {
          metric: 'gmv_prev_week',
          points: [
            { date: '2026-04-19', value: 80 },
            { date: '2026-04-20', value: 90 },
          ],
        },
      ],
      platforms: [
        { platform: 'tmall', gmv: 1000, prev_gmv: 800 },
        { platform: 'douyin', gmv: 600, prev_gmv: 700 },
        { platform: 'wechat', gmv: 120, prev_gmv: 100 },
      ],
    },
  };
}

function assertOverviewTabIsAdapterOnly(repoRoot) {
  const overviewTabPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-tab.tsx',
  );
  const { sourceFile } = parseTsxFile(overviewTabPath);

  const bannedImportSources = [
    'overview-kpi-section-adapter',
    'overview-platform-breakdown-section-adapter',
    'overview-trend-section-adapter',
  ];
  const bannedIdentifiers = [
    'resolveSummaryWeekPeriod',
    'buildOverviewKpiCardPropsList',
    'buildOverviewPlatformBreakdownSectionProps',
    'buildOverviewTrendSectionProps',
  ];
  const bannedPropertyAccesses = [
    'report.meta',
    'report.kpis',
    'report.charts',
  ];

  for (const sourceNeedle of bannedImportSources) {
    if (hasImportSource(sourceFile, sourceNeedle)) {
      fail(`OverviewTab must not import leaf adapters: ${sourceNeedle}`);
    }
  }

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`OverviewTab must not contain leaf adapter/raw report work: ${identifierName}`);
    }
  }

  for (const expressionText of bannedPropertyAccesses) {
    if (hasPropertyAccessExpression(sourceFile, expressionText)) {
      fail(`OverviewTab must not read raw report fields in render: ${expressionText}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'overview-tab-content-adapter',
    importedName: 'buildOverviewTabContentProps',
    localName: 'buildOverviewTabContentProps',
  })) {
    fail('OverviewTab should import the tab-level content adapter');
  }
  if (countCallExpressions(sourceFile, 'buildOverviewTabContentProps') !== 1) {
    fail('OverviewTab should call buildOverviewTabContentProps exactly once');
  }

  const requiredSpreads = [
    { tagName: 'WeeklySummaryCard', spreadName: 'summaryCardProps' },
    { tagName: 'OverviewKpiSection', spreadName: 'kpiSectionProps' },
    { tagName: 'OverviewTrendSection', spreadName: 'trendSectionProps' },
    { tagName: 'OverviewByWeekTrendSection', spreadName: 'byWeekTrendSectionProps' },
    { tagName: 'OverviewPlatformBreakdownSection', spreadName: 'platformBreakdownSectionProps' },
  ];

  for (const requiredSpread of requiredSpreads) {
    if (!hasJsxElementWithSpread(sourceFile, requiredSpread)) {
      fail(`OverviewTab should pass render-ready props: ${requiredSpread.tagName} {...${requiredSpread.spreadName}}`);
    }
  }
}

function assertNoRawReportLeaks(contentProps) {
  assertEqual('report' in contentProps, false, 'tab content props should not expose raw report');
  assertEqual('kpis' in contentProps, false, 'tab content props should not expose raw KPI list');
  assertEqual('charts' in contentProps, false, 'tab content props should not expose raw charts');
}

export async function runWeeklyOverviewTabContentAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  assertOverviewTabIsAdapterOnly(repoRoot);

  const {
    buildOverviewTabContentProps,
  } = await loadOverviewTabContentAdapter();

  const resolveTrendClassName = (value) => (value > 0 ? 'trend-up' : 'trend-down');
  const contentProps = buildOverviewTabContentProps({
    report: makeReport(),
    resolveTrendClassName,
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  });

  assertKeys(
    contentProps,
    [
      'byWeekTrendSectionProps',
      'kpiSectionProps',
      'platformBreakdownSectionProps',
      'summaryCardProps',
      'trendSectionProps',
    ],
    'overview tab adapter should return only render-ready child prop bundles',
  );
  assertNoRawReportLeaks(contentProps);

  assertKeys(
    contentProps.summaryCardProps,
    ['reportId', 'summaryScope', 'weekPeriod'],
    'overview tab adapter should build summary card props',
  );
  assertEqual(
    contentProps.summaryCardProps.reportId,
    '2026/4/26~2026/5/2',
    'overview tab adapter should resolve summary report id before render',
  );
  assertEqual(
    contentProps.summaryCardProps.weekPeriod,
    '2026/4/26~2026/5/2',
    'overview tab adapter should resolve summary week period before render',
  );
  assertEqual(
    contentProps.summaryCardProps.summaryScope,
    'overview',
    'overview tab adapter should set overview summary scope',
  );

  assertEqual(
    contentProps.kpiSectionProps.kpiCardPropsList.length,
    2,
    'overview tab adapter should build KPI card props',
  );
  assertSame(
    contentProps.kpiSectionProps.kpiCardPropsList[0].resolveTrendClassName,
    resolveTrendClassName,
    'overview tab adapter should preserve the trend class resolver reference',
  );
  assertEqual(
    contentProps.trendSectionProps.lineChartProps?.height,
    320,
    'overview tab adapter should build trend chart props',
  );
  assertEqual(
    contentProps.byWeekTrendSectionProps.summaryWeekPeriod,
    '2026/4/26~2026/5/2',
    'overview tab adapter should build by-week hook wrapper props',
  );
  assertEqual(
    contentProps.platformBreakdownSectionProps.donutChartProps.height,
    360,
    'overview tab adapter should build platform donut props',
  );
  assertEqual(
    contentProps.platformBreakdownSectionProps.waterfallChartProps.height,
    360,
    'overview tab adapter should build platform waterfall props',
  );
}
