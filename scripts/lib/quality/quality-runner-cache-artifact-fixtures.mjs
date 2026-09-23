import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  createFixtureWorkspace,
} from '../shared/gate-fixture-utils.mjs';
import {
  computeGateCacheKey,
  createQualityCacheContext,
  getGateArtifactManifest,
  restoreGateArtifacts,
  validateGateArtifactOutputs,
} from './quality-cache.mjs';
import { runQualityGates } from './quality-scheduler.mjs';

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function localCacheOnlyEnv() {
  return {
    ...process.env,
    AIOS_QUALITY_REMOTE_CACHE_MODE: '',
    AIOS_QUALITY_REMOTE_CACHE_URL: '',
  };
}

export async function runQualityRunnerCacheArtifactBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertFalse,
    assertIncludes,
    assertTrue,
  } = assertions;
  const fixture = createFixtureWorkspace({
    files: {
      'scripts/cache-probe.mjs': 'console.log("cache probe ran");\n',
    },
    git: false,
    packageJson: null,
    prefix: 'aios-quality-runner-cache-artifact-',
  });
  try {
    const { repoRoot } = fixture;
    const env = localCacheOnlyEnv();
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
    const artifactGate = {
      ...cacheableGate,
      name: 'artifact-probe',
      outputs: ['apps/web-vite/dist/**', 'apps/web-vite/dist/**', 'reports/output.json'],
      parallel: false,
    };
    const artifactConsumerGate = {
      ...cacheableGate,
      name: 'artifact-consumer',
      cacheable: false,
      deps: ['artifact-probe'],
      outputs: [],
      parallel: false,
    };
    const artifactCacheInfo = computeGateCacheKey(repoRoot, artifactGate, createQualityCacheContext(repoRoot));
    const artifactManifest = getGateArtifactManifest(repoRoot, artifactGate, artifactCacheInfo.cacheKey);
    assertEqual(
      artifactManifest.outputs.join(','),
      'apps/web-vite/dist/**,reports/output.json',
      'artifact manifest should normalize, dedupe, and sort declared outputs',
    );
    assertIncludes(
      artifactManifest.artifactRoot,
      '.cache/aios-quality/artifacts/artifact-probe/',
      'artifact manifest should place outputs under the quality artifact cache namespace',
    );
    assertEqual(
      getGateArtifactManifest(repoRoot, cacheableGate, artifactCacheInfo.cacheKey),
      null,
      'gates without declared outputs should remain pass-only cache entries',
    );
    assertTrue(
      validateGateArtifactOutputs(artifactGate).ok,
      'artifact output validation should accept narrow generated output paths',
    );
    assertFalse(
      validateGateArtifactOutputs({
        ...artifactGate,
        outputs: ['apps/web-vite/src/**'],
      }).ok,
      'artifact output validation should reject source tree outputs before materialization exists',
    );
    assertFalse(
      validateGateArtifactOutputs({
        ...artifactGate,
        outputs: ['../dist/**'],
      }).ok,
      'artifact output validation should reject paths escaping the repository',
    );
    writeText(
      path.join(repoRoot, 'apps/web-vite/dist/assets/app.js'),
      'console.log("restored build artifact");\n',
    );
    writeText(
      path.join(repoRoot, 'apps/web-vite/dist/aios-build-manifest.json'),
      '{"fingerprint":"fixture-build-v1"}\n',
    );
    writeText(path.join(repoRoot, 'reports/output.json'), '{"ok":true}\n');
    let artifactWriterRan = false;
    const artifactWriter = await runQualityGates([artifactGate], {
      cache: true,
      commandRunner: async () => {
        artifactWriterRan = true;
        return {
          durationMs: 1,
          exitCode: 0,
          stdout: 'artifact writer ran\n',
          stderr: '',
        };
      },
      env,
      parallel: 1,
      repoRoot,
    });
    assertEqual(artifactWriter.status, 'pass', 'artifact-producing fixture should pass before writing cache');
    assertTrue(artifactWriterRan, 'artifact-producing fixture should execute the injected writer once');
    const artifactPayload = JSON.parse(readFileSync(path.join(artifactManifest.artifactRoot, 'manifest.json'), 'utf8'));
    const artifactEntry = artifactPayload.files.find((entry) => entry.path === 'apps/web-vite/dist/assets/app.js');
    assertIncludes(
      artifactEntry?.digest ?? '',
      'sha256:',
      'artifact manifest should record content digests for restored files',
    );
    assertTrue(
      existsSync(path.join(artifactManifest.artifactRoot, 'manifest.json')),
      'artifact-producing pass should persist an artifact manifest alongside the result stamp',
    );
    writeText(path.join(repoRoot, 'apps/web-vite/dist/assets/app.js'), 'stale build output\n');
    writeText(path.join(repoRoot, 'apps/web-vite/dist/stale-only.txt'), 'stale residue\n');
    rmSync(path.join(repoRoot, 'reports'), { force: true, recursive: true });
    let artifactCacheFallbackRan = false;
    let artifactConsumerRan = 0;
    const artifactReader = await runQualityGates([artifactGate, artifactConsumerGate], {
      cache: true,
      commandRunner: async (command, { gate }) => {
        if (gate.name === artifactGate.name) {
          artifactCacheFallbackRan = true;
          return {
            durationMs: 1,
            exitCode: 1,
            stdout: 'unexpected artifact cold fallback\n',
            stderr: 'artifact producer should have restored from cache before consumer runs\n',
          };
        }

        artifactConsumerRan += 1;
        const restoredAsset = readFileSync(path.join(repoRoot, 'apps/web-vite/dist/assets/app.js'), 'utf8');
        const restoredManifest = readFileSync(path.join(repoRoot, 'apps/web-vite/dist/aios-build-manifest.json'), 'utf8');
        const staleResidueExists = existsSync(path.join(repoRoot, 'apps/web-vite/dist/stale-only.txt'));
        return {
          durationMs: 1,
          exitCode: restoredAsset.includes('restored build artifact')
            && restoredManifest.includes('fixture-build-v1')
            && !staleResidueExists
            ? 0
            : 1,
          stdout: 'artifact consumer inspected restored build output\n',
          stderr: '',
        };
      },
      env,
      parallel: 1,
      repoRoot,
    });
    const restoredArtifactResult = artifactReader.results.find((result) => result.gate.name === artifactGate.name);
    const restoredConsumerResult = artifactReader.results.find((result) => result.gate.name === artifactConsumerGate.name);
    assertEqual(artifactReader.status, 'pass', 'artifact cache hit should restore cached outputs');
    assertTrue(restoredArtifactResult?.cacheHit ?? false, 'artifact cache hit should be reported before consumer execution');
    assertFalse(restoredConsumerResult?.cacheHit ?? false, 'consumer fixture should inspect live restored output');
    assertFalse(artifactCacheFallbackRan, 'artifact cache hit should skip command execution');
    assertIncludes(
      readFileSync(path.join(repoRoot, 'apps/web-vite/dist/assets/app.js'), 'utf8'),
      'restored build artifact',
      'artifact cache restore should replace stale local output with cached output',
    );
    assertTrue(
      existsSync(path.join(repoRoot, 'reports/output.json')),
      'artifact cache restore should recreate all declared output roots',
    );
    assertFalse(
      existsSync(path.join(repoRoot, 'apps/web-vite/dist/stale-only.txt')),
      'artifact cache restore should clear stale dist residue before downstream inspection',
    );
    assertEqual(artifactConsumerRan, 1, 'downstream fixture should run exactly once after restored build output is available');
    const artifactManifestPath = path.join(artifactManifest.artifactRoot, 'manifest.json');
    writeText(artifactManifestPath, '{"schema":1,"gate":"wrong","cacheKey":"wrong","outputs":[],"files":[]}\n');
    assertFalse(
      restoreGateArtifacts(repoRoot, artifactManifest),
      'artifact restore should fail closed on manifest gate/key/output mismatch',
    );
    writeText(artifactManifestPath, JSON.stringify({
      ...artifactPayload,
      files: artifactPayload.files.map((entry) => (
        entry.path === 'apps/web-vite/dist/assets/app.js' ? { ...entry, digest: 'sha256:wrong' } : entry
      )),
    }, null, 2));
    assertFalse(
      restoreGateArtifacts(repoRoot, artifactManifest),
      'artifact restore should fail closed on content digest mismatch',
    );
    let unsafeArtifactError = '';
    try {
      getGateArtifactManifest(repoRoot, {
        ...artifactGate,
        outputs: ['scripts/**'],
      }, artifactCacheInfo.cacheKey);
    } catch (error) {
      unsafeArtifactError = error instanceof Error ? error.message : String(error);
    }
    assertIncludes(
      unsafeArtifactError,
      'must not target source/cache/tooling paths',
      'artifact manifest creation should fail closed for unsafe outputs',
    );
  } finally {
    fixture.cleanup();
  }
}
