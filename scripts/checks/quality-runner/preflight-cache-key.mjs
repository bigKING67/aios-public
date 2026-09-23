#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { withFixtureWorkspace } from '../../lib/shared/gate-fixture-utils.mjs';
import {
  FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES,
  computeCacheKey,
  readCacheHit,
  writeCachePass,
} from '../../lib/frontend/frontend-preflight-cache.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-preflight-cache-key-behavior');

function sha256FixtureFile(fileName, cwd) {
  return createHash('sha256').update(readFileSync(path.join(cwd, fileName))).digest('hex');
}

function frontendPreflightCacheHelperSources() {
  return Object.fromEntries(
    ['frontend-preflight-cache.mjs', ...FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES]
      .map((fileName) => [
        `scripts/lib/frontend/${fileName}`,
        readFileSync(new URL(`../../lib/frontend/${fileName}`, import.meta.url), 'utf8'),
      ]),
  );
}

export function runQualityRunnerPreflightCacheKeyBehaviorCheck() {
  withFixtureWorkspace({
    git: false,
    packageJson: null,
    prefix: 'aios-quality-runner-preflight-cache-key-',
  }, (fixture) => {
    const { repoRoot } = fixture;
    const vendorDir = path.join(repoRoot, 'tools/vendor/frontend-preflight');
    const manifestPath = path.join(vendorDir, 'MANIFEST.sha256');
    const wrapperPath = path.join(repoRoot, 'scripts/verify-frontend-preflight.sh');
    fixture.write({
      ...frontendPreflightCacheHelperSources(),
      'scripts/verify-frontend-preflight.sh': '#!/usr/bin/env bash\ntrue\n',
      'tools/vendor/frontend-preflight/probe.sh': '#!/usr/bin/env bash\ntrue\n',
    });
    chmodSync(path.join(vendorDir, 'probe.sh'), 0o755);
    const digest = sha256FixtureFile('probe.sh', vendorDir);
    fixture.write({
      'tools/vendor/frontend-preflight/MANIFEST.sha256': `${digest}  ./probe.sh\n`,
    });

    const probeOptions = {
      'helper-path': path.join(repoRoot, 'scripts/lib/frontend/frontend-preflight-cache.mjs'),
      'bash-version-id': 'status=0;fixture-bash',
      'git-version-id': 'status=0;fixture-git',
      'manifest-file': manifestPath,
      'python-bin': process.execPath,
      'python-id': process.execPath,
      'python-version-id': `status=0;${process.version}`,
      'repo-root': repoRoot,
      'skip-prompts': '1',
      'system-id': 'status=0;fixture-system',
      'vendor-dir': vendorDir,
      wrapper: wrapperPath,
    };
    const first = computeCacheKey(probeOptions);
    assertTrue(first.cacheable, 'preflight cache probe should be cacheable for prompt-skip mode');
    assertFalse(readCacheHit(first.cacheFile, first.cacheKey), 'preflight cache should miss before writing stamp');

    const disabledProbe = computeCacheKey({
      ...probeOptions,
      'skip-prompts': '0',
    });
    assertFalse(disabledProbe.cacheable, 'prompt-sync mode should keep frontend preflight snapshot cache disabled');
    assertIncludes(
      disabledProbe.reason,
      'prompt sync reads global Codex prompt files',
      'explicit uncached preflight mode should report why cache is disabled',
    );

    writeCachePass(first.cacheFile, first.cacheKey);

    const second = computeCacheKey(probeOptions);
    assertEqual(second.cacheKey, first.cacheKey, 'unchanged preflight cache key should remain stable');
    assertTrue(readCacheHit(second.cacheFile, second.cacheKey), 'preflight cache should hit after writing pass stamp');

    const changedRuntimeIdentity = computeCacheKey({
      ...probeOptions,
      'bash-version-id': 'status=0;fixture-bash-updated',
    });
    assertFalse(
      readCacheHit(changedRuntimeIdentity.cacheFile, changedRuntimeIdentity.cacheKey),
      'runtime identity drift should invalidate preflight cache without probing extra subprocesses in wrapper mode',
    );

    fixture.write({
      'tools/vendor/frontend-preflight/probe.sh': '#!/usr/bin/env bash\necho changed\n',
    });
    let mismatch = '';
    try {
      computeCacheKey(probeOptions);
    } catch (error) {
      mismatch = error instanceof Error ? error.message : String(error);
    }
    assertIncludes(
      mismatch,
      'manifest digest mismatch: probe.sh',
      'preflight cache helper should report the manifest mismatch before cache lookup',
    );

    const changedDigest = sha256FixtureFile('probe.sh', vendorDir);
    fixture.write({
      'tools/vendor/frontend-preflight/MANIFEST.sha256': `${changedDigest}  ./probe.sh\n`,
    });
    const changedWithManifest = computeCacheKey(probeOptions);
    assertFalse(readCacheHit(changedWithManifest.cacheFile, changedWithManifest.cacheKey), 'valid vendor snapshot drift should invalidate preflight cache');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerPreflightCacheKeyBehaviorCheck();
  reportOk('snapshot keying, prompt-sync disablement, and manifest invalidation passed.');
}
