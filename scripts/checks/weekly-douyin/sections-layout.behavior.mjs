#!/usr/bin/env node

/**
 * Weekly platform tab Douyin sections-layout behavior guard.
 *
 * DouyinAttributionSections should not own attribution visibility branching.
 * Keep the empty-state decision as a small pure layout helper so future section
 * splitting cannot silently change when the empty attribution block appears.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-sections-layout-behavior';

const {
  assertEqual,
  assertKeys,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadDouyinSectionsLayout() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-sections-layout-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-douyin-sections-layout', [
      'resolveDouyinAttributionSectionsLayout',
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

function assertLayout(resolveDouyinAttributionSectionsLayout, visibility, expected) {
  const layout = resolveDouyinAttributionSectionsLayout(makeVisibility(visibility));

  assertKeys(
    layout,
    ['hasAttributionSections', 'showEmptyAttributionSection'],
    'layout helper should expose only section visibility state',
  );
  assertEqual(
    layout.hasAttributionSections,
    expected.hasAttributionSections,
    'layout helper should resolve attribution visibility',
  );
  assertEqual(
    layout.showEmptyAttributionSection,
    expected.showEmptyAttributionSection,
    'layout helper should resolve empty attribution visibility',
  );
}

async function main() {
  const {
    resolveDouyinAttributionSectionsLayout,
  } = await loadDouyinSectionsLayout();

  assertLayout(
    resolveDouyinAttributionSectionsLayout,
    { showDouyinLiveSection: true },
    { hasAttributionSections: true, showEmptyAttributionSection: false },
  );
  assertLayout(
    resolveDouyinAttributionSectionsLayout,
    { showDouyinShortvideoSection: true },
    { hasAttributionSections: true, showEmptyAttributionSection: false },
  );
  assertLayout(
    resolveDouyinAttributionSectionsLayout,
    { showDouyinCardSection: true },
    { hasAttributionSections: true, showEmptyAttributionSection: false },
  );
  assertLayout(
    resolveDouyinAttributionSectionsLayout,
    {},
    { hasAttributionSections: false, showEmptyAttributionSection: true },
  );

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
