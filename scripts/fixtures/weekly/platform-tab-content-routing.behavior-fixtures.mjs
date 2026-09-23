/**
 * Weekly platform tab content-routing behavior guard.
 *
 * Platform detail sections intentionally render before KPI cards for Tmall
 * attribution storytelling, but after KPI cards for Douyin and standard trend
 * tabs. Keep that layout and content-kind contract explicit so JSX cleanup does
 * not silently change the visible narrative order.
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
    throw new Error('weekly platform tab content routing fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertSame(...args) {
  currentAssertions().assertSame(...args);
}

async function loadPlatformTabContentRouting() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-platform-tab-routing-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-content-routing', [
      'buildPlatformTabBodySections',
      'resolvePlatformTabContentKind',
    ]),
  });
}

const PRIMARY_METRICS = [
  {
    key: 'gmv',
    label: 'GMV',
    value: '¥1,000',
    wow: 12,
  },
  {
    key: 'orders',
    label: '订单',
    value: '50',
    wow: -4,
  },
];

function makeContentProps(overrides = {}) {
  return {
    isMobile: false,
    report: {
      meta: {
        report_id: '2026/4/26~2026/5/2',
      },
      charts: {
        trend_7d: [],
        platforms: [],
      },
    },
    platformLabel: '天猫',
    summaryWeekPeriod: '2026/4/26~2026/5/2',
    isTmallPlatform: false,
    isDouyinPlatform: false,
    columns: {
      marker: 'columns-reference',
    },
    viewModel: {
      primaryMetrics: PRIMARY_METRICS,
    },
    ...overrides,
  };
}

function sectionSignature(sections) {
  return sections
    .map((section) =>
      section.kind === 'content'
        ? `content:${section.placement}`
        : `kpi:${section.kpiSectionProps.platformLabel}:${section.kpiSectionProps.kpiCardPropsList.length}`
    )
    .join('>');
}

function assertContentKindBehavior(resolvePlatformTabContentKind) {
  assertEqual(
    resolvePlatformTabContentKind({ isTmallPlatform: true, isDouyinPlatform: true }),
    'tmall',
    'Tmall should take priority if both flags are true',
  );
  assertEqual(
    resolvePlatformTabContentKind({ isTmallPlatform: false, isDouyinPlatform: true }),
    'douyin',
    'Douyin flag should route to Douyin content',
  );
  assertEqual(
    resolvePlatformTabContentKind({ isTmallPlatform: false, isDouyinPlatform: false }),
    'trend',
    'standard platforms should route to trend content',
  );
}

function makeBuildOptions() {
  return {
    resolveTrendClassName: (value) => (value > 0 ? 'up' : 'down'),
  };
}

function assertKpiSectionProps(section, platformLabel, resolveTrendClassName) {
  assertEqual(section.kind, 'kpi', 'section should be a KPI section');
  assertEqual(
    section.kpiSectionProps.platformLabel,
    platformLabel,
    'KPI section should preserve platform label',
  );
  assertEqual(
    section.kpiSectionProps.kpiCardPropsList.length,
    PRIMARY_METRICS.length,
    'KPI section should build render-ready KPI card props',
  );
  assertSame(
    section.kpiSectionProps.kpiCardPropsList[0].resolveTrendClassName,
    resolveTrendClassName,
    'KPI section should preserve trend class resolver reference',
  );
  assertEqual('metrics' in section, false, 'routing should not expose raw metrics on KPI section');
}

function assertTmallBodySections(buildPlatformTabBodySections) {
  const contentProps = makeContentProps({
    platformLabel: '天猫',
    isTmallPlatform: true,
  });
  const options = makeBuildOptions();
  const sections = buildPlatformTabBodySections(contentProps, options);

  assertEqual(
    sectionSignature(sections),
    'content:before-kpi>kpi:天猫:2',
    'Tmall should render attribution content before KPI cards',
  );
  assertSame(
    sections.find((section) => section.kind === 'content')?.contentProps,
    contentProps,
    'Tmall content section should preserve content props reference',
  );
  assertKpiSectionProps(
    sections.find((section) => section.kind === 'kpi'),
    '天猫',
    options.resolveTrendClassName,
  );
}

function assertDouyinBodySections(buildPlatformTabBodySections) {
  const contentProps = makeContentProps({
    platformLabel: '抖音',
    isDouyinPlatform: true,
  });
  const options = makeBuildOptions();
  const sections = buildPlatformTabBodySections(contentProps, options);

  assertEqual(
    sectionSignature(sections),
    'kpi:抖音:2>content:after-kpi',
    'Douyin should render KPI cards before attribution content',
  );
  assertSame(
    sections.find((section) => section.kind === 'content')?.contentProps,
    contentProps,
    'Douyin content section should preserve content props reference',
  );
  assertKpiSectionProps(
    sections.find((section) => section.kind === 'kpi'),
    '抖音',
    options.resolveTrendClassName,
  );
}

function assertTrendBodySections(buildPlatformTabBodySections) {
  const contentProps = makeContentProps({
    platformLabel: '微信',
  });
  const options = makeBuildOptions();
  const sections = buildPlatformTabBodySections(contentProps, options);

  assertEqual(
    sectionSignature(sections),
    'kpi:微信:2>content:after-kpi',
    'standard trend platforms should render KPI cards before trend content',
  );
  assertKpiSectionProps(
    sections.find((section) => section.kind === 'kpi'),
    '微信',
    options.resolveTrendClassName,
  );
}

export async function runWeeklyPlatformTabContentRoutingBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const {
    buildPlatformTabBodySections,
    resolvePlatformTabContentKind,
  } = await loadPlatformTabContentRouting();

  assertContentKindBehavior(resolvePlatformTabContentKind);
  assertTmallBodySections(buildPlatformTabBodySections);
  assertDouyinBodySections(buildPlatformTabBodySections);
  assertTrendBodySections(buildPlatformTabBodySections);
}
