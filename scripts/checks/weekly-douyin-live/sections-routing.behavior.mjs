#!/usr/bin/env node

/**
 * Weekly platform tab Douyin live-sections routing behavior guard.
 *
 * DouyinLiveAttributionSections should keep its visible story order explicit:
 * session attribution first, then the selected live funnel analysis.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-live-sections-routing-behavior';

const {
  assertEqual,
  assertKeys,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadDouyinLiveSectionsRouting() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-live-sections-routing-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-live-sections-routing', [
      'buildDouyinLiveAttributionSubsectionList',
    ]),
  });
}

function sectionSignature(sections) {
  return sections.map((section) => section.kind).join('>');
}

async function main() {
  const {
    buildDouyinLiveAttributionSubsectionList,
  } = await loadDouyinLiveSectionsRouting();

  const sections = buildDouyinLiveAttributionSubsectionList();

  assertEqual(
    sectionSignature(sections),
    'session>funnel',
    'live attribution subsections should keep session before funnel',
  );

  for (const section of sections) {
    assertKeys(
      section,
      ['kind'],
      'live subsection descriptor should stay narrow and render-only',
    );
  }

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
