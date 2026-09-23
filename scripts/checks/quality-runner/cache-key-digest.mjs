#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  computeGateCacheKey,
  createQualityCacheContext,
  flushQualityCacheContext,
} from '../../lib/quality/quality-cache.mjs';

const {
  assertFalse,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-cache-key-digest-behavior');

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-cache-key-digest-'));
}

export function runQualityRunnerCacheKeyDigestBehaviorCheck() {
  const repoRoot = createTempWorkspace();
  try {
    writeText(path.join(repoRoot, 'scripts/cache-probe.mjs'), 'console.log("cache probe ran");\n');
    const cacheableGate = {
      name: 'cache-probe',
      command: 'node scripts/cache-probe.mjs',
      cacheable: true,
      cost: 'cheap',
      deps: [],
      group: 'fixture',
      inputs: ['scripts/cache-probe.mjs'],
      parallel: true,
    };

    const digestContext = createQualityCacheContext(repoRoot);
    computeGateCacheKey(repoRoot, cacheableGate, digestContext);
    flushQualityCacheContext(digestContext);
    const digestCachePath = path.join(repoRoot, '.cache/aios-quality/digests/files-v1.json');
    const digestCachePayload = JSON.parse(readFileSync(digestCachePath, 'utf8'));
    assertTrue(
      Boolean(digestCachePayload.entries?.['scripts/cache-probe.mjs']?.digest),
      'gate cache key computation should persist file digest cache entries',
    );

    const cachedDigest = digestCachePayload.entries['scripts/cache-probe.mjs'].digest;
    writeText(path.join(repoRoot, 'scripts/cache-probe.mjs'), 'console.log("cache probe changed with longer source");\n');
    const updatedDigestContext = createQualityCacheContext(repoRoot);
    computeGateCacheKey(repoRoot, cacheableGate, updatedDigestContext);
    flushQualityCacheContext(updatedDigestContext);
    const updatedDigestCachePayload = JSON.parse(readFileSync(digestCachePath, 'utf8'));
    assertFalse(
      updatedDigestCachePayload.entries['scripts/cache-probe.mjs'].digest === cachedDigest,
      'file digest cache should refresh when input content changes',
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheKeyDigestBehaviorCheck();
  reportOk('digest cache persistence and refresh passed.');
}
