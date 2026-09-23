#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  computeFrontendBuildFingerprint,
  listFrontendBuildFingerprintInputs,
} from '../lib/frontend/frontend-build-fingerprint.mjs';

function writeText(filePath, text) {
  writeFileSync(filePath, text, 'utf8');
}

function main() {
  const repoRoot = process.argv[2];
  if (!repoRoot) {
    throw new Error('Usage: frontend-build-fingerprint-runtime-case.mjs <repo-root>');
  }

  const baselineEnv = {
    API_GATEWAY_PREFIX: '/v1',
    VITE_API_GATEWAY_PREFIX: '/v1',
    VITE_API_GATEWAY_TARGET: 'http://localhost:8000',
  };
  const inputs = listFrontendBuildFingerprintInputs(repoRoot);
  const baseline = computeFrontendBuildFingerprint(repoRoot, { env: baselineEnv }).fingerprint;
  const repeat = computeFrontendBuildFingerprint(repoRoot, { env: baselineEnv }).fingerprint;

  writeText(path.join(repoRoot, 'apps/web-vite/dist/assets/app.js'), 'changed ignored dist output\n');
  const afterDistChange = computeFrontendBuildFingerprint(repoRoot, { env: baselineEnv }).fingerprint;

  writeText(path.join(repoRoot, 'apps/web-vite/src/app/page.tsx'), 'export const page = 2;\n');
  const afterSourceChange = computeFrontendBuildFingerprint(repoRoot, { env: baselineEnv }).fingerprint;

  const afterEnvChange = computeFrontendBuildFingerprint(repoRoot, {
    env: {
      ...baselineEnv,
      VITE_API_GATEWAY_PREFIX: '/gateway',
    },
  }).fingerprint;
  const afterDebugEnvChange = computeFrontendBuildFingerprint(repoRoot, {
    env: {
      ...baselineEnv,
      VITE_API_DEBUG_LOGS: '1',
    },
  }).fingerprint;

  process.stdout.write(JSON.stringify({
    afterDebugEnvChange,
    afterDistChange,
    afterEnvChange,
    afterSourceChange,
    baseline,
    inputs,
    repeat,
  }));
}

main();
