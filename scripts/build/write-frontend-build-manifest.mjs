#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getRepoRoot } from '../lib/shared/guard-utils.mjs';
import {
  FRONTEND_BUILD_MANIFEST_PATH,
  computeFrontendBuildFingerprint,
} from '../lib/frontend/frontend-build-fingerprint.mjs';

function main() {
  const repoRoot = getRepoRoot();
  const fingerprint = computeFrontendBuildFingerprint(repoRoot);
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: fingerprint.fingerprint,
    envKeys: fingerprint.envKeys,
    files: fingerprint.files,
  };
  const manifestPath = path.join(repoRoot, FRONTEND_BUILD_MANIFEST_PATH);

  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `[frontend-build-manifest] wrote ${FRONTEND_BUILD_MANIFEST_PATH} with ${fingerprint.files.length} files and ${fingerprint.envKeys.length} env keys.`,
  );
}

main();
