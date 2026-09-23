#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_GUARD_NAME,
  auditWeeklyContractImportHygiene,
  formatWeeklyContractImportHygieneResult,
} from '../../lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs';

export * from '../../lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs';

const { fail } = createWeeklyGuard(WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatWeeklyContractImportHygieneResult(auditWeeklyContractImportHygiene(repoRoot));
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
