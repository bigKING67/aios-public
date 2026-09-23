#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseArgs,
} from '../../lib/quality/quality-runner-args.mjs';
import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  getRemoteCacheDiagnostics,
  getRemoteCacheConfig,
} from '../../lib/quality/quality-cache.mjs';
import {
  createRunModeGateEnv,
} from '../../lib/quality/quality-runner-actions.mjs';
import {
  remoteCacheEnvForOptions,
} from '../../lib/quality/quality-runner-remote-cache.mjs';
import {
  REMOTE_CACHE_HEALTH_DISABLED_ENV,
  writeRemoteCacheHealth,
} from '../../lib/quality/quality-runner-remote-cache-health.mjs';
import {
  printRemoteCacheDoctor,
  printRemoteCacheEnv,
} from '../../quality-runner.mjs';
import {
  checkQualityWorkflowCacheContract,
  readQualityWorkflowSource,
} from '../../lib/ci/quality-workflow-contract-core.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-cache-remote-config-behavior');

function captureStdout(callback) {
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
    callback();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return output;
}

function assertQualityWorkflowRemoteCacheContract(repoRoot) {
  const findings = checkQualityWorkflowCacheContract(readQualityWorkflowSource(repoRoot));
  assertEqual(findings.length, 0, `quality workflow remote cache contract should pass: ${findings.join('\n')}`);
}

export function runQualityRunnerCacheRemoteConfigBehaviorCheck(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  assertFalse(
    getRemoteCacheConfig({}).enabled,
    'remote cache should be disabled by default',
  );
  assertEqual(
    getRemoteCacheConfig({ AIOS_QUALITY_REMOTE_CACHE_URL: 'ftp://cache.example.invalid' }).mode,
    'invalid',
    'remote cache should reject unsupported URL protocols',
  );
  assertEqual(
    getRemoteCacheConfig({ AIOS_QUALITY_REMOTE_CACHE_URL: 'file:///tmp/aios-quality-cache' }).mode,
    'read',
    'remote cache should default to read mode when explicitly configured',
  );
  assertEqual(
    getRemoteCacheConfig({
      AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
      AIOS_QUALITY_REMOTE_CACHE_URL: 'https://cache.example.invalid/aios/',
    }).mode,
    'readwrite',
    'remote cache should require an explicit readwrite mode before uploads are possible',
  );

  const disabledDiagnostics = getRemoteCacheDiagnostics({});
  assertEqual(disabledDiagnostics.status, 'off', 'remote cache diagnostics should expose disabled status');
  assertFalse(disabledDiagnostics.usable, 'disabled remote cache should not be usable');

  const unsupportedDiagnostics = getRemoteCacheDiagnostics({
    AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
    AIOS_QUALITY_REMOTE_CACHE_URL: 'https://user:secret@cache.example.invalid/aios/',
  });
  assertEqual(
    unsupportedDiagnostics.status,
    'unsupported-protocol',
    'remote cache diagnostics should surface runtime-unsupported configured protocols',
  );
  assertEqual(
    unsupportedDiagnostics.url,
    'https://***:***@cache.example.invalid/aios/',
    'remote cache diagnostics should redact URL credentials',
  );

  const tempRoot = mkdtempSync(path.join(tmpdir(), 'aios-quality-cache-remote-config-'));
  try {
    const missingRoot = path.join(tempRoot, 'missing-parent', 'missing-remote-cache');
    const readwriteDiagnostics = getRemoteCacheDiagnostics({
      AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
      AIOS_QUALITY_REMOTE_CACHE_URL: pathToFileURL(missingRoot).toString(),
    });
    assertEqual(
      readwriteDiagnostics.status,
      'ready-readwrite',
      'readwrite file remote cache should be usable when parent directory is writable',
    );
    assertFalse(
      readwriteDiagnostics.rootExists,
      'readwrite diagnostics should not create the remote cache root just to inspect it',
    );

    const runOverride = remoteCacheEnvForOptions({
      remoteCachePath: missingRoot,
    }, {}, {
      commandName: 'quality runner run',
      defaultModeForOverride: 'read',
    });
    assertEqual(runOverride.source, 'override', 'run remote cache path override should expose override source');
    assertEqual(
      runOverride.env.AIOS_QUALITY_REMOTE_CACHE_URL,
      pathToFileURL(path.resolve(missingRoot)).toString(),
      'run remote cache path override should be converted to a file URL',
    );
    assertEqual(
      runOverride.env.AIOS_QUALITY_REMOTE_CACHE_MODE,
      'read',
      'run remote cache path override should default to read-only mode',
    );

    const doctorOverride = remoteCacheEnvForOptions({
      remoteCachePath: missingRoot,
    }, {}, {
      commandName: 'remote cache doctor',
      defaultModeForOverride: 'readwrite',
    });
    assertEqual(
      doctorOverride.env.AIOS_QUALITY_REMOTE_CACHE_MODE,
      'readwrite',
      'doctor remote cache path override should default to readwrite readiness mode',
    );

    const inherited = remoteCacheEnvForOptions({}, {
      AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
      AIOS_QUALITY_REMOTE_CACHE_URL: 'file:///tmp/aios-quality-inherited-cache',
    }, {
      commandName: 'quality runner run',
      defaultModeForOverride: 'read',
    });
    assertEqual(inherited.source, 'current-env', 'remote cache helper should report current-env without CLI override');
    assertEqual(
      inherited.env.AIOS_QUALITY_REMOTE_CACHE_MODE,
      'readwrite',
      'remote cache helper should preserve explicit env mode when CLI override is absent',
    );

    const runGateEnv = createRunModeGateEnv({
      changedFiles: ['docs/QUALITY_GATE_RUNNER.md'],
    }, {
      base: 'origin/main',
      env: {},
      head: 'HEAD',
      remoteCachePath: missingRoot,
    }, repoRoot);
    assertEqual(
      runGateEnv.AIOS_QUALITY_REMOTE_CACHE_MODE,
      'read',
      'run mode gate env should pass read-only remote cache mode into the scheduler',
    );
    assertEqual(
      getRemoteCacheDiagnostics(runGateEnv).status,
      'missing-readonly-source',
      'run mode diagnostics should evaluate the scheduler env override rather than ambient process env',
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }

  let conflictThrew = false;
  try {
    remoteCacheEnvForOptions({
      remoteCachePath: '/tmp/aios-quality-remote',
      remoteCacheUrl: 'file:///tmp/aios-quality-remote',
    }, {}, {
      commandName: 'quality runner run',
      defaultModeForOverride: 'read',
    });
  } catch (error) {
    conflictThrew = error instanceof Error
      && error.message.includes('quality runner run accepts either --remote-cache-url or --remote-cache-path');
  }
  assertTrue(conflictThrew, 'remote cache helper should reject simultaneous path and URL overrides');

  assertQualityWorkflowRemoteCacheContract(repoRoot);

  const parsedDoctorArgs = parseArgs([
    'remote-cache',
    'doctor',
    '--remote-cache-path',
    '/tmp/aios-quality-remote',
    '--remote-cache-mode',
    'readwrite',
    '--json',
  ]);
  assertEqual(parsedDoctorArgs.positionals.join(' '), 'remote-cache doctor', 'remote cache doctor should preserve command positionals');
  assertEqual(parsedDoctorArgs.options.remoteCachePath, '/tmp/aios-quality-remote', 'remote cache doctor should parse path override');
  assertEqual(parsedDoctorArgs.options.remoteCacheMode, 'readwrite', 'remote cache doctor should parse mode override');

  const parsedSmokeArgs = parseArgs([
    'remote-cache',
    'smoke',
    '--remote-cache-url',
    'file:///tmp/aios-quality-remote',
    '--json',
  ]);
  assertEqual(parsedSmokeArgs.positionals.join(' '), 'remote-cache smoke', 'remote cache smoke should preserve command positionals');
  assertEqual(parsedSmokeArgs.options.remoteCacheUrl, 'file:///tmp/aios-quality-remote', 'remote cache smoke should parse URL override');

  const parsedSetupArgs = parseArgs([
    'remote-cache',
    'setup',
    '--remote-cache-path',
    '/tmp/aios-quality-remote',
    '--json',
  ]);
  assertEqual(parsedSetupArgs.positionals.join(' '), 'remote-cache setup', 'remote cache setup should preserve command positionals');
  assertEqual(parsedSetupArgs.options.remoteCachePath, '/tmp/aios-quality-remote', 'remote cache setup should parse path override');

  const parsedEnvArgs = parseArgs([
    'remote-cache',
    'env',
    '--health-only',
    '--remote-cache-path',
    '/tmp/aios-quality-remote',
    '--remote-cache-mode',
    'readwrite',
  ]);
  assertEqual(parsedEnvArgs.positionals.join(' '), 'remote-cache env', 'remote cache env should preserve command positionals');
  assertEqual(parsedEnvArgs.options.remoteCacheHealthOnly, true, 'remote cache env should parse health-only mode');
  assertEqual(parsedEnvArgs.options.remoteCachePath, '/tmp/aios-quality-remote', 'remote cache env should parse path override');
  assertEqual(parsedEnvArgs.options.remoteCacheMode, 'readwrite', 'remote cache env should parse explicit mode');

  const parsedActivateArgs = parseArgs([
    'remote-cache',
    'activate',
    '--remote-cache-url',
    'file:///tmp/aios-quality-remote',
  ]);
  assertEqual(parsedActivateArgs.positionals.join(' '), 'remote-cache activate', 'remote cache activate should preserve command positionals');
  assertEqual(parsedActivateArgs.options.remoteCacheUrl, 'file:///tmp/aios-quality-remote', 'remote cache activate should parse URL override');

  const parsedRunArgs = parseArgs([
    'run',
    'affected',
    '--remote-cache-path',
    '/tmp/aios-quality-remote',
    '--json',
  ]);
  assertEqual(parsedRunArgs.positionals.join(' '), 'run affected', 'run mode should preserve command positionals');
  assertEqual(parsedRunArgs.options.remoteCachePath, '/tmp/aios-quality-remote', 'run mode should parse path override');

  const doctorTempRoot = mkdtempSync(path.join(tmpdir(), 'aios-quality-cache-remote-doctor-'));
  try {
    const doctorRoot = path.join(doctorTempRoot, 'doctor-cache-root');
    const doctorText = captureStdout(() => {
      printRemoteCacheDoctor({
        env: {},
        remoteCachePath: doctorRoot,
      });
    });
    assertIncludes(doctorText, 'remote cache doctor source=override', 'remote cache doctor should report override source');
    assertIncludes(doctorText, 'status=ready-readwrite', 'remote cache doctor should validate writable proposed file cache roots');
    assertIncludes(doctorText, 'usable=yes', 'remote cache doctor should mark writable proposed roots as usable');
  } finally {
    rmSync(doctorTempRoot, { force: true, recursive: true });
  }

  const envTempRoot = mkdtempSync(path.join(tmpdir(), 'aios-quality-cache-remote-env-'));
  try {
    const envRoot = path.join(envTempRoot, 'env-cache-root');
    const envText = captureStdout(() => {
      printRemoteCacheEnv({
        env: {},
        remoteCachePath: envRoot,
      });
    });
    assertIncludes(envText, 'export AIOS_QUALITY_REMOTE_CACHE_URL=', 'remote cache env should print a shell export command');
    assertIncludes(envText, 'AIOS_QUALITY_REMOTE_CACHE_MODE=readwrite', 'remote cache env should default path overrides to readwrite mode');
    const envJson = JSON.parse(captureStdout(() => {
      printRemoteCacheEnv({
        env: {},
        json: true,
        remoteCachePath: envRoot,
      });
    }));
    assertEqual(envJson.status, 'pass', 'remote cache env JSON should pass for a file path target');
    assertEqual(envJson.source, 'override', 'remote cache env JSON should expose override source');
    assertEqual(envJson.env.AIOS_QUALITY_REMOTE_CACHE_URL, pathToFileURL(envRoot).toString(), 'remote cache env JSON should convert path to file URL');
    assertIncludes(envJson.commands.envCommand, 'remote-cache env --remote-cache-url', 'remote cache env JSON should include a reusable env command');
    assertIncludes(envJson.commands.envCommand, "--remote-cache-url 'file://", 'remote cache env command should use readable single quotes inside eval');
    assertIncludes(envJson.commands.smokeCommand, 'remote-cache smoke --remote-cache-url', 'remote cache env JSON should include target-specific smoke command');
    const inheritedEnvJson = JSON.parse(captureStdout(() => {
      printRemoteCacheEnv({
        env: {
          AIOS_QUALITY_REMOTE_CACHE_URL: pathToFileURL(envRoot).toString(),
        },
        json: true,
      });
    }));
    assertEqual(inheritedEnvJson.source, 'current-env', 'remote cache env should report inherited env source');
    assertEqual(inheritedEnvJson.env.AIOS_QUALITY_REMOTE_CACHE_MODE, 'read', 'remote cache env should preserve read-only semantics when current env has no mode');
    const freshHealth = {
      command: 'setup',
      freshness: 'fresh',
      remote: {
        source: 'override',
        url: pathToFileURL(envRoot).toString(),
      },
      smoke: {
        read: {
          artifactRestored: true,
          remoteHit: true,
        },
        status: 'pass',
      },
      status: 'pass',
    };
    const healthJson = JSON.parse(captureStdout(() => {
      printRemoteCacheEnv({
        env: {},
        json: true,
        remoteCacheHealth: freshHealth,
      });
    }));
    assertEqual(healthJson.source, 'health', 'remote cache env should reuse fresh health when env is unset');
    assertEqual(healthJson.env.AIOS_QUALITY_REMOTE_CACHE_URL, pathToFileURL(envRoot).toString(), 'remote cache env should activate the health URL');
    const autoRunGateEnv = createRunModeGateEnv({
      changedFiles: ['apps/web-vite/src/app/page.tsx'],
    }, {
      base: 'origin/main',
      env: {},
      head: 'HEAD',
      mode: 'affected',
      remoteCacheHealth: freshHealth,
    }, repoRoot);
    assertEqual(
      autoRunGateEnv.AIOS_QUALITY_REMOTE_CACHE_URL,
      pathToFileURL(envRoot).toString(),
      'run mode should auto-activate fresh remote cache health when no env or override is set',
    );
    assertEqual(
      autoRunGateEnv.AIOS_QUALITY_REMOTE_CACHE_MODE,
      'read',
      'run mode auto remote cache activation should stay read-only',
    );
    const autoOptOutGateEnv = createRunModeGateEnv({
      changedFiles: ['apps/web-vite/src/app/page.tsx'],
    }, {
      base: 'origin/main',
      env: { AIOS_QUALITY_REMOTE_CACHE_AUTO: '0' },
      head: 'HEAD',
      mode: 'affected',
      remoteCacheHealth: freshHealth,
    }, repoRoot);
    assertEqual(
      autoOptOutGateEnv.AIOS_QUALITY_REMOTE_CACHE_URL,
      undefined,
      'run mode should allow disabling automatic remote cache activation',
    );
    const prepushOptOutGateEnv = createRunModeGateEnv({
      changedFiles: ['apps/web-vite/src/app/page.tsx'],
    }, {
      base: 'origin/main',
      env: { AIOS_QUALITY_PREPUSH_REMOTE_CACHE_AUTO: '0' },
      head: 'HEAD',
      mode: 'prepush',
      remoteCacheHealth: freshHealth,
    }, repoRoot);
    assertEqual(
      prepushOptOutGateEnv.AIOS_QUALITY_REMOTE_CACHE_URL,
      undefined,
      'prepush mode should honor the hook-specific automatic remote cache opt-out',
    );
    const healthOnlyMissingJson = JSON.parse(captureStdout(() => {
      printRemoteCacheEnv({
        env: {},
        json: true,
        remoteCacheHealth: { status: 'missing' },
        remoteCacheHealthOnly: true,
      });
    }));
    assertEqual(healthOnlyMissingJson.status, 'fail', 'remote cache env --health-only should fail closed without fresh health');
    assertIncludes(healthOnlyMissingJson.reason, 'no fresh remote cache health', 'remote cache env --health-only should explain missing health');
  } finally {
    rmSync(envTempRoot, { force: true, recursive: true });
  }

  const disabledDoctorJson = JSON.parse(captureStdout(() => {
    printRemoteCacheDoctor({
      env: {},
      json: true,
    });
  }));
  assertEqual(disabledDoctorJson.diagnostics.status, 'off', 'remote cache doctor JSON should expose current disabled status');
  assertIncludes(
    disabledDoctorJson.suggestion.commands.join('\n'),
    'AIOS_QUALITY_REMOTE_CACHE_MODE',
    'remote cache doctor JSON should include setup commands',
  );

  const disabledHealthWrite = writeRemoteCacheHealth(repoRoot, {
    command: 'setup',
    env: { [REMOTE_CACHE_HEALTH_DISABLED_ENV]: '1' },
    result: {
      env: {
        AIOS_QUALITY_REMOTE_CACHE_URL: 'file:///tmp/aios-quality-disabled-health',
      },
      rootPath: '/tmp/aios-quality-disabled-health',
      source: 'override',
      status: 'pass',
    },
  });
  assertEqual(
    disabledHealthWrite.written,
    false,
    'remote cache health writer should support disabling writes for behavior fixtures',
  );
  assertIncludes(
    disabledHealthWrite.reason,
    REMOTE_CACHE_HEALTH_DISABLED_ENV,
    'disabled remote cache health writes should explain the disabling env',
  );

  const setupTempRoot = mkdtempSync(path.join(tmpdir(), 'aios-quality-cache-remote-setup-'));
  try {
    const setupRoot = path.join(setupTempRoot, 'setup-cache-root');
    const setupResult = spawnSync(process.execPath, [
      'scripts/quality-runner.mjs',
      'remote-cache',
      'setup',
      '--remote-cache-path',
      setupRoot,
      '--json',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        [REMOTE_CACHE_HEALTH_DISABLED_ENV]: '1',
      },
    });
    assertEqual(setupResult.status, 0, `remote cache setup should exit cleanly: ${setupResult.stderr}`);
    const setupJson = JSON.parse(setupResult.stdout);
    assertEqual(setupJson.status, 'pass', 'remote cache setup JSON should pass for a writable local path');
    assertEqual(setupJson.source, 'override', 'remote cache setup JSON should expose override source');
    assertTrue(existsSync(setupRoot), 'remote cache setup should create the target cache root');
    assertTrue(setupJson.smoke.write.remoteResultExists, 'remote cache setup smoke should persist a remote result');
    assertTrue(setupJson.smoke.write.remoteArtifactExists, 'remote cache setup smoke should persist a remote artifact');
    assertTrue(setupJson.smoke.read.artifactRestored, 'remote cache setup smoke should restore remote artifact output');
  } finally {
    rmSync(setupTempRoot, { force: true, recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheRemoteConfigBehaviorCheck();
  reportOk('remote cache config parsing and quality workflow cache contract passed.');
}
