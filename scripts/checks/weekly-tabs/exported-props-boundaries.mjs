#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_GUARD_NAME,
  auditWeeklyExportedPropsBoundaries,
  formatWeeklyExportedPropsBoundariesResult,
} from '../../lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs';

export * from '../../lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs';

const { fail } = createWeeklyGuard(WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatWeeklyExportedPropsBoundariesResult(auditWeeklyExportedPropsBoundaries(repoRoot));
  if (output.stdout) {
    process.stdout.write(output.stdout);
  }
  if (output.stderr) {
    process.stderr.write(output.stderr);
  }
  if (output.status !== 0) {
    process.exit(output.status);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
