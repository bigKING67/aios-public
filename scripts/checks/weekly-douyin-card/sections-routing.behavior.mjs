#!/usr/bin/env node

/**
 * Weekly platform tab Douyin card-sections routing behavior guard.
 *
 * DouyinCardAttributionSections should keep its visible story order explicit:
 * product attribution first, source attribution second, then source funnel.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-sections-routing-behavior';

const {
  assertEqual,
  assertKeys,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadDouyinCardSectionsRouting() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-card-sections-routing-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-card-sections-routing', [
      'buildDouyinCardAttributionSubsectionList',
    ]),
  });
}

function sectionSignature(sections) {
  return sections.map((section) => section.kind).join('>');
}

async function main() {
  const {
    buildDouyinCardAttributionSubsectionList,
  } = await loadDouyinCardSectionsRouting();

  const sections = buildDouyinCardAttributionSubsectionList();

  assertEqual(
    sectionSignature(sections),
    'product>source>funnel',
    'card attribution subsections should keep product, source, then funnel order',
  );

  for (const section of sections) {
    assertKeys(
      section,
      ['kind'],
      'card subsection descriptor should stay narrow and render-only',
    );
  }

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
