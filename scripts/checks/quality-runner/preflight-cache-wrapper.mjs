#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES,
} from '../../lib/frontend/frontend-preflight-cache.mjs';
import { withFixtureWorkspace } from '../../lib/shared/gate-fixture-utils.mjs';

const {
  assertEqual,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-preflight-cache-wrapper-behavior');

function sha256FixtureFile(fileName, cwd) {
  return createHash('sha256').update(readFileSync(path.join(cwd, fileName))).digest('hex');
}

function frontendPreflightCacheHelperSources(sourceRepoRoot) {
  return Object.fromEntries(
    ['frontend-preflight-cache.mjs', ...FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES]
      .map((fileName) => [
        `scripts/lib/frontend/${fileName}`,
        readFileSync(path.join(sourceRepoRoot, 'scripts/lib/frontend', fileName), 'utf8'),
      ]),
  );
}

export function runQualityRunnerPreflightCacheWrapperBehaviorCheck(options = {}) {
  const {
    sourceRepoRoot = process.cwd(),
  } = options;
  withFixtureWorkspace({
    git: false,
    packageJson: null,
    prefix: 'aios-quality-runner-preflight-cache-wrapper-',
  }, (fixture) => {
    const { repoRoot } = fixture;
    const wrapperPath = path.join(repoRoot, 'scripts/verify-frontend-preflight.sh');
    const vendorDir = path.join(repoRoot, 'tools/vendor/frontend-preflight');
    const vendorVerifyPath = path.join(vendorDir, 'frontend_preflight_verify.sh');
    const runLogPath = path.join(repoRoot, 'preflight-runs.log');
    const gitRunLogPath = path.join(repoRoot, 'git-runs.log');
    const fixturePythonPath = path.join(repoRoot, '.fixture-bin/python3');
    const realGitPath = spawnSync('bash', ['-lc', 'command -v git'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim();
    const sourceWrapperPath = path.join(sourceRepoRoot, 'scripts/verify-frontend-preflight.sh');
    fixture.write({
      '.fixture-bin/python3': [
        '#!/bin/sh',
        'echo "CPython fixture-python-3.12.0"',
        '',
      ].join('\n'),
      '.fixture-bin/git': [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "${PWD}/git-runs.log"',
        `exec ${JSON.stringify(realGitPath)} "$@"`,
        '',
      ].join('\n'),
      '.fixture-bin/node': [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "${PWD}/node-runs.log"',
        `exec ${JSON.stringify(process.execPath)} "$@"`,
        '',
      ].join('\n'),
      ...frontendPreflightCacheHelperSources(sourceRepoRoot),
      'scripts/verify-frontend-preflight.sh': readFileSync(sourceWrapperPath, 'utf8'),
      'tools/vendor/frontend-preflight/frontend_preflight_verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "run\\n" >> "${PWD}/preflight-runs.log"',
        '',
      ].join('\n'),
    });
    chmodSync(path.join(repoRoot, '.fixture-bin/git'), 0o755);
    chmodSync(path.join(repoRoot, '.fixture-bin/node'), 0o755);
    chmodSync(fixturePythonPath, 0o755);
    chmodSync(vendorVerifyPath, 0o755);
    const digest = sha256FixtureFile('frontend_preflight_verify.sh', vendorDir);
    fixture.write({
      'tools/vendor/frontend-preflight/MANIFEST.sha256': `${digest}  ./frontend_preflight_verify.sh\n`,
    });

    const envBase = {
      ...process.env,
      FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS: '1',
      PATH: `${path.join(repoRoot, '.fixture-bin')}:${process.env.PATH ?? ''}`,
    };
    delete envBase.AIOS_FRONTEND_PREFLIGHT_CACHE;
    delete envBase.AIOS_QUALITY_NO_CACHE;

    const runWrapper = spawnSync('bash', [wrapperPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...envBase,
        AIOS_QUALITY_NO_CACHE: '1',
      },
    });
    assertEqual(runWrapper.status, 0, `preflight wrapper should pass with outer no-cache enabled\nstdout:\n${runWrapper.stdout}\nstderr:\n${runWrapper.stderr}`);
    assertIncludes(runWrapper.stdout, 'cached ', 'preflight wrapper should still write snapshot cache under AIOS_QUALITY_NO_CACHE=1');
    assertEqual(readFileSync(runLogPath, 'utf8').trim().split(/\r?\n/).length, 1, 'wrapper run should execute vendor verify once');
    assertEqual(
      readFileSync(gitRunLogPath, 'utf8').trim().split(/\r?\n/).length,
      1,
      'preflight wrapper should resolve git identity once and let the helper reuse the provided version id',
    );

    const cacheDir = path.join(repoRoot, '.cache/aios-quality/frontend-preflight');
    const cacheFiles = readdirSync(cacheDir).filter((file) => file.endsWith('.json'));
    assertTrue(cacheFiles.length > 0, 'AIOS_QUALITY_NO_CACHE=1 should not disable preflight snapshot cache writes');
    const cachePayload = JSON.parse(readFileSync(path.join(cacheDir, cacheFiles[0]), 'utf8'));
    const cachedPrefix = runWrapper.stdout.match(/cached ([a-f0-9]{12})/u)?.[1] ?? '';
    assertTrue(Boolean(cachedPrefix), 'preflight wrapper should report the written cache key prefix');
    assertEqual(
      cachePayload.cacheKey,
      cacheFiles[0].replace(/\.json$/u, ''),
      'preflight wrapper should write the cache stamp under the matching cache-key filename',
    );
    assertEqual(
      cachePayload.cacheKey.slice(0, 12),
      cachedPrefix,
      'preflight wrapper should report the same cache key prefix that it writes to disk',
    );
    assertEqual(
      cachePayload.status,
      'pass',
      'preflight snapshot cache stamp should record a pass after wrapper success',
    );
    assertEqual(
      cachePayload.schema,
      2,
      'preflight wrapper should write cache stamps with the helper-provided schema version',
    );
    assertEqual(
      readFileSync(runLogPath, 'utf8').trim().split(/\r?\n/).length,
      1,
      'preflight cache stamp inspection should not execute vendor verify again',
    );
    const nodeRunLog = readFileSync(path.join(repoRoot, 'node-runs.log'), 'utf8').trim();
    assertIncludes(
      nodeRunLog,
      '--git-version-id status=0;git version',
      'preflight wrapper should pass git identity directly to avoid helper-side git version probing',
    );
    assertIncludes(
      nodeRunLog,
      '--bash-version-id status=0;bash:',
      'preflight wrapper should pass bash identity directly to avoid helper-side bash version probing',
    );
    assertIncludes(
      nodeRunLog,
      '--system-id status=0;bash:',
      'preflight wrapper should pass system identity directly to avoid helper-side uname probing',
    );
    assertEqual(
      nodeRunLog.split(/\r?\n/).length,
      1,
      'preflight wrapper cold miss should avoid a second helper process for cache stamp writes',
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerPreflightCacheWrapperBehaviorCheck();
  reportOk('wrapper-level cache writes and single-helper stamp writes passed.');
}
