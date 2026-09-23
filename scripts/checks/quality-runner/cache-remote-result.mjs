#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityGates,
  summarizeResults,
} from '../../lib/quality/quality-scheduler.mjs';
import {
  appendQualityEvent,
  summarizeQualityEvents,
} from '../../lib/quality/quality-events.mjs';
import {
  remoteCacheSmoke,
} from '../../lib/quality/quality-runner-remote-cache-smoke.mjs';
import {
  createCacheProbeGate,
  createCacheRemoteTempWorkspace,
  createRemoteCacheEnv,
  exists,
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
} = createCheckGuard('quality-runner-cache-remote-result-behavior');

async function captureStdoutAsync(callback) {
  const originalStdoutWrite = process.stdout.write;
  let output = '';
  try {
    process.stdout.write = (chunk, encoding, done) => {
      output += String(chunk);
      if (typeof done === 'function') {
        done();
      }
      return true;
    };
    const result = await callback();
    return { output, result };
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
}

export async function runQualityRunnerCacheRemoteResultBehaviorCheck() {
  const repoRoot = createCacheRemoteTempWorkspace();
  try {
    writeCacheProbe(repoRoot);
    const remoteGate = createCacheProbeGate();
    const { remoteRoot, remoteUrl, remoteEnv } = createRemoteCacheEnv(repoRoot);
    const remoteWriter = await runQualityGates([remoteGate], {
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
    assertEqual(remoteWriter.status, 'pass', 'file remote cache writer fixture should pass');
    assertFalse(remoteWriter.results[0]?.cacheHit ?? false, 'first file remote cache run should be cold');

    const remoteCacheInfo = readSingleRemoteResult(remoteRoot, remoteGate);
    assertTrue(
      exists(remoteResultPath(remoteRoot, remoteGate, remoteCacheInfo.cacheKey)),
      'readwrite file remote cache should persist pass result under schema namespace',
    );

    const failingRemoteGate = createCacheProbeGate({ name: 'remote-cache-failing-probe' });
    const failingWriter = await runQualityGates([failingRemoteGate], {
      cache: true,
      commandRunner: async () => ({
        durationMs: 1,
        exitCode: 1,
        stdout: '',
        stderr: 'remote cache failing probe failed\n',
      }),
      env: remoteEnv,
      parallel: 1,
      repoRoot,
    });
    assertEqual(failingWriter.status, 'fail', 'failing remote cache writer fixture should fail');
    assertFalse(
      exists(path.join(remoteRoot, 'schema-v1/results', failingRemoteGate.name)),
      'readwrite file remote cache must not persist failing gate results',
    );

    const corruptRemoteGate = createCacheProbeGate({ name: 'remote-cache-corrupt-probe' });
    const corruptWriter = await runQualityGates([corruptRemoteGate], {
      cache: true,
      commandRunner: async () => ({
        durationMs: 1,
        exitCode: 0,
        stdout: 'corrupt remote cache writer ran\n',
        stderr: '',
      }),
      env: remoteEnv,
      parallel: 1,
      repoRoot,
    });
    assertEqual(corruptWriter.status, 'pass', 'corrupt remote cache writer fixture should pass before payload corruption');
    const corruptRemoteCacheInfo = readSingleRemoteResult(remoteRoot, corruptRemoteGate);
    writeText(corruptRemoteCacheInfo.path, '{ invalid remote result payload\n');
    removeLocalResult(repoRoot, corruptRemoteGate.name);
    let corruptRemoteFallbackRan = false;
    const corruptReader = await runQualityGates([corruptRemoteGate], {
      cache: true,
      commandRunner: async () => {
        corruptRemoteFallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'corrupt remote result fallback ran\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: remoteUrl,
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(corruptReader.status, 'pass', 'corrupt remote result payload should fail open to local execution');
    assertFalse(corruptReader.results[0]?.cacheHit ?? false, 'corrupt remote result payload should not be treated as a cache hit');
    assertTrue(corruptRemoteFallbackRan, 'corrupt remote result payload should execute the gate locally');

    removeLocalResult(repoRoot, remoteGate.name);
    let invalidFileUrlFallbackRan = false;
    const invalidFileUrlReader = await runQualityGates([remoteGate], {
      cache: true,
      commandRunner: async () => {
        invalidFileUrlFallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'invalid file url fallback ran\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: 'file://remote-cache-host/not-local',
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(invalidFileUrlReader.status, 'pass', 'invalid file remote URL should fail open to local execution');
    assertFalse(invalidFileUrlReader.results[0]?.cacheHit ?? false, 'invalid file remote URL should not be treated as a cache hit');
    assertTrue(invalidFileUrlFallbackRan, 'invalid file remote URL should execute the gate locally');

    removeLocalResult(repoRoot, remoteGate.name);
    let remoteFallbackRan = false;
    const remoteReader = await runQualityGates([remoteGate], {
      cache: true,
      commandRunner: async () => {
        remoteFallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'unexpected cold fallback\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: remoteUrl,
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(remoteReader.status, 'pass', 'read-only file remote cache fixture should pass');
    assertTrue(remoteReader.results[0]?.cacheHit ?? false, 'read-only file remote cache should satisfy unchanged gate from remote');
    assertEqual(remoteReader.results[0]?.cacheSource, 'remote', 'remote cache hit should be observable on scheduler result');
    assertFalse(remoteFallbackRan, 'remote cache hit should skip command execution');
    appendQualityEvent(repoRoot, {
      cache: true,
      durationMs: remoteReader.durationMs,
      gates: remoteReader.results.map((item) => ({
        cacheHit: item.cacheHit,
        cacheSource: item.cacheSource,
        durationMs: item.durationMs,
        name: item.gate.name,
        status: item.status,
      })),
      mode: 'fixture',
      status: remoteReader.status,
      summary: summarizeResults(remoteReader.results),
      timestamp: '2026-05-20T00:00:00.000Z',
    });
    const remoteStats = summarizeQualityEvents(repoRoot, { limit: 10, slowLimit: 3 });
    const remoteGateStats = remoteStats.gateSummaries.find((item) => item.name === remoteGate.name);
    assertEqual(remoteStats.cacheSources.remote, 1, 'event stats should count the scheduler remote cache hit');
    assertEqual(remoteStats.cacheSources.local, 0, 'event stats should not reclassify scheduler remote hits as local hits');
    assertEqual(remoteGateStats?.remoteCachedCount, 1, 'per-gate stats should preserve remote cached count from scheduler results');
    assertEqual(remoteGateStats?.localCachedCount, 0, 'per-gate stats should not count the scheduler remote hit as local');

    const { output: smokeOutput, result: smokeResult } = await captureStdoutAsync(() => remoteCacheSmoke({
      env: {},
    }));
    assertEqual(smokeResult.status, 'pass', 'remote cache smoke should prove readwrite-to-read hit path');
    assertEqual(smokeResult.remote.source, 'temp-default', 'remote cache smoke should use an isolated temp remote when env is unset');
    assertTrue(smokeResult.write.remoteResultExists, 'remote cache smoke should persist a remote result');
    assertTrue(smokeResult.write.remoteArtifactExists, 'remote cache smoke should persist a remote artifact payload');
    assertTrue(smokeResult.read.remoteHit, 'remote cache smoke should hit remote cache after local result removal');
    assertTrue(smokeResult.read.localRefill, 'remote cache smoke should refill local result after remote hit');
    assertTrue(smokeResult.read.artifactRestored, 'remote cache smoke should restore artifact outputs from remote hit');
    assertTrue(smokeOutput.includes('remote cache smoke'), 'remote cache smoke should print a concise text summary');
  } finally {
    removeCacheRemoteTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheRemoteResultBehaviorCheck();
  reportOk('file remote result cache and invalid file URL fail-open passed.');
}
