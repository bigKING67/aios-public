#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_TABS_CONTRACT_LAYERS_GUARD_NAME,
  auditWeeklyContractLayers,
  formatWeeklyContractLayersResult,
} from '../../lib/weekly/weekly-tabs-contract-layers-core.mjs';

export * from '../../lib/weekly/weekly-tabs-contract-layers-core.mjs';

const { fail } = createWeeklyGuard(WEEKLY_TABS_CONTRACT_LAYERS_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatWeeklyContractLayersResult(auditWeeklyContractLayers(repoRoot));
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
