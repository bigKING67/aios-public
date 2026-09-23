import process from 'node:process';

import {
  buildQualityGateRegistry,
  selectGatesByNames,
  validateQualityGateRegistry,
} from './quality-gate-registry.mjs';
import {
  runQualityGates,
} from './quality-scheduler.mjs';
import {
  printBenchmarkResult,
  makeLogger,
} from './quality-runner-output.mjs';
import {
  getRepoRoot,
} from './quality-runner-repo.mjs';
import {
  createGateEnv,
} from './quality-runner-selection.mjs';

function validateRegistryOrExit(registry, repoRoot) {
  const registryFindings = validateQualityGateRegistry(registry, { repoRoot });
  if (registryFindings.length > 0) {
    console.error('[quality] registry validation failed:');
    for (const finding of registryFindings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }
}

function benchmarkSummary(runs) {
  const durations = runs.map((run) => run.durationMs);
  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  const failed = runs.filter((run) => run.status !== 'pass').length;
  return {
    avgMs: runs.length === 0 ? 0 : Math.round(totalDurationMs / runs.length),
    failed,
    maxMs: runs.length === 0 ? 0 : Math.max(...durations),
    minMs: runs.length === 0 ? 0 : Math.min(...durations),
    passed: runs.length - failed,
    runs: runs.length,
    status: failed > 0 ? 'fail' : 'pass',
    totalDurationMs,
  };
}

function benchmarkOutputPreview(value, maxLength = 1200) {
  const text = String(value ?? '').trimEnd();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n... truncated ${text.length - maxLength} chars`;
}

export async function runBenchmarkGate(gateName, options = {}) {
  const repoRoot = getRepoRoot();
  const runs = options.runs ?? 1;
  const registry = buildQualityGateRegistry({ repoRoot });
  validateRegistryOrExit(registry, repoRoot);

  const { gates, missing } = selectGatesByNames(registry, [gateName], { includeDeps: false });
  if (!gateName || missing.length > 0 || gates.length !== 1) {
    console.error(`[quality] unknown benchmark gate: ${gateName ?? '(missing)'}`);
    process.exit(1);
  }

  const gate = gates[0];
  if (!options.json) {
    console.log(`[quality] benchmark gate=${gate.name} runs=${runs} cache=off parallel=1`);
    console.log(`[quality] command: ${gate.command}`);
  }

  const benchmarkRuns = [];
  for (let index = 0; index < runs; index += 1) {
    if (!options.json) {
      console.log(`[benchmark] run=${index + 1}/${runs}`);
    }
    const result = await runQualityGates([gate], {
      cache: false,
      commandRunner: options.commandRunner,
      env: {
        ...createGateEnv([]),
        AIOS_QUALITY_BENCHMARK: '1',
      },
      logger: makeLogger({ ...options, summaryOnly: true }),
      parallel: 1,
      repoRoot,
      verbose: options.verbose,
    });
    const gateResult = result.results[0];
    const stdout = gateResult?.stdout ?? '';
    const stderr = gateResult?.stderr ?? '';
    const status = gateResult?.status ?? result.status;
    benchmarkRuns.push({
      durationMs: gateResult?.durationMs ?? result.durationMs,
      exitCode: gateResult?.exitCode ?? 1,
      run: index + 1,
      status,
      stderrBytes: Buffer.byteLength(stderr),
      ...(status === 'pass' || !stderr ? {} : { stderrPreview: benchmarkOutputPreview(stderr) }),
      stdoutBytes: Buffer.byteLength(stdout),
    });
  }

  const event = {
    cache: {
      enabled: false,
      reason: 'benchmark disables result cache to avoid cache-hit timing noise',
    },
    gate: {
      cacheable: gate.cacheable,
      command: gate.command,
      cost: gate.cost,
      group: gate.group,
      name: gate.name,
      parallel: gate.parallel !== false,
    },
    parallel: 1,
    runs: benchmarkRuns,
    summary: benchmarkSummary(benchmarkRuns),
    timestamp: new Date().toISOString(),
  };

  if (options.json) {
    console.log(JSON.stringify(event, null, 2));
  } else {
    printBenchmarkResult(event);
    for (const failedRun of benchmarkRuns.filter((run) => run.status !== 'pass')) {
      console.error(`[benchmark] failed run=${failedRun.run} exitCode=${failedRun.exitCode}`);
      if (failedRun.stderrPreview) {
        console.error(failedRun.stderrPreview);
      }
    }
  }

  if (event.summary.status !== 'pass') {
    process.exit(1);
  }

  return event;
}
