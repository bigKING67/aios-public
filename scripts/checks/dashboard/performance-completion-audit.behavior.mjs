#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = 'scripts/checks/dashboard/performance-completion-audit.mjs';
const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeText(filePath, source = 'ok\n') {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, source, 'utf8');
}

function writeJsonl(filePath, record) {
  writeText(filePath, `${JSON.stringify(record)}\n`);
}

function dashboardLatencyRecord({ cacheHit = true } = {}) {
  const serverTimingPhases = cacheHit ? { cache_hit: { p95: 12 } } : {};
  return {
    timestamp: new Date().toISOString(),
    status: 'pass',
    measuredSummary: {
      traffic: {
        durationMs: { p95: 100 },
        payloadBytes: { max: 1000 },
        serverTimingPhases,
      },
      traffic_goods: {
        durationMs: { p95: 120 },
        payloadBytes: { max: 2000 },
        serverTimingPhases,
      },
      goods: {
        durationMs: { p95: 90 },
        payloadBytes: { max: 800 },
        serverTimingPhases,
      },
    },
  };
}

function frontendSmokeRecord() {
  return {
    timestamp: new Date().toISOString(),
    status: 'pass',
    checked: 2,
    profile: {
      authenticated: true,
      performanceBudget: true,
    },
    results: [
      {
        route: '/dashboard?tab=douyin&dimension=live',
        status: 200,
      },
    ],
  };
}

function createPassingFixture({ cacheHit = true } = {}) {
  const root = makeTempDir('dashboard-performance-audit-');
  const latencyDir = path.join(root, 'latency');
  const frontendDir = path.join(root, 'frontend');
  const systemdDir = path.join(root, 'systemd');
  for (const name of ['latest.md', 'daily.md', 'weekly.md']) {
    writeText(path.join(latencyDir, name), `# ${name}\n`);
  }
  writeJsonl(path.join(latencyDir, 'history.jsonl'), dashboardLatencyRecord({ cacheHit }));
  writeJsonl(path.join(frontendDir, 'history.jsonl'), frontendSmokeRecord());
  writeText(path.join(frontendDir, 'latest.md'), '# Frontend smoke\n');
  writeText(path.join(systemdDir, 'aios-dashboard-latency-observation.service'), '[Service]\n');
  writeText(path.join(systemdDir, 'aios-dashboard-latency-observation.timer'), '[Timer]\n');
  return {
    root,
    latencyDir,
    frontendHistory: path.join(frontendDir, 'history.jsonl'),
    frontendReport: path.join(frontendDir, 'latest.md'),
    systemdDir,
  };
}

function runAudit(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function baseArgs(fixture) {
  return [
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    fixture.frontendHistory,
    '--frontend-smoke-report',
    fixture.frontendReport,
    '--systemd-unit-dir',
    fixture.systemdDir,
    '--max-age-hours',
    '24',
  ];
}

function testPassingAudit() {
  const fixture = createPassingFixture();
  const result = runAudit([...baseArgs(fixture), '--json']);
  assert.equal(result.status, 0, result.stderr);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.status, 'pass');
  assert.equal(audit.summary.failed, 0);
  assert.ok(audit.items.some((item) => item.id === 'dashboard-latency-systemd-timer'));
}

function testMissingFrontendEvidenceFails() {
  const fixture = createPassingFixture();
  const result = runAudit([
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    path.join(fixture.root, 'missing-history.jsonl'),
    '--frontend-smoke-report',
    fixture.frontendReport,
    '--systemd-unit-dir',
    fixture.systemdDir,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /frontend-auth-smoke-history-jsonl/);
  assert.match(result.stdout, /missing file/);
}

function testCacheHitRequirementCanBeDisabled() {
  const fixture = createPassingFixture({ cacheHit: false });
  const strictResult = runAudit([...baseArgs(fixture)]);
  assert.equal(strictResult.status, 1);
  assert.match(strictResult.stdout, /missing numeric cache_hit p95/);

  const coldResult = runAudit([...baseArgs(fixture), '--require-cache-hit', '0']);
  assert.equal(coldResult.status, 0, coldResult.stderr);
}

function testSkipSystemdAllowsLocalArtifactAudit() {
  const fixture = createPassingFixture();
  const result = runAudit([
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    fixture.frontendHistory,
    '--frontend-smoke-report',
    fixture.frontendReport,
    '--systemd-unit-dir',
    path.join(fixture.root, 'missing-systemd'),
    '--skip-systemd',
  ]);
  assert.equal(result.status, 0, result.stderr);
}

function testLocalArtifactsTargetAllowsMissingVpsSystemd() {
  const fixture = createPassingFixture();
  const result = runAudit([
    '--target',
    'local-artifacts',
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    fixture.frontendHistory,
    '--frontend-smoke-report',
    fixture.frontendReport,
    '--systemd-unit-dir',
    path.join(fixture.root, 'missing-systemd'),
    '--json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.options.target, 'local-artifacts');
  assert.equal(audit.options.skipSystemd, true);
  assert.ok(!audit.items.some((item) => item.id === 'dashboard-latency-systemd-service'));
  assert.ok(audit.items.some((item) => (
    item.id === 'dashboard-latency-systemd-scope'
    && item.evidence.includes('target=local-artifacts')
  )));
}

function testVpsRuntimeTargetRequiresSystemdByDefault() {
  const fixture = createPassingFixture();
  const result = runAudit([
    '--target',
    'vps-runtime',
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    fixture.frontendHistory,
    '--frontend-smoke-report',
    fixture.frontendReport,
    '--systemd-unit-dir',
    path.join(fixture.root, 'missing-systemd'),
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /dashboard-latency-systemd-service/);
  assert.match(result.stdout, /missing file/);
}

function testSkipFrontendSmokeAllowsBackendOnlyArtifactAudit() {
  const fixture = createPassingFixture();
  const result = runAudit([
    '--latency-artifact-dir',
    fixture.latencyDir,
    '--frontend-smoke-history',
    path.join(fixture.root, 'missing-history.jsonl'),
    '--frontend-smoke-report',
    path.join(fixture.root, 'missing-report.md'),
    '--systemd-unit-dir',
    fixture.systemdDir,
    '--skip-frontend-smoke',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /frontend-auth-smoke-history-jsonl/);
}

testPassingAudit();
testMissingFrontendEvidenceFails();
testCacheHitRequirementCanBeDisabled();
testSkipSystemdAllowsLocalArtifactAudit();
testLocalArtifactsTargetAllowsMissingVpsSystemd();
testVpsRuntimeTargetRequiresSystemdByDefault();
testSkipFrontendSmokeAllowsBackendOnlyArtifactAudit();

console.log('[dashboard-performance-completion-audit-behavior] OK');
