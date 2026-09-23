#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_TABS_ADAPTER_LAYERS_GUARD_NAME,
  auditWeeklyAdapterLayers,
  formatWeeklyAdapterLayersResult,
} from '../../lib/weekly/weekly-tabs-adapter-layers-core.mjs';

export * from '../../lib/weekly/weekly-tabs-adapter-layers-core.mjs';

const { fail } = createWeeklyGuard(WEEKLY_TABS_ADAPTER_LAYERS_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatWeeklyAdapterLayersResult(auditWeeklyAdapterLayers(repoRoot));
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
