import os from 'node:os';
import { performance } from 'node:perf_hooks';

import {
  parseCommand,
  runShellCommand,
} from './quality-scheduler-command.mjs';
import {
  createSchedulerCacheState,
  flushQualityCacheContext,
  prepareSchedulerCachedExecution,
  writeSchedulerGateCache,
} from './quality-scheduler-cache.mjs';
import {
  blockedByFailedDependency,
  buildExecutionGraph,
  hasExclusiveRunning,
  sortReadyGates,
} from './quality-scheduler-graph.mjs';

export {
  formatFailure,
  summarizeResults,
} from './quality-scheduler-results.mjs';

export function defaultParallelism() {
  return Math.max(1, Math.min(os.cpus().length - 1, 6));
}

export async function runQualityGates(gates, options = {}) {
  const {
    cache = true,
    failFast = true,
    logger = null,
    parallel = defaultParallelism(),
    repoRoot = process.cwd(),
    verbose = false,
    commandRunner = runShellCommand,
  } = options;
  const startedAt = performance.now();
  const { pendingDeps, dependents, selectedByName } = buildExecutionGraph(gates);
  const { cacheContext, remoteCacheConfig } = createSchedulerCacheState({
    cache,
    env: options.env,
    repoRoot,
  });
  const completed = new Set();
  const failed = new Set();
  const running = new Set();
  const results = [];
  let stopped = false;

  function prepareGateExecution(gate) {
    const command = parseCommand(gate.command);
    return prepareSchedulerCachedExecution({
      cache,
      cacheContext,
      command,
      env: options.env,
      gate,
      remoteCacheConfig,
      repoRoot,
    });
  }

  async function executeGate(gate, prepared = null) {
    const { cacheInfo, command } = prepared ?? prepareGateExecution(gate);
    logger?.gateStart?.(gate);
    const commandResult = await commandRunner(command, {
      cwd: repoRoot,
      gate,
      env: options.env,
      verbose,
    });
    const result = {
      cacheHit: false,
      command,
      durationMs: commandResult.durationMs,
      exitCode: commandResult.exitCode,
      gate,
      status: commandResult.exitCode === 0 ? 'pass' : 'fail',
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
    };

    writeSchedulerGateCache({
      cacheInfo,
      env: options.env,
      gate,
      remoteCacheConfig,
      repoRoot,
      result,
    });
    logger?.gateDone?.(result);
    return result;
  }

  return new Promise((resolve) => {
    function finishIfDone() {
      const totalDone = completed.size + failed.size;
      if ((stopped || totalDone === gates.length) && running.size === 0) {
        flushQualityCacheContext(cacheContext);
        resolve({
          durationMs: Math.round(performance.now() - startedAt),
          results,
          status: failed.size > 0 ? 'fail' : 'pass',
        });
        return true;
      }
      return false;
    }

    function markComplete(gateName, result) {
      running.delete(gateName);
      results.push(result);
      if (result.status === 'pass') {
        completed.add(gateName);
        for (const dependentName of dependents.get(gateName) ?? []) {
          pendingDeps.get(dependentName)?.delete(gateName);
        }
      } else {
        failed.add(gateName);
        results.push(...blockedByFailedDependency(gateName, {
          dependents,
          failed,
          pendingDeps,
          selectedByName,
        }));
        if (failFast) {
          stopped = true;
        }
      }
    }

    function schedule() {
      if (finishIfDone() || stopped) {
        finishIfDone();
        return;
      }

      let shouldRescanReady = true;
      while (shouldRescanReady && !stopped && running.size < parallel) {
        shouldRescanReady = false;
        const ready = [];
        for (const [gateName, deps] of pendingDeps) {
          if (completed.has(gateName) || failed.has(gateName) || running.has(gateName)) {
            continue;
          }
          if (deps.size === 0) {
            ready.push(gateName);
          }
        }

        for (const gateName of sortReadyGates(ready, selectedByName)) {
          if (running.size >= parallel) {
            break;
          }
          const gate = selectedByName.get(gateName);
          if (!gate) {
            continue;
          }
          if (hasExclusiveRunning(running, selectedByName)) {
            break;
          }

          let prepared;
          try {
            prepared = prepareGateExecution(gate);
          } catch (error) {
            markComplete(gateName, {
              cacheHit: false,
              command: gate.command,
              durationMs: 0,
              exitCode: 1,
              gate,
              status: 'fail',
              stdout: '',
              stderr: error instanceof Error ? error.message : String(error),
            });
            shouldRescanReady = true;
            if (stopped) {
              break;
            }
            continue;
          }

          if (prepared.cachedResult) {
            logger?.gateDone?.(prepared.cachedResult);
            markComplete(gateName, prepared.cachedResult);
            shouldRescanReady = true;
            if (stopped) {
              break;
            }
            continue;
          }

          if (gate.parallel === false && running.size > 0) {
            continue;
          }
          running.add(gateName);
          executeGate(gate, prepared)
            .then((result) => {
              markComplete(gateName, result);
              schedule();
            })
            .catch((error) => {
              markComplete(gateName, {
                cacheHit: false,
                command: gate.command,
                durationMs: 0,
                exitCode: 1,
                gate,
                status: 'fail',
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
              });
              schedule();
            });
          if (gate.parallel === false) {
            break;
          }
        }
      }

      finishIfDone();
    }

    schedule();
  });
}
