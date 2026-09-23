#!/usr/bin/env node

/**
 * Weekly tabs style boundary audit.
 *
 * weekly-modern.module.css is the implementation detail behind Weekly* UI
 * primitives. Platform/business tab files should consume those primitives
 * through weekly-primitives.ts instead of reaching into the stylesheet or
 * concrete primitive files directly.
 */

import {
  assertRequiredFile,
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditWeeklyTabsStyleBoundaries,
  formatWeeklyTabsStyleBoundaryFailures,
  listWeeklyTabsStyleBoundarySourceFiles,
  STYLE_MODULE_PATH,
  summarizeWeeklyTabsStyleBoundaryAudit,
} from '../../lib/weekly/weekly-tabs-style-boundaries-core.mjs';

const { fail, reportOk } = createWeeklyGuard('weekly-tabs-style-boundary');

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);
  assertRequiredFile(repoRoot, STYLE_MODULE_PATH, fail, {
    missingMessage: `${STYLE_MODULE_PATH} not found`,
  });

  const files = listWeeklyTabsStyleBoundarySourceFiles(repoRoot);
  const audit = auditWeeklyTabsStyleBoundaries(repoRoot, files);
  const failureMessage = formatWeeklyTabsStyleBoundaryFailures(audit);
  if (failureMessage) {
    console.error(failureMessage);
    process.exit(1);
  }

  reportOk(summarizeWeeklyTabsStyleBoundaryAudit(audit));
}

main();
