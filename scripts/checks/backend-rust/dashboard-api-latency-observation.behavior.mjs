#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const SCRIPT = 'scripts/checks/backend-rust/run-dashboard-api-latency-observation.sh';

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeFakeNode(binDir) {
  mkdirSync(binDir, { recursive: true });
  const fakeNodePath = path.join(binDir, 'node');
  writeFileSync(fakeNodePath, `#!/usr/bin/env bash
set -euo pipefail

target="\${1:-}"
shift || true
log_file="\${FAKE_DASHBOARD_LATENCY_NODE_LOG:?}"

printf '%s\\0' "\${target}" "$@" >> "\${log_file}"
printf '\\n' >> "\${log_file}"

read_arg() {
  local name="$1"
  shift
  while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == "\${name}" ]]; then
      printf '%s' "\${2:-}"
      return 0
    fi
    shift
  done
  return 1
}

case "\${target}" in
  scripts/checks/backend-rust/dashboard-api-latency-smoke.mjs)
    output_json="$(read_arg --output-json "$@" || true)"
    history_jsonl="$(read_arg --history-jsonl "$@" || true)"
    if [[ -n "\${output_json}" ]]; then
      mkdir -p "$(dirname "\${output_json}")"
      printf '{"status":"pass","source":"fake-smoke"}\\n' > "\${output_json}"
    fi
    if [[ -n "\${history_jsonl}" ]]; then
      mkdir -p "$(dirname "\${history_jsonl}")"
      printf '{"timestamp":"2026-05-21T00:00:00.000Z","status":"pass","measuredSummary":{"traffic":{"durationMs":{"p95":100},"serverTimingPhases":{"cache_hit":{"p95":10}}},"traffic_goods":{"durationMs":{"p95":120},"serverTimingPhases":{"cache_hit":{"p95":11}}},"goods":{"durationMs":{"p95":90},"serverTimingPhases":{"cache_hit":{"p95":9}}}}}\\n' >> "\${history_jsonl}"
    fi
    if [[ "\${FAKE_DASHBOARD_LATENCY_FAIL_SMOKE:-0}" == "1" ]]; then
      exit 21
    fi
    ;;
  scripts/checks/backend-rust/dashboard-api-latency-history.mjs)
    if [[ "\${FAKE_DASHBOARD_LATENCY_FAIL_HISTORY:-0}" == "1" ]]; then
      exit 22
    fi
    ;;
  scripts/checks/backend-rust/dashboard-api-latency-history-report.mjs)
    output_md="$(read_arg --output-md "$@" || true)"
    if [[ -n "\${output_md}" ]]; then
      mkdir -p "$(dirname "\${output_md}")"
      printf '# Fake Dashboard API Latency Report\\n\\n- Status: \`pass\`\\n' > "\${output_md}"
    fi
    if [[ "\${FAKE_DASHBOARD_LATENCY_FAIL_REPORT:-0}" == "1" ]]; then
      exit 23
    fi
    ;;
  scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs)
    output_md="$(read_arg --output-md "$@" || true)"
    if [[ -n "\${output_md}" ]]; then
      mkdir -p "$(dirname "\${output_md}")"
      printf '# Fake Dashboard API Latency Rollup\\n\\n- Status: \`pass\`\\n' > "\${output_md}"
    fi
    if [[ "\${FAKE_DASHBOARD_LATENCY_FAIL_ROLLUP:-0}" == "1" ]]; then
      exit 24
    fi
    ;;
  *)
    echo "unexpected fake node target: \${target}" >&2
    exit 99
    ;;
esac
`, 'utf8');
  chmodSync(fakeNodePath, 0o755);
}

function runObservation({
  artifactDir,
  extraEnv = {},
} = {}) {
  const tmpDir = makeTempDir('dashboard-api-latency-observation-');
  const binDir = path.join(tmpDir, 'bin');
  const logFile = path.join(tmpDir, 'node.log');
  const targetArtifactDir = artifactDir ?? path.join(tmpDir, 'artifacts');

  writeFakeNode(binDir);

  const result = spawnSync('bash', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_DASHBOARD_LATENCY_NODE_LOG: logFile,
      DASHBOARD_API_BASE_URL: 'http://127.0.0.1:18080',
      DASHBOARD_API_LATENCY_ARTIFACT_DIR: targetArtifactDir,
      DASHBOARD_API_LATENCY_THRESHOLD_MS: '321',
      DASHBOARD_API_LATENCY_CACHE_HIT_MAX_MS: '17',
      DASHBOARD_API_LATENCY_PAYLOAD_MAX_KB: '456',
      DASHBOARD_API_LATENCY_HISTORY_LAST: '7',
      DASHBOARD_API_LATENCY_ENDPOINTS: 'traffic goods',
      ...extraEnv,
    },
  });

  return {
    ...result,
    artifactDir: targetArtifactDir,
    logFile,
    tmpDir,
  };
}

function readCommandLog(logFile) {
  return readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\0'));
}

function assertSuccessfulObservationWritesLatestArtifacts() {
  const result = runObservation();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[dashboard-api-latency-observation\] pass/);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.json')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'daily.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'weekly.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'history.jsonl')), true);

  const latestJson = readFileSync(path.join(result.artifactDir, 'latest.json'), 'utf8');
  const latestMd = readFileSync(path.join(result.artifactDir, 'latest.md'), 'utf8');
  const dailyMd = readFileSync(path.join(result.artifactDir, 'daily.md'), 'utf8');
  const weeklyMd = readFileSync(path.join(result.artifactDir, 'weekly.md'), 'utf8');
  const history = readFileSync(path.join(result.artifactDir, 'history.jsonl'), 'utf8').trim().split('\n');

  assert.match(latestJson, /"source":"fake-smoke"/);
  assert.match(latestMd, /Fake Dashboard API Latency Report/);
  assert.match(dailyMd, /Fake Dashboard API Latency Rollup/);
  assert.match(weeklyMd, /Fake Dashboard API Latency Rollup/);
  assert.equal(history.length, 1);
}

function assertObservationPassesBudgetsToHistoryAndReport() {
  const result = runObservation();
  assert.equal(result.status, 0, result.stderr);

  const commands = readCommandLog(result.logFile);
  const smokeCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-smoke.mjs'));
  const historyCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-history.mjs'));
  const reportCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-history-report.mjs'));
  const rollupCommands = commands.filter(([target]) => target.endsWith('dashboard-api-latency-history-rollup.mjs'));

  assert.ok(smokeCommand, 'latency smoke command should run');
  assert.ok(historyCommand, 'history analyzer command should run');
  assert.ok(reportCommand, 'markdown report command should run');
  assert.equal(rollupCommands.length, 2, 'daily and weekly rollup commands should run');
  assert.deepEqual(
    historyCommand.filter((value) => value === '--fail-on-p95').length,
    2,
    'history analyzer should receive one p95 budget per configured endpoint',
  );
  assert.ok(smokeCommand.includes('--require-server-timing-phase'));
  assert.ok(smokeCommand.includes('cache_hit'));
  assert.ok(smokeCommand.includes('--max-server-timing-phase'));
  assert.ok(smokeCommand.includes('cache_hit:17'));
  assert.ok(historyCommand.includes('traffic:321'));
  assert.ok(historyCommand.includes('goods:321'));
  assert.ok(historyCommand.includes('traffic:17'));
  assert.ok(historyCommand.includes('goods:17'));
  assert.ok(smokeCommand.includes('traffic:456'));
  assert.ok(smokeCommand.includes('goods:456'));
  assert.ok(historyCommand.includes('traffic:456'));
  assert.ok(historyCommand.includes('goods:456'));
  assert.ok(reportCommand.includes('traffic:321'));
  assert.ok(reportCommand.includes('goods:321'));
  assert.ok(reportCommand.includes('traffic:17'));
  assert.ok(reportCommand.includes('goods:17'));
  assert.ok(reportCommand.includes('traffic:456'));
  assert.ok(reportCommand.includes('goods:456'));
  assert.ok(rollupCommands.some((command) => command.includes('--period') && command.includes('day')));
  assert.ok(rollupCommands.some((command) => command.includes('--period') && command.includes('week')));
  for (const rollupCommand of rollupCommands) {
    assert.ok(rollupCommand.includes('traffic:321'));
    assert.ok(rollupCommand.includes('goods:321'));
    assert.ok(rollupCommand.includes('traffic:17'));
    assert.ok(rollupCommand.includes('goods:17'));
    assert.ok(rollupCommand.includes('traffic:456'));
    assert.ok(rollupCommand.includes('goods:456'));
  }
}

function assertCacheHitRequirementCanBeDisabledForColdPathObservation() {
  const result = runObservation({
    extraEnv: {
      DASHBOARD_API_LATENCY_REQUIRE_CACHE_HIT: '0',
    },
  });
  assert.equal(result.status, 0, result.stderr);

  const commands = readCommandLog(result.logFile);
  const smokeCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-smoke.mjs'));
  const historyCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-history.mjs'));
  const reportCommand = commands.find(([target]) => target.endsWith('dashboard-api-latency-history-report.mjs'));
  const rollupCommands = commands.filter(([target]) => target.endsWith('dashboard-api-latency-history-rollup.mjs'));

  assert.ok(smokeCommand, 'latency smoke command should run');
  assert.ok(historyCommand, 'history analyzer command should run');
  assert.ok(reportCommand, 'markdown report command should run');
  assert.equal(rollupCommands.length, 2, 'daily and weekly rollup commands should run');
  assert.equal(smokeCommand.includes('--require-server-timing-phase'), false);
  assert.equal(smokeCommand.includes('--max-server-timing-phase'), false);
  assert.equal(historyCommand.includes('--fail-on-cache-hit-p95'), false);
  assert.equal(reportCommand.includes('--fail-on-cache-hit-p95'), false);
  for (const rollupCommand of rollupCommands) {
    assert.equal(rollupCommand.includes('--fail-on-cache-hit-p95'), false);
  }
  assert.ok(smokeCommand.includes('traffic:456'));
  assert.ok(historyCommand.includes('traffic:321'));
  assert.ok(reportCommand.includes('goods:456'));
}

function assertTimestampedReportsArePruned() {
  const tmpDir = makeTempDir('dashboard-api-latency-prune-');
  const artifactDir = path.join(tmpDir, 'artifacts');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(artifactDir, 'report-20000101T000000Z.json'), '{"old":true}\n');
  writeFileSync(path.join(artifactDir, 'report-20000101T000000Z.md'), '# old\n');
  writeFileSync(path.join(artifactDir, 'report-20010101T000000Z.json'), '{"older":true}\n');
  writeFileSync(path.join(artifactDir, 'report-20010101T000000Z.md'), '# older\n');

  const result = runObservation({
    artifactDir,
    extraEnv: {
      DASHBOARD_API_LATENCY_REPORT_KEEP: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);

  const jsonReports = readdirSync(artifactDir)
    .filter((file) => /^report-.*\.json$/u.test(file))
    .sort();
  const mdReports = readdirSync(artifactDir)
    .filter((file) => /^report-.*\.md$/u.test(file))
    .sort();

  assert.equal(jsonReports.length, 1, 'observation should retain only the newest JSON report');
  assert.equal(mdReports.length, 1, 'observation should retain only the newest markdown report');
  assert.match(jsonReports[0], /^report-20/u);
  assert.match(mdReports[0], /^report-20/u);
  assert.match(result.stdout, /prunedReports=4 keep=1/);
}

function assertFailureStatusPropagatesAfterArtifactsAreAttempted() {
  const result = runObservation({
    extraEnv: {
      FAKE_DASHBOARD_LATENCY_FAIL_HISTORY: '1',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail smoke_status=0 history_status=22 report_status=0 rollup_daily_status=0 rollup_weekly_status=0/);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.json')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'daily.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'weekly.md')), true);
}

function assertRollupFailureStatusPropagates() {
  const result = runObservation({
    extraEnv: {
      FAKE_DASHBOARD_LATENCY_FAIL_ROLLUP: '1',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fail smoke_status=0 history_status=0 report_status=0 rollup_daily_status=24 rollup_weekly_status=24/);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.json')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'latest.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'daily.md')), true);
  assert.equal(existsSync(path.join(result.artifactDir, 'weekly.md')), true);
}

function assertHelpDocumentsEvidenceArtifacts() {
  const result = spawnSync('bash', [SCRIPT, '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /latest\.json/);
  assert.match(result.stdout, /latest\.md/);
  assert.match(result.stdout, /daily\.md/);
  assert.match(result.stdout, /weekly\.md/);
  assert.match(result.stdout, /history\.jsonl/);
  assert.match(result.stdout, /DASHBOARD_API_LATENCY_ARTIFACT_DIR/);
  assert.match(result.stdout, /DASHBOARD_API_LATENCY_PAYLOAD_MAX_KB/);
  assert.match(result.stdout, /DASHBOARD_API_LATENCY_ROLLUP_DAYS/);
  assert.match(result.stdout, /DASHBOARD_API_LATENCY_ROLLUP_WEEKS/);
}

assertHelpDocumentsEvidenceArtifacts();
assertSuccessfulObservationWritesLatestArtifacts();
assertObservationPassesBudgetsToHistoryAndReport();
assertCacheHitRequirementCanBeDisabledForColdPathObservation();
assertTimestampedReportsArePruned();
assertFailureStatusPropagatesAfterArtifactsAreAttempted();
assertRollupFailureStatusPropagates();

console.log('[dashboard-api-latency-observation-behavior] OK');
