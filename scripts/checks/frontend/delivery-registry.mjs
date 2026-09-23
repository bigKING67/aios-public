#!/usr/bin/env node

/**
 * Frontend delivery gate registry audit.
 *
 * Design-token mirrors/sync and vendored preflight are frontend delivery
 * contracts. Keep their package scripts and verify:ci entries synchronized so
 * they do not become invisible top-level-only checks.
 */

import {
  assertRequiredFile,
  createCheckGuard,
  getRepoRoot,
  readRequiredPackageJson,
  readRequiredFile,
  repoFileExists,
} from '../../lib/shared/guard-utils.mjs';
import { auditFrontendGateRegistry } from '../../lib/frontend/frontend-gate-registry-audit.mjs';
import { FRONTEND_DELIVERY_EXPECTED_GATES } from '../../lib/frontend/frontend-delivery-gates.mjs';

const GUARD_NAME = 'frontend-delivery-gate-registry';
const EXPECTED_GATES = FRONTEND_DELIVERY_EXPECTED_GATES;

const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  assertRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail, {
    missingMessage: 'scripts/verify-ci.sh not found.',
  });

  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const scripts = packageJson.scripts ?? {};
  const verifyCiSource = readRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail);
  const findings = auditFrontendGateRegistry({
    expectedGates: EXPECTED_GATES,
    fileExists: (file) => repoFileExists(repoRoot, file),
    packageScripts: scripts,
    verifyCiSource,
  });

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Frontend delivery gate registry drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nKeep frontend delivery gates, package.json scripts, and scripts/verify-ci.sh entries synchronized.');
    process.exit(1);
  }

  reportOk(`${EXPECTED_GATES.length} frontend delivery gates are registered and wired into verify:ci.`);
}

main();
