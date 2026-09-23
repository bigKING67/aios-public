#!/usr/bin/env node

/**
 * Weekly platform tab Douyin section-list routing behavior guard.
 *
 * DouyinAttributionSectionList should stay render-only. Keep the section
 * visibility and ordering contract in a small pure helper so JSX cleanup does
 * not silently reorder or over-render attribution groups.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-section-list-routing-behavior';

const {
  assertEqual,
  assertKeys,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadDouyinSectionListRouting() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-section-list-routing-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-section-list-routing', [
      'buildDouyinAttributionSectionList',
    ]),
  });
}

function makeVisibility(overrides = {}) {
  return {
    showDouyinLiveSection: false,
    showDouyinShortvideoSection: false,
    showDouyinCardSection: false,
    douyinLiveTableRows: [{ marker: 'should-not-read' }],
    douyinShortvideoTableRows: [{ marker: 'should-not-read' }],
    douyinCardProductTableRows: [{ marker: 'should-not-read' }],
    columns: { marker: 'should-not-read' },
    report: { marker: 'should-not-read' },
    ...overrides,
  };
}

function sectionSignature(sections) {
  return sections.map((section) => section.kind).join('>');
}

function assertSectionList(buildDouyinAttributionSectionList, visibility, expectedSignature) {
  const sections = buildDouyinAttributionSectionList(makeVisibility(visibility));

  assertEqual(
    sectionSignature(sections),
    expectedSignature,
    'section list routing should match visible Douyin attribution groups',
  );

  for (const section of sections) {
    assertKeys(
      section,
      ['kind'],
      'section descriptor should stay narrow and render-only',
    );
  }
}

async function main() {
  const {
    buildDouyinAttributionSectionList,
  } = await loadDouyinSectionListRouting();

  assertSectionList(buildDouyinAttributionSectionList, {}, '');
  assertSectionList(
    buildDouyinAttributionSectionList,
    { showDouyinLiveSection: true },
    'live',
  );
  assertSectionList(
    buildDouyinAttributionSectionList,
    { showDouyinShortvideoSection: true },
    'shortvideo',
  );
  assertSectionList(
    buildDouyinAttributionSectionList,
    { showDouyinCardSection: true },
    'card',
  );
  assertSectionList(
    buildDouyinAttributionSectionList,
    {
      showDouyinLiveSection: true,
      showDouyinShortvideoSection: true,
      showDouyinCardSection: true,
    },
    'live>shortvideo>card',
  );
  assertSectionList(
    buildDouyinAttributionSectionList,
    {
      showDouyinLiveSection: false,
      showDouyinShortvideoSection: true,
      showDouyinCardSection: true,
    },
    'shortvideo>card',
  );

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
