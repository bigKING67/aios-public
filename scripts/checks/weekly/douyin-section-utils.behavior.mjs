#!/usr/bin/env node

/**
 * Weekly Douyin section utility behavior guard.
 *
 * These helpers drive table row visibility and total-card fallback math across
 * live, shortvideo, and product-card sections. Keep their semantics explicit so
 * section data assembly can be refactored without changing report behavior.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-douyin-section-utils-behavior';
const {
  assertEqual,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadWeeklyDouyinSectionUtils() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-utils-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-section-utils', [
      'buildTopAbsoluteDeltaRows',
      'findPlatformAttributionItem',
      'resolveDouyinSectionTotals',
    ]),
  });
}

function assertTopRowsBehavior(buildTopAbsoluteDeltaRows) {
  const rows = Array.from({ length: 84 }, (_, index) => ({
    id: `row-${index}`,
    delta: index === 0 ? 0 : index % 2 === 0 ? index : -index,
  }));
  const topRows = buildTopAbsoluteDeltaRows(rows, (row) => row.delta);

  assertEqual(topRows.length, 80, 'top rows should use the default 80-row cap');
  assertEqual(topRows[0].id, 'row-83', 'top rows should sort by absolute delta descending');
  assertEqual(topRows[1].id, 'row-82', 'top rows should keep descending magnitude order');
  assertEqual(topRows[79].id, 'row-4', 'top rows should keep the largest 80 rows only');

  const customLimitRows = buildTopAbsoluteDeltaRows(rows, (row) => row.delta, 3);
  assertEqual(customLimitRows.map((row) => row.id).join('>'), 'row-83>row-82>row-81', 'custom limit should be honored');

  const tieRows = buildTopAbsoluteDeltaRows([
    { id: 'a', delta: 10 },
    { id: 'b', delta: -10 },
    { id: 'c', delta: 5 },
  ], (row) => row.delta);
  assertEqual(tieRows.map((row) => row.id).join('>'), 'a>b>c', 'equal magnitudes should preserve source order');
}

function assertTotalsBehavior(resolveDouyinSectionTotals) {
  const rows = [
    { current: 100, prev: 30 },
    { current: 50, prev: 20 },
  ];
  const fallbackTotals = resolveDouyinSectionTotals({
    attribution: undefined,
    rows,
    getCurrent: (row) => row.current,
    getPrev: (row) => row.prev,
  });

  assertEqual(fallbackTotals.current, 150, 'missing attribution total should fall back to current row sum');
  assertEqual(fallbackTotals.prev, 50, 'missing attribution total should fall back to previous row sum');
  assertEqual(fallbackTotals.delta, 100, 'fallback total delta should be current minus previous');

  const explicitTotals = resolveDouyinSectionTotals({
    attribution: {
      total_curr_gmv: '999.5',
      total_prev_gmv: 800,
    },
    rows,
    getCurrent: (row) => row.current,
    getPrev: (row) => row.prev,
  });

  assertEqual(explicitTotals.current, 999.5, 'explicit current total should take priority over row sum');
  assertEqual(explicitTotals.prev, 800, 'explicit previous total should take priority over row sum');
  assertEqual(explicitTotals.delta, 199.5, 'explicit total delta should be current minus previous');

  const partialTotals = resolveDouyinSectionTotals({
    attribution: {
      total_curr_gmv: 250,
      total_prev_gmv: 'not-a-number',
    },
    rows,
    getCurrent: (row) => row.current,
    getPrev: (row) => row.prev,
  });

  assertEqual(partialTotals.current, 250, 'explicit current total should remain usable when previous is invalid');
  assertEqual(partialTotals.prev, 50, 'invalid previous total should fall back to row sum independently');
  assertEqual(partialTotals.delta, 200, 'partial total delta should combine explicit and fallback values');
}

function assertFindPlatformBehavior(findPlatformAttributionItem) {
  const matched = findPlatformAttributionItem(
    [
      null,
      { platform: 'tmall', marker: 'ignored' },
      { platform: 'dou-yin', marker: 'matched' },
      { platform: 'douyin', marker: 'later' },
    ],
    ['douyin'],
  );

  assertEqual(matched?.marker, 'matched', 'platform matching should normalize tokens and return first match');
  assertEqual(
    findPlatformAttributionItem([{ platform: 'tmall' }], ['douyin']),
    undefined,
    'missing platform match should return undefined',
  );
}

async function main() {
  const {
    buildTopAbsoluteDeltaRows,
    findPlatformAttributionItem,
    resolveDouyinSectionTotals,
  } = await loadWeeklyDouyinSectionUtils();

  assertTopRowsBehavior(buildTopAbsoluteDeltaRows);
  assertTotalsBehavior(resolveDouyinSectionTotals);
  assertFindPlatformBehavior(findPlatformAttributionItem);

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
