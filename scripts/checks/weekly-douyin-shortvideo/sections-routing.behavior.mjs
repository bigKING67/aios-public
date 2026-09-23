#!/usr/bin/env node

/**
 * Weekly platform tab Douyin shortvideo-sections routing behavior guard.
 *
 * DouyinShortvideoAttributionSections should keep its visible story order
 * explicit: shortvideo overview first, then diagnosis analysis.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-shortvideo-sections-routing-behavior';

const {
  assertEqual,
  assertKeys,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadDouyinShortvideoSectionsRouting() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-shortvideo-sections-routing-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-douyin-shortvideo-sections-routing',
      ['buildDouyinShortvideoAttributionSubsectionList'],
    ),
  });
}

function sectionSignature(sections) {
  return sections.map((section) => section.kind).join('>');
}

async function main() {
  const {
    buildDouyinShortvideoAttributionSubsectionList,
  } = await loadDouyinShortvideoSectionsRouting();

  const sections = buildDouyinShortvideoAttributionSubsectionList();

  assertEqual(
    sectionSignature(sections),
    'overview>analysis',
    'shortvideo attribution subsections should keep overview before analysis',
  );

  for (const section of sections) {
    assertKeys(
      section,
      ['kind'],
      'shortvideo subsection descriptor should stay narrow and render-only',
    );
  }

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
