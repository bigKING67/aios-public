#!/usr/bin/env node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  computeGateCacheKey,
  createQualityCacheContext,
} from '../../lib/quality/quality-cache.mjs';

const {
  assertFalse,
  reportOk,
} = createCheckGuard('quality-runner-cache-key-env-behavior');

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-cache-key-env-'));
}

export function runQualityRunnerCacheKeyEnvBehaviorCheck() {
  const repoRoot = createTempWorkspace();
  try {
    writeText(path.join(repoRoot, 'scripts/cache-probe.mjs'), 'console.log("cache probe ran");\n');
    const envGate = {
      name: 'env-probe',
      command: 'node scripts/cache-probe.mjs',
      cacheable: true,
      cost: 'cheap',
      deps: [],
      envKeys: ['AIOS_FIXTURE_ENV'],
      group: 'fixture',
      inputs: ['scripts/cache-probe.mjs'],
      parallel: true,
    };

    const envKeyA = computeGateCacheKey(repoRoot, envGate, createQualityCacheContext(repoRoot, {
      env: { AIOS_FIXTURE_ENV: 'a' },
    })).cacheKey;
    const envKeyB = computeGateCacheKey(repoRoot, envGate, createQualityCacheContext(repoRoot, {
      env: { AIOS_FIXTURE_ENV: 'b' },
    })).cacheKey;
    assertFalse(
      envKeyA === envKeyB,
      'declared env keys should participate in gate cache identity',
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheKeyEnvBehaviorCheck();
  reportOk('env identity passed.');
}
