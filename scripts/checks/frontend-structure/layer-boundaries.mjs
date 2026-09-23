#!/usr/bin/env node

/**
 * Frontend layer boundary audit CLI facade.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_LAYER_BOUNDARY_GUARD_NAME,
  runFrontendLayerBoundaryAudit,
} from '../../lib/frontend/frontend-layer-boundaries-core.mjs';

export * from '../../lib/frontend/frontend-layer-boundaries-core.mjs';

const { fail, reportOk } = createCheckGuard(FRONTEND_LAYER_BOUNDARY_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const { files, findings } = runFrontendLayerBoundaryAudit(repoRoot);

  if (findings.length > 0) {
    console.error(`[${FRONTEND_LAYER_BOUNDARY_GUARD_NAME}] Frontend layer boundary violations found:`);
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.lineNumber} imports ${finding.specifier}`);
      console.error(`  rule: ${finding.ruleName}`);
      console.error(`  blocked prefix: ${finding.blockedPrefix}`);
      console.error(`  fix: ${finding.suggestion}`);
    }
    process.exit(1);
  }

  reportOk(`scanned ${files.length} frontend TS/JS files; no layer boundary violations found.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
