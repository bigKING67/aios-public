#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  benchmarkGate,
} from '../../quality-runner.mjs';
import {
  parseArgs,
} from '../../lib/quality/quality-runner-args.mjs';
import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';

const {
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-benchmark');

async function captureStdout(callback) {
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
    await callback();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return output;
}

function fakeCommandRunner(durations) {
  let index = 0;
  return async (command, options = {}) => {
    const durationMs = durations[index] ?? durations.at(-1) ?? 1;
    index += 1;
    assertEqual(
      command,
      'node scripts/checks/quality-runner/entrypoint.mjs',
      'benchmark should execute the selected gate command directly',
    );
    assertEqual(options.env?.AIOS_QUALITY_BENCHMARK, '1', 'benchmark env marker should be present');
    return {
      durationMs,
      exitCode: 0,
      stderr: '',
      stdout: '',
    };
  };
}

export async function runQualityRunnerBenchmarkBehaviorCheck(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();

  {
    const parsed = parseArgs(['benchmark', 'verify:quality-runner:entrypoint', '--runs', '3', '--json']);
    assertDeepEqual(
      parsed.positionals,
      ['benchmark', 'verify:quality-runner:entrypoint'],
      'benchmark command should preserve command and gate positionals',
    );
    assertEqual(parsed.options.runs, 3, 'benchmark --runs should parse requested run count');
    assertTrue(parsed.options.json, 'benchmark --json should parse as JSON output');
  }

  {
    let threw = false;
    try {
      parseArgs(['benchmark', 'verify:quality-runner:entrypoint', '--runs', '11']);
    } catch (error) {
      threw = true;
      assertIncludes(
        error instanceof Error ? error.message : String(error),
        '--runs must be an integer between 1 and 10',
        'benchmark should cap run count to keep diagnostics bounded',
      );
    }
    assertTrue(threw, 'benchmark --runs above the cap should fail argument parsing');
  }

  {
    const stdout = await captureStdout(() => benchmarkGate('verify:quality-runner:entrypoint', {
      commandRunner: fakeCommandRunner([12, 18]),
      json: true,
      runs: 2,
    }));
    const payload = JSON.parse(stdout);
    assertEqual(payload.gate.name, 'verify:quality-runner:entrypoint', 'JSON output should include selected gate');
    assertEqual(payload.gate.command, 'node scripts/checks/quality-runner/entrypoint.mjs', 'JSON output should include command');
    assertFalse(payload.cache.enabled, 'benchmark JSON should explicitly show cache disabled');
    assertEqual(payload.parallel, 1, 'benchmark should run one gate at a time');
    assertEqual(payload.summary.runs, 2, 'benchmark summary should include run count');
    assertEqual(payload.summary.minMs, 12, 'benchmark summary should include min duration');
    assertEqual(payload.summary.avgMs, 15, 'benchmark summary should include rounded average duration');
    assertEqual(payload.summary.maxMs, 18, 'benchmark summary should include max duration');
    assertEqual(payload.summary.status, 'pass', 'benchmark summary should pass when all runs pass');
  }

  {
    const stdout = await captureStdout(() => benchmarkGate('verify:quality-runner:entrypoint', {
      commandRunner: fakeCommandRunner([9]),
      json: false,
      runs: 1,
    }));
    assertIncludes(stdout, '[quality] benchmark gate=verify:quality-runner:entrypoint runs=1 cache=off parallel=1', 'text output should announce benchmark scope');
    assertIncludes(stdout, '[benchmark summary] gate=verify:quality-runner:entrypoint runs=1 passed=1 failed=0 min=9ms avg=9ms max=9ms cache=off', 'text output should include summary');
    assertIncludes(stdout, 'suspect scheduler window or stale history', 'text output should guide slow-gate triage');
  }

  {
    const entrypointSource = readFileSync(path.join(repoRoot, 'scripts/quality-runner.mjs'), 'utf8');
    const actionsSource = readFileSync(path.join(repoRoot, 'scripts/lib/quality/quality-runner-actions.mjs'), 'utf8');
    const benchmarkBody = actionsSource.slice(
      actionsSource.indexOf('export async function benchmarkGate'),
      actionsSource.indexOf('export function listMode'),
    );
    assertIncludes(entrypointSource, "command === 'benchmark' || command === 'bench'", 'CLI should route benchmark and bench aliases');
    assertFalse(benchmarkBody.includes('appendQualityEvent'), 'benchmark should not append stats events or pollute quality history');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerBenchmarkBehaviorCheck();
  reportOk('benchmark CLI parsing, bounded runs, cache-off execution, output, and no-event-pollution checks passed.');
}
