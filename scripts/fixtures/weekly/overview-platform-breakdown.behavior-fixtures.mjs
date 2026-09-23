/**
 * Weekly overview platform breakdown behavior guard.
 *
 * The overview tab uses platform rows to build the GMV contribution donut and
 * waterfall. Keep platform alias matching, canonical order, brand colors, and
 * delta-contribution math explicit so taxonomy or chart refactors do not alter
 * the visible platform contribution story.
 */

import path from 'node:path';
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
    throw new Error('weekly overview platform breakdown fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

async function loadOverviewPlatformBreakdown() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-overview-platform-',
    entrySource: [
      createWeeklyTabsEntrySource(repoRoot, 'overview-platform-breakdown-data', [
        'buildOverviewPlatformBreakdown',
        'buildOverviewPlatformBreakdownViewModel',
        'OVERVIEW_PLATFORM_TOTAL_BAR_COLOR',
      ]),
      `export { PLATFORM_LEGEND_COLORS } from ${JSON.stringify(path.join(repoRoot, 'apps/web-vite/src/lib/platform-colors'))};`,
      '',
    ],
  });
}

function makeCharts(platforms) {
  return {
    platforms,
  };
}

function assertCanonicalOrderAndAliasBehavior(buildOverviewPlatformBreakdown, PLATFORM_LEGEND_COLORS) {
  const breakdown = buildOverviewPlatformBreakdown(makeCharts([
    { platform: 'wechat', gmv: 50, prev_gmv: 60 },
    { platform: 'dou-yin', gmv: 220, prev_gmv: 160 },
    { platform: 'taobao', gmv: 120, prev_gmv: 100 },
    { platform: 'xhs', gmv: 80, prev_gmv: 100 },
    { platform: 'jd', gmv: 30, prev_gmv: 25 },
    { platform: 'unknown', gmv: 999, prev_gmv: 1 },
  ]));

  assertEqual(
    breakdown.map((item) => item.name).join('>'),
    '天猫>抖音>小红书>微信>京东',
    'platform breakdown should keep canonical display order',
  );
  assertEqual(breakdown.find((item) => item.name === '天猫')?.value, 120, 'taobao alias should match 天猫');
  assertEqual(breakdown.find((item) => item.name === '抖音')?.value, 220, 'dou-yin alias should match 抖音');
  assertEqual(breakdown.find((item) => item.name === '小红书')?.value, 80, 'xhs alias should match 小红书');
  assertEqual(breakdown.find((item) => item.name === '微信')?.value, 50, 'wechat alias should match 微信');
  assertEqual(breakdown.find((item) => item.name === '京东')?.value, 30, 'jd alias should match 京东');

  assertEqual(breakdown.find((item) => item.name === '天猫')?.color, PLATFORM_LEGEND_COLORS.tmall, '天猫 color should use platform legend token');
  assertEqual(breakdown.find((item) => item.name === '抖音')?.color, PLATFORM_LEGEND_COLORS.douyin, '抖音 color should use platform legend token');
  assertEqual(breakdown.find((item) => item.name === '小红书')?.color, PLATFORM_LEGEND_COLORS.xiaohongshu, '小红书 color should use platform legend token');
  assertEqual(breakdown.find((item) => item.name === '微信')?.color, PLATFORM_LEGEND_COLORS.wechat, '微信 color should use platform legend token');
  assertEqual(breakdown.find((item) => item.name === '京东')?.color, PLATFORM_LEGEND_COLORS.jd, '京东 color should use platform legend token');
}

function assertDeltaContributionBehavior(buildOverviewPlatformBreakdown) {
  const breakdown = buildOverviewPlatformBreakdown(makeCharts([
    { platform: 'tmall', gmv: 120, prev_gmv: 100 },
    { platform: 'douyin', gmv: 220, prev_gmv: 160 },
    { platform: 'xhs', gmv: 80, prev_gmv: 100 },
    { platform: 'wechat', gmv: 50, prev_gmv: 60 },
    { platform: 'jd', gmv: 30, prev_gmv: 25 },
  ]));

  assertEqual(breakdown.find((item) => item.name === '天猫')?.delta, 20, 'delta should equal current minus previous');
  assertEqual(breakdown.find((item) => item.name === '小红书')?.delta, -20, 'delta should preserve negative movement');
  assertEqual(
    breakdown.find((item) => item.name === '抖音')?.deltaContribution,
    60 / 55 * 100,
    'delta contribution should use total delta as denominator and multiply by 100',
  );
}

function assertFallbackAndFirstMatchBehavior(buildOverviewPlatformBreakdown) {
  const breakdown = buildOverviewPlatformBreakdown(makeCharts([
    { platform: 'tmall', gmv: 'not-a-number', prev_gmv: 8 },
    { platform: 'tmall', gmv: 999, prev_gmv: 1 },
    { platform: 'douyin', gmv: 10, prev_gmv: 'bad' },
  ]));

  const tmall = breakdown.find((item) => item.name === '天猫');
  const douyin = breakdown.find((item) => item.name === '抖音');

  assertEqual(tmall?.value, 0, 'invalid current GMV should fall back to 0');
  assertEqual(tmall?.prevValue, 8, 'first matching platform row should win');
  assertEqual(douyin?.prevValue, 0, 'invalid previous GMV should fall back to 0');
  assertEqual(breakdown.find((item) => item.name === '微信')?.value, 0, 'missing platform should fall back to 0');
}

function assertZeroTotalDeltaBehavior(buildOverviewPlatformBreakdown) {
  const breakdown = buildOverviewPlatformBreakdown(makeCharts([
    { platform: 'tmall', gmv: 120, prev_gmv: 100 },
    { platform: 'douyin', gmv: 80, prev_gmv: 100 },
  ]));

  assertEqual(breakdown.find((item) => item.name === '天猫')?.delta, 20, 'positive delta fixture should remain non-zero');
  assertEqual(breakdown.find((item) => item.name === '抖音')?.delta, -20, 'negative delta fixture should offset total delta');
  for (const item of breakdown) {
    assertEqual(item.deltaContribution, 0, 'all delta contributions should be 0 when total delta is 0');
  }
}

function assertViewModelBehavior(buildOverviewPlatformBreakdownViewModel) {
  const viewModel = buildOverviewPlatformBreakdownViewModel(makeCharts([
    { platform: 'tmall', gmv: 120, prev_gmv: 100 },
    { platform: 'douyin', gmv: 220, prev_gmv: 160 },
    { platform: 'xhs', gmv: 80, prev_gmv: 100 },
    { platform: 'wechat', gmv: 50, prev_gmv: 60 },
    { platform: 'jd', gmv: 30, prev_gmv: 25 },
  ]));

  assertEqual(viewModel.breakdown.length, 5, 'view-model should expose all canonical breakdown rows');
  assertEqual(viewModel.totalPlatformGmv, 500, 'view-model should sum current platform GMV');
  assertEqual(viewModel.totalPrevPlatformGmv, 445, 'view-model should sum previous platform GMV');
  assertEqual(viewModel.totalPlatformDelta, 55, 'view-model delta should equal current total minus previous total');
  assertEqual(
    viewModel.donutData.map((item) => `${item.name}:${item.value}:${item.prevValue}:${item.color}`).join('|'),
    viewModel.breakdown.map((item) => `${item.name}:${item.value}:${item.prevValue}:${item.color}`).join('|'),
    'donut data should preserve name/value/prevValue/color from breakdown rows',
  );
  assertEqual(
    viewModel.waterfallSteps.map((item) => `${item.name}:${item.delta}:${item.current}:${item.prev}:${item.share}:${item.color}`).join('|'),
    viewModel.breakdown.map((item) => `${item.name}:${item.delta}:${item.value}:${item.prevValue}:${item.deltaContribution}:${item.color}`).join('|'),
    'waterfall steps should preserve delta/current/prev/share/color from breakdown rows',
  );
  assertEqual(
    viewModel.summaryText,
    '上周同期：¥445 ｜ 本周同期：¥500 ｜ 总增量：+¥55',
    'view-model summary text should use shared period delta formatter',
  );
}

export async function runWeeklyOverviewPlatformBreakdownBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const {
    buildOverviewPlatformBreakdown,
    buildOverviewPlatformBreakdownViewModel,
    PLATFORM_LEGEND_COLORS,
  } = await loadOverviewPlatformBreakdown();

  assertCanonicalOrderAndAliasBehavior(buildOverviewPlatformBreakdown, PLATFORM_LEGEND_COLORS);
  assertDeltaContributionBehavior(buildOverviewPlatformBreakdown);
  assertFallbackAndFirstMatchBehavior(buildOverviewPlatformBreakdown);
  assertZeroTotalDeltaBehavior(buildOverviewPlatformBreakdown);
  assertViewModelBehavior(buildOverviewPlatformBreakdownViewModel);
}
