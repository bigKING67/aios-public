#!/usr/bin/env node

/**
 * Frontend structure gate registry audit.
 *
 * App/module, shared-component, inline-style, component-size, CSS Module size,
 * and frontend behavior-quality gates are part of the frontend architecture
 * contract. This registry keeps their package scripts and verify:ci entries
 * synchronized.
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
import { FRONTEND_STRUCTURE_EXPECTED_GATES } from '../../lib/frontend/frontend-structure-gates.mjs';

const GUARD_NAME = 'frontend-structure-gate-registry';
const EXPECTED_GATES = FRONTEND_STRUCTURE_EXPECTED_GATES;

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
    console.error(`[${GUARD_NAME}] Frontend structure gate registry drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error(
      '\nKeep frontend structure gates, package.json scripts, and scripts/verify-ci.sh entries synchronized.',
    );
    process.exit(1);
  }

  reportOk(`${EXPECTED_GATES.length} frontend structure gates are registered and wired into verify:ci.`);
}

main();
