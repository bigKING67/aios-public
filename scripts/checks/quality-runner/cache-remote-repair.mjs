#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createCacheProbeGate,
  createCacheRemoteTempWorkspace,
  createRemoteCacheEnv,
  readSingleRemoteResult,
  remoteResultPath,
  removeCacheRemoteTempWorkspace,
  removeLocalResult,
  writeCacheProbe,
  writeText,
} from './cache-remote-fixtures.mjs';

const {
  assertEqual,
  assertFalse,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-cache-remote-repair-behavior');

export async function runQualityRunnerCacheRemoteRepairBehaviorCheck() {
  const repoRoot = createCacheRemoteTempWorkspace();
  try {
    writeCacheProbe(repoRoot);
    const remoteGate = createCacheProbeGate();
    const { remoteRoot, remoteUrl, remoteEnv } = createRemoteCacheEnv(repoRoot);
    await runQualityGates([remoteGate], {
      cache: true,
      commandRunner: async () => ({
        durationMs: 1,
        exitCode: 0,
        stdout: 'remote cache writer ran\n',
        stderr: '',
      }),
      env: remoteEnv,
      parallel: 1,
      repoRoot,
    });
    const remoteCacheInfo = readSingleRemoteResult(remoteRoot, remoteGate);
    const remoteCacheFile = remoteResultPath(remoteRoot, remoteGate, remoteCacheInfo.cacheKey);
    writeText(path.join(repoRoot, '.cache/aios-quality/results/remote-cache-probe', `${remoteCacheInfo.cacheKey}.json`), '{"status":"pass"}\n');
    let corruptLocalFallbackRan = false;
    const corruptLocalReader = await runQualityGates([remoteGate], {
      cache: true,
      commandRunner: async () => {
        corruptLocalFallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'unexpected corrupt-local fallback\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: remoteUrl,
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(corruptLocalReader.status, 'pass', 'corrupt local cache fixture should pass through remote repair');
    assertTrue(corruptLocalReader.results[0]?.cacheHit ?? false, 'valid remote cache should repair an invalid local stamp');
    assertEqual(corruptLocalReader.results[0]?.cacheSource, 'remote', 'invalid local stamp should not mask valid remote cache hit');
    assertFalse(corruptLocalFallbackRan, 'valid remote cache should avoid cold execution even when local stamp is invalid');

    writeText(remoteCacheFile, JSON.stringify({
      schema: 2,
      gate: remoteGate.name,
      cacheKey: `${remoteCacheInfo.cacheKey}-wrong`,
      status: 'pass',
    }, null, 2));
    removeLocalResult(repoRoot, remoteGate.name);
    let invalidRemoteFallbackRan = false;
    const invalidRemoteReader = await runQualityGates([remoteGate], {
      cache: true,
      commandRunner: async () => {
        invalidRemoteFallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'invalid remote fallback ran\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: remoteUrl,
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(invalidRemoteReader.status, 'pass', 'invalid remote cache should fail open to a cold pass');
    assertFalse(invalidRemoteReader.results[0]?.cacheHit ?? false, 'wrong-key remote cache payload must not be accepted');
    assertTrue(invalidRemoteFallbackRan, 'invalid remote payload should execute the gate locally');
  } finally {
    removeCacheRemoteTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheRemoteRepairBehaviorCheck();
  reportOk('remote repair and invalid remote fail-open passed.');
}
