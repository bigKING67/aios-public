#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  auditBackendCargoGovernance,
  BACKEND_CARGO_WRAPPER,
  readBackendCargoGovernedFileContents,
} from '../../lib/repo/workspace-doctor-core.mjs';
import {
  createCheckGuard,
  getRepoRoot,
  readRequiredPackageJson,
} from '../../lib/shared/guard-utils.mjs';

const { fail, reportOk } = createCheckGuard('backend-cargo-governance');
const repoRoot = getRepoRoot();
const packageJson = readRequiredPackageJson(repoRoot, fail);
const wrapperContent = fs.readFileSync(path.join(repoRoot, BACKEND_CARGO_WRAPPER), 'utf8');
const result = auditBackendCargoGovernance(
  packageJson.scripts,
  wrapperContent,
  readBackendCargoGovernedFileContents(repoRoot),
);

if (result.findings.length > 0) {
  fail(result.findings.map(({ kind, detail }) => `${kind}: ${detail}`).join('\n'));
}
execFileSync('python3', ['-B', 'scripts/checks/repo/backend-cargo-cache-behavior.py'], {
  cwd: repoRoot,
  stdio: 'inherit',
  timeout: 120000,
});
reportOk(`${result.checkedGateCount} gates, ${result.checkedEntrypointCount} entrypoint, ${result.checkedBinaryConsumerCount} binary consumer, and ${result.checkedBinaryDiscoveryCount} process locator use the governed Cargo targets.`);
