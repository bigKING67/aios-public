#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = 'scripts/ops/install-dashboard-api-latency-observation-systemd.sh';

function runScript(args, environment = process.env) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: environment,
  });
}

function assertSuccess(result, message) {
  assert.equal(result.status, 0, `${message}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function testHelp() {
  const result = runScript(['--help']);
  assertSuccess(result, 'help should succeed');
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--install/);
  assert.match(result.stdout, /--runtime-env-group/);
}

function testDryRunDoesNotWriteUnits() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-latency-systemd-dry-'));
  try {
    const result = runScript([
      '--dry-run',
      '--unit-dir',
      tmpDir,
      '--service-name',
      'aios-test-latency',
    ]);

    assertSuccess(result, 'dry-run should succeed');
    assert.match(result.stdout, /aios-test-latency\.service/);
    assert.match(result.stdout, /SupplementaryGroups=aios-runtime-env/);
    assert.match(result.stdout, /npm run verify:backend:dashboard-api-latency-observation/);
    assert.match(result.stdout, /manual observation command using the same base URL\/artifact dir/);
    assert.equal(existsSync(path.join(tmpDir, 'aios-test-latency.service')), false);
    assert.equal(existsSync(path.join(tmpDir, 'aios-test-latency.timer')), false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testWriteUnits() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-latency-systemd-write-'));
  try {
    const result = runScript([
      '--write',
      '--unit-dir',
      tmpDir,
      '--project-dir',
      '/opt/docker/compose/aios',
      '--service-name',
      'aios-test-latency',
      '--run-as-user',
      'sixseven',
      '--runtime-env-group',
      'fixture-runtime-env',
      '--env-file',
      '/opt/docker/compose/aios/.env.vps',
      '--base-url',
      'http://127.0.0.1:18000',
      '--artifact-dir',
      '/var/lib/aios/dashboard-api-latency',
      '--threshold-ms',
      '500',
      '--cache-hit-max-ms',
      '50',
      '--concurrency',
      '3',
      '--history-last',
      '20',
      '--on-calendar',
      '*:0/15',
      '--randomized-delay-sec',
      '2m',
    ]);

    assertSuccess(result, 'write should succeed');
    assert.match(result.stdout, /DASHBOARD_API_BASE_URL=http:\/\/127\.0\.0\.1:18000/);
    assert.match(result.stdout, /DASHBOARD_API_LATENCY_ARTIFACT_DIR=\/var\/lib\/aios\/dashboard-api-latency/);

    const servicePath = path.join(tmpDir, 'aios-test-latency.service');
    const timerPath = path.join(tmpDir, 'aios-test-latency.timer');
    const service = readFileSync(servicePath, 'utf8');
    const timer = readFileSync(timerPath, 'utf8');

    assert.match(service, /User=sixseven/);
    assert.match(service, /SupplementaryGroups=fixture-runtime-env/);
    assert.match(service, /EnvironmentFile=-\/opt\/docker\/compose\/aios\/\.env\.vps/);
    assert.match(service, /DASHBOARD_API_BASE_URL=http:\/\/127\.0\.0\.1:18000/);
    assert.match(service, /DASHBOARD_API_LATENCY_ARTIFACT_DIR=\/var\/lib\/aios\/dashboard-api-latency/);
    assert.match(service, /npm run verify:backend:dashboard-api-latency-observation/);
    assert.match(timer, /OnCalendar=\*:0\/15/);
    assert.match(timer, /RandomizedDelaySec=2m/);
    assert.match(timer, /Unit=aios-test-latency\.service/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testRejectsUnsafeServiceName() {
  const result = runScript(['--dry-run', '--service-name', 'bad name']);
  assert.notEqual(result.status, 0, 'unsafe service name should fail');
  assert.match(result.stderr, /safe systemd unit prefix/);
}

function testRejectsUnsafeRuntimeEnvGroup() {
  const result = runScript(['--dry-run', '--runtime-env-group', 'bad group']);
  assert.notEqual(result.status, 0, 'unsafe runtime env group should fail');
  assert.match(result.stderr, /safe system group name/);
}

function testInstallRejectsMissingRuntimeEnvGroupBeforeWrite() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-latency-systemd-group-'));
  const binDir = path.join(tmpDir, 'bin');
  const unitDir = path.join(tmpDir, 'units');
  try {
    mkdirSync(binDir);
    const getentPath = path.join(binDir, 'getent');
    writeFileSync(getentPath, '#!/usr/bin/env bash\nexit 2\n', 'utf8');
    chmodSync(getentPath, 0o755);

    const result = runScript(
      ['--install', '--unit-dir', unitDir, '--runtime-env-group', 'missing-runtime-env'],
      { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    );
    assert.notEqual(result.status, 0, 'install should reject a missing runtime env group');
    assert.match(result.stderr, /Missing shared runtime env group: missing-runtime-env/);
    assert.equal(existsSync(unitDir), false, 'group validation must happen before unit writes');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

testHelp();
testDryRunDoesNotWriteUnits();
testWriteUnits();
testRejectsUnsafeServiceName();
testRejectsUnsafeRuntimeEnvGroup();
testInstallRejectsMissingRuntimeEnvGroupBeforeWrite();

console.log('[dashboard-latency-systemd-behavior] OK');
