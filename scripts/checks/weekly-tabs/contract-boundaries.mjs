#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_TABS_CONTRACT_BOUNDARIES_GUARD_NAME,
  auditWeeklyContractBoundaries,
  formatWeeklyContractBoundariesResult,
} from '../../lib/weekly/weekly-tabs-contract-boundaries-core.mjs';

export * from '../../lib/weekly/weekly-tabs-contract-boundaries-core.mjs';

const { fail } = createWeeklyGuard(WEEKLY_TABS_CONTRACT_BOUNDARIES_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatWeeklyContractBoundariesResult(auditWeeklyContractBoundaries(repoRoot));
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
