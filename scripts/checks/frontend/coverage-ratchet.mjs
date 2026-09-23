#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readFrontendCoverageRatchetManifest,
  validateFrontendCoverageRatchetManifest,
} from '../../lib/frontend/frontend-coverage-ratchet-core.mjs';
import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-coverage-ratchet';

export function checkFrontendCoverageRatchet({ manifest, runCoverage }) {
  const findings = validateFrontendCoverageRatchetManifest(manifest);
  if (findings.length > 0) {
    return {
      findings,
      status: 1,
    };
  }

  const result = runCoverage();
  return {
    findings: result.status === 0
      ? []
      : [`Vitest coverage execution failed with status ${result.status ?? 'unknown'}`],
    status: result.status === 0 ? 0 : 1,
  };
}

function main() {
  const repoRoot = getRepoRoot();
  const manifest = readFrontendCoverageRatchetManifest(repoRoot);
  const { fail } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });
  const result = checkFrontendCoverageRatchet({
    manifest,
    runCoverage: () => spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'apps/web-vite/vitest.coverage.config.ts',
      ],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
      },
    ),
  });

  if (result.status !== 0) {
    fail(result.findings.join('\n'));
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main();
}
