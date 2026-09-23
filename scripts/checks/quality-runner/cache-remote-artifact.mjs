#!/usr/bin/env node

import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createCacheProbeGate,
  createCacheRemoteTempWorkspace,
  createRemoteCacheEnv,
  exists,
  readSingleRemoteArtifact,
  removeCacheRemoteTempWorkspace,
  removeLocalResult,
  writeCacheProbe,
  writeText,
} from './cache-remote-fixtures.mjs';

const {
  assertEqual,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-cache-remote-artifact-behavior');

export async function runQualityRunnerCacheRemoteArtifactBehaviorCheck() {
  const repoRoot = createCacheRemoteTempWorkspace();
  try {
    writeCacheProbe(repoRoot);
    const { remoteRoot, remoteUrl, remoteEnv } = createRemoteCacheEnv(repoRoot);
    const remoteArtifactGate = createCacheProbeGate({
      name: 'remote-artifact-probe',
      outputs: ['dist/remote-artifact.txt'],
    });
    let remoteArtifactRuns = 0;
    const remoteArtifactWriter = await runQualityGates([remoteArtifactGate], {
      cache: true,
      commandRunner: async () => {
        remoteArtifactRuns += 1;
        writeText(path.join(repoRoot, 'dist/remote-artifact.txt'), 'remote artifact payload\n');
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'remote artifact writer ran\n',
          stderr: '',
        };
      },
      env: remoteEnv,
      parallel: 1,
      repoRoot,
    });
    assertEqual(remoteArtifactWriter.status, 'pass', 'remote artifact writer fixture should pass');
    const remoteArtifactInfo = readSingleRemoteArtifact(remoteRoot, remoteArtifactGate);
    assertTrue(
      exists(remoteArtifactInfo.manifestPath),
      'readwrite file remote cache should persist artifact manifest under schema namespace',
    );
    removeLocalResult(repoRoot, remoteArtifactGate.name);
    rmSync(path.join(repoRoot, '.cache/aios-quality/artifacts/remote-artifact-probe'), { force: true, recursive: true });
    rmSync(path.join(repoRoot, 'dist'), { force: true, recursive: true });
    const remoteArtifactReader = await runQualityGates([remoteArtifactGate], {
      cache: true,
      commandRunner: async () => {
        remoteArtifactRuns += 1;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'unexpected remote artifact fallback\n',
          stderr: '',
        };
      },
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: remoteUrl,
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(remoteArtifactReader.status, 'pass', 'remote artifact reader fixture should pass');
    assertTrue(remoteArtifactReader.results[0]?.cacheHit ?? false, 'remote artifact cache should satisfy unchanged gate');
    assertEqual(remoteArtifactReader.results[0]?.cacheSource, 'remote', 'remote artifact hit should be observable as remote');
    assertEqual(remoteArtifactRuns, 1, 'remote artifact hit should not execute fallback command');
    assertIncludes(
      readFileSync(path.join(repoRoot, 'dist/remote-artifact.txt'), 'utf8'),
      'remote artifact payload',
      'remote artifact cache should restore declared output files',
    );
  } finally {
    removeCacheRemoteTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheRemoteArtifactBehaviorCheck();
  reportOk('remote artifact cache passed.');
}
