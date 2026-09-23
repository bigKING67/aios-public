import {
  isFreshPassingRemoteCacheHealth,
} from './quality-runner-remote-cache-health.mjs';
import {
  remoteCacheActivationForHealth,
} from './quality-runner-remote-cache.mjs';
import {
  budgetForCategory,
  budgetStatus,
  categoryForGate,
  recommendationFor,
} from './quality-stats-categories.mjs';
import {
  analyzeQualityStatsTargetFiles,
  commandKind,
  commandTargetFiles,
} from './quality-stats-target-signals.mjs';

export {
  qualityStatsTargetFileSignalCacheSizeForTests,
  resetQualityStatsTargetFileSignalCacheForTests,
} from './quality-stats-target-signals.mjs';

function diagnoseSampleHealth(item, budget, status) {
  if (status !== 'warn') {
    return {
      reason: 'latest cold sample is within the current category budget',
      status: 'current',
    };
  }
  const latestDurationMs = item.lastDurationMs ?? null;
  if (
    item.lastCacheHit === true
    && latestDurationMs !== null
    && latestDurationMs <= budget.warnMaxMs
    && latestDurationMs <= budget.warnAvgMs
  ) {
    return {
      coldMaxMs: item.coldMaxMs ?? 0,
      lastCacheHit: true,
      lastColdDurationMs: item.lastColdDurationMs ?? null,
      lastColdTimestamp: item.lastColdTimestamp ?? null,
      lastDurationMs: latestDurationMs,
      lastSeenTimestamp: item.lastSeenTimestamp ?? null,
      reason: 'latest observation is a cache hit within budget; old cold max is retained for history but excluded from next actions',
      status: 'cache-recovered',
      warnAvgMs: budget.warnAvgMs,
      warnMaxMs: budget.warnMaxMs,
    };
  }
  const lastColdDurationMs = item.lastColdDurationMs ?? null;
  if (lastColdDurationMs === null) {
    return {
      reason: 'no cold sample is available to compare against the rolling maximum',
      status: 'unknown',
    };
  }
  const coldMaxMs = item.coldMaxMs ?? 0;
  const latestWithinBudget = (
    lastColdDurationMs <= budget.warnMaxMs
    && lastColdDurationMs <= budget.warnAvgMs
  );
  const latestMuchLowerThanMax = coldMaxMs > 0 && lastColdDurationMs <= Math.max(1, Math.floor(coldMaxMs * 0.5));
  if (latestWithinBudget && latestMuchLowerThanMax) {
    return {
      coldMaxMs,
      lastColdDurationMs,
      lastColdTimestamp: item.lastColdTimestamp ?? null,
      lastSeenTimestamp: item.lastSeenTimestamp ?? null,
      reason: 'latest cold sample is back within budget; old rolling max is retained for history but excluded from next actions',
      status: 'stale-max',
      warnAvgMs: budget.warnAvgMs,
      warnMaxMs: budget.warnMaxMs,
    };
  }
  return {
    coldMaxMs,
    lastColdDurationMs,
    lastColdTimestamp: item.lastColdTimestamp ?? null,
    lastSeenTimestamp: item.lastSeenTimestamp ?? null,
    reason: 'latest cold sample still supports the rolling budget warning',
    status: 'current',
    warnAvgMs: budget.warnAvgMs,
    warnMaxMs: budget.warnMaxMs,
  };
}

function isHistoricalBudgetWarning(item) {
  return item.sampleHealth?.status === 'stale-max'
    || item.sampleHealth?.status === 'cache-recovered';
}

function currentFactorDurationMs(item) {
  if (item.sampleHealth?.status === 'cache-recovered') {
    return item.sampleHealth.lastDurationMs ?? 0;
  }
  return item.lastColdDurationMs ?? 0;
}

function compatibilityRank(category) {
  return category === 'compatibility-slice' ? 1 : 0;
}

function compareGateStatsByCurrentCold(left, right) {
  return compatibilityRank(left.item.category) - compatibilityRank(right.item.category)
    || (right.item.lastColdDurationMs ?? -1) - (left.item.lastColdDurationMs ?? -1)
    || left.index - right.index;
}

function compareGateStatsByColdMax(left, right) {
  return compatibilityRank(left.item.category) - compatibilityRank(right.item.category)
    || (right.item.coldMaxMs ?? -1) - (left.item.coldMaxMs ?? -1)
    || left.index - right.index;
}

function sortGateStatsItems(items, compare) {
  return items
    .map((item, index) => ({ item, index }))
    .sort(compare)
    .map(({ item }) => item);
}

function diagnoseCacheHealth(item, gate) {
  const gateInputHealth = inputHealth(gate);
  if (!gate?.cacheable) {
    return {
      action: 'keep-uncached',
      reason: 'gate is explicitly non-cacheable; optimize cold execution or split deterministic sub-steps instead',
      severity: 'info',
    };
  }

  const cacheHitRate = item.cacheHitRate ?? 0;
  const coldCount = item.coldCount ?? 0;
  const coldAvgMs = item.coldAvgMs ?? 0;
  if (gate.name === 'verify:ci:release-version-bump') {
    return {
      action: 'intentional-cold',
      reason: 'release governance guard is pushed-base/head sensitive and cheap; avoid weakening cache identity for this path',
      severity: 'info',
    };
  }
  if (cacheHitRate < 0.35 && coldCount >= 3) {
    return {
      action: gateInputHealth.status === 'broad' ? 'narrow-inputs' : 'inspect-cache-key',
      reason: gateInputHealth.status === 'broad'
        ? 'low cache hit rate with broad inputs; split named inputs or remove unrelated glob surfaces'
        : 'low cache hit rate; inspect env/tool/version/input drift before changing coverage',
      severity: coldAvgMs > 1000 ? 'warn' : 'info',
    };
  }
  if (cacheHitRate >= 0.8 && coldCount > 0 && coldAvgMs > 1000) {
    return {
      action: 'defer-warm-gate',
      reason: 'warm path is healthy; optimize colder or lower-hit gates first',
      severity: 'info',
    };
  }
  return {
    action: 'monitor',
    reason: 'cache behavior is within the current local tuning budget',
    severity: 'info',
  };
}

function inputHealth(gate) {
  const inputs = gate?.inputs ?? [];
  const broadInputs = inputs.filter((input) => (
    input === 'apps/web-vite/src/**'
    || input === 'apps/**'
    || input === 'scripts/**'
  ));
  return {
    broadInputs,
    inputCount: inputs.length,
    status: broadInputs.length > 0 ? 'broad' : 'ok',
  };
}

function benchmarkCommandForGate(gateName) {
  return `node scripts/quality-runner.mjs benchmark ${gateName} --runs 3`;
}

function remoteCacheDoctorCommand(remoteCache) {
  if (remoteCache?.status === 'off') {
    return 'node scripts/quality-runner.mjs remote-cache doctor --remote-cache-path ~/.cache/aios-quality-remote --remote-cache-mode readwrite';
  }
  return 'node scripts/quality-runner.mjs remote-cache doctor';
}

function remoteCacheSmokeCommand(remoteCache) {
  if (remoteCache?.status === 'off') {
    return 'node scripts/quality-runner.mjs remote-cache smoke --remote-cache-path ~/.cache/aios-quality-remote --json';
  }
  return 'node scripts/quality-runner.mjs remote-cache smoke --json';
}

function remoteCacheSetupCommand(remoteCache) {
  if (remoteCache?.status === 'off') {
    return 'node scripts/quality-runner.mjs remote-cache setup --remote-cache-path ~/.cache/aios-quality-remote --json';
  }
  return 'node scripts/quality-runner.mjs remote-cache setup --json';
}

function compactRemoteCacheHealth(health) {
  if (!health || health.status === 'missing') {
    return null;
  }
  return {
    ageMinutes: health.ageMinutes ?? null,
    command: health.command ?? null,
    freshness: health.freshness ?? null,
    matchesRemote: health.matchesRemote === true,
    status: health.status ?? 'unknown',
  };
}

export function remoteCacheStatsActions(remoteCache, stats = {}) {
  const remoteHits = stats.cacheSources?.remote ?? 0;
  const remoteCacheHealth = stats.remoteCacheHealth ?? null;
  if (!remoteCache?.enabled) {
    const activation = remoteCacheActivationForHealth(remoteCacheHealth, { mode: 'read' });
    if (activation) {
      const publishActivation = remoteCacheActivationForHealth(remoteCacheHealth, { mode: 'readwrite' });
      return [{
        action: 'enable-remote-cache-env',
        activateCommand: activation.activateCommand,
        doctorCommand: activation.doctorCommand,
        envCommand: activation.envCommand,
        health: compactRemoteCacheHealth(remoteCacheHealth),
        publishActivateCommand: publishActivation?.activateCommand ?? null,
        publishEnvCommand: publishActivation?.envCommand ?? null,
        reason: 'remote cache has fresh passing setup/smoke health; run/prepush can auto-activate it read-only, export read env for explicit stats/manual runs, and use readwrite only when publishing pass-only results',
        remoteHits,
        runAutoActivation: true,
        severity: 'info',
        setupCommand: publishActivation?.setupCommand ?? activation.setupCommand,
        smokeCommand: activation.smokeCommand,
      }];
    }
    return [{
      action: 'configure-remote-cache',
      doctorCommand: remoteCacheDoctorCommand(remoteCache),
      reason: 'remote cache is disabled; run setup to create a shared file cache and prove result/artifact hits with smoke',
      remoteHits,
      severity: 'info',
      setupCommand: remoteCacheSetupCommand(remoteCache),
      smokeCommand: remoteCacheSmokeCommand(remoteCache),
    }];
  }
  if (!remoteCache.usable) {
    return [{
      action: 'repair-remote-cache',
      doctorCommand: remoteCacheDoctorCommand(remoteCache),
      reason: remoteCache.reason ?? `remote cache status is ${remoteCache.status}`,
      remoteHits,
      severity: 'warn',
      setupCommand: remoteCacheSetupCommand(remoteCache),
      smokeCommand: remoteCacheSmokeCommand(remoteCache),
    }];
  }
  if (remoteHits === 0) {
    if (isFreshPassingRemoteCacheHealth(remoteCacheHealth)) {
      return [{
        action: 'monitor-remote-cache',
        doctorCommand: remoteCacheDoctorCommand(remoteCache),
        health: compactRemoteCacheHealth(remoteCacheHealth),
        reason: 'remote cache is configured and recent smoke/setup health is fresh; wait for cross-workspace runs before tuning remote hit rate',
        remoteHits,
        severity: 'info',
        setupCommand: remoteCacheSetupCommand(remoteCache),
        smokeCommand: remoteCacheSmokeCommand(remoteCache),
      }];
    }
    if (remoteCacheHealth?.matchesRemote === true && remoteCacheHealth.status !== 'pass') {
      return [{
        action: 'repair-remote-cache',
        doctorCommand: remoteCacheDoctorCommand(remoteCache),
        health: compactRemoteCacheHealth(remoteCacheHealth),
        reason: `latest remote cache ${remoteCacheHealth.command ?? 'health'} check status is ${remoteCacheHealth.status}; diagnose before relying on shared cache`,
        remoteHits,
        severity: 'warn',
        setupCommand: remoteCacheSetupCommand(remoteCache),
        smokeCommand: remoteCacheSmokeCommand(remoteCache),
      }];
    }
    if (remoteCacheHealth?.matchesRemote === true && remoteCacheHealth.freshness === 'stale') {
      return [{
        action: 'verify-remote-hit',
        doctorCommand: remoteCacheDoctorCommand(remoteCache),
        health: compactRemoteCacheHealth(remoteCacheHealth),
        reason: `remote cache health is stale (${remoteCacheHealth.ageMinutes ?? 'unknown'}m old); rerun smoke before relying on cross-workspace speedups`,
        remoteHits,
        severity: 'warn',
        setupCommand: remoteCacheSetupCommand(remoteCache),
        smokeCommand: remoteCacheSmokeCommand(remoteCache),
      }];
    }
    if (remoteCacheHealth?.matchesRemote === true && remoteCacheHealth.freshness === 'invalid') {
      return [{
        action: 'verify-remote-hit',
        doctorCommand: remoteCacheDoctorCommand(remoteCache),
        health: compactRemoteCacheHealth(remoteCacheHealth),
        reason: 'remote cache health timestamp is invalid; rerun smoke to refresh the health signal',
        remoteHits,
        severity: 'warn',
        setupCommand: remoteCacheSetupCommand(remoteCache),
        smokeCommand: remoteCacheSmokeCommand(remoteCache),
      }];
    }
    return [{
      action: 'verify-remote-hit',
      doctorCommand: remoteCacheDoctorCommand(remoteCache),
      reason: 'remote cache is configured but recent stats have zero remote hits; run smoke before relying on cross-workspace speedups',
      remoteHits,
      severity: 'info',
      setupCommand: remoteCacheSetupCommand(remoteCache),
      smokeCommand: remoteCacheSmokeCommand(remoteCache),
    }];
  }
  return [{
    action: 'monitor-remote-cache',
    doctorCommand: remoteCacheDoctorCommand(remoteCache),
    reason: 'remote cache is configured and recent stats include remote hits',
    remoteHits,
    severity: 'info',
    setupCommand: remoteCacheSetupCommand(remoteCache),
    smokeCommand: remoteCacheSmokeCommand(remoteCache),
  }];
}

function remoteCacheActionPriority(action) {
  if (action === 'repair-remote-cache') {
    return 5;
  }
  if (action === 'enable-remote-cache-env') {
    return 8;
  }
  if (action === 'configure-remote-cache') {
    return 10;
  }
  if (action === 'verify-remote-hit') {
    return 15;
  }
  return 90;
}

function remoteCacheActionCommands(item) {
  if (item.action === 'enable-remote-cache-env') {
    return [
      item.envCommand,
      item.activateCommand,
      item.publishEnvCommand,
      item.publishActivateCommand,
      item.smokeCommand,
      item.doctorCommand,
      item.setupCommand,
    ].filter(Boolean);
  }
  if (item.action === 'configure-remote-cache') {
    return [item.setupCommand, item.doctorCommand, item.smokeCommand].filter(Boolean);
  }
  if (item.action === 'verify-remote-hit') {
    return [item.smokeCommand, item.doctorCommand, item.setupCommand].filter(Boolean);
  }
  if (item.action === 'repair-remote-cache') {
    return [item.doctorCommand, item.setupCommand, item.smokeCommand].filter(Boolean);
  }
  return [item.doctorCommand, item.smokeCommand, item.setupCommand].filter(Boolean);
}

const ACTION_PLAN_SEVERITY_RANK = Object.freeze({
  none: 0,
  info: 1,
  warn: 2,
  error: 3,
});

function severityRank(severity) {
  return ACTION_PLAN_SEVERITY_RANK[severity] ?? ACTION_PLAN_SEVERITY_RANK.info;
}

function actionPlanRequiredForSeverity(severity) {
  return severityRank(severity) >= severityRank('warn');
}

function actionPlanKindForSeverity(severity) {
  return actionPlanRequiredForSeverity(severity) ? 'required-action' : 'operator-hint';
}

export function buildQualityStatsActionPlan(stats = {}) {
  const actions = [];
  for (const item of stats.remoteCacheActions ?? []) {
    if (item.action === 'monitor-remote-cache') {
      continue;
    }
    const severity = item.severity ?? 'info';
    actions.push({
      action: item.action,
      commands: remoteCacheActionCommands(item),
      kind: actionPlanKindForSeverity(severity),
      priority: remoteCacheActionPriority(item.action),
      reason: item.reason,
      remoteHits: item.remoteHits ?? 0,
      required: actionPlanRequiredForSeverity(severity),
      severity,
      type: 'remote-cache',
    });
  }

  (stats.nextActions ?? []).forEach((item, index) => {
    const severity = 'warn';
    actions.push({
      action: 'benchmark-gate',
      cacheAction: item.cacheAction,
      category: item.category,
      commands: [item.benchmarkCommand].filter(Boolean),
      gate: item.gate,
      kind: actionPlanKindForSeverity(severity),
      priority: 30 + index,
      reason: item.recommendation,
      required: actionPlanRequiredForSeverity(severity),
      severity,
      type: 'gate',
    });
  });

  return actions.sort((left, right) => left.priority - right.priority);
}

export function summarizeQualityStatsActionPlan(actionPlan = []) {
  const severityCounts = {
    error: 0,
    info: 0,
    warn: 0,
  };
  let maxSeverity = 'none';
  let maxRequiredSeverity = 'none';
  let commandCount = 0;
  let hintActionCount = 0;
  let hintCommandCount = 0;
  let recommendedHintCommand = null;
  let recommendedRequiredCommand = null;
  let requiredActionCount = 0;
  let requiredCommandCount = 0;
  for (const item of actionPlan) {
    const severity = item.severity ?? 'info';
    const commands = item.commands ?? [];
    const required = item.required === true || actionPlanRequiredForSeverity(severity);
    if (Object.hasOwn(severityCounts, severity)) {
      severityCounts[severity] += 1;
    }
    if (severityRank(severity) > severityRank(maxSeverity)) {
      maxSeverity = severity;
    }
    commandCount += commands.length;
    if (required) {
      requiredActionCount += 1;
      requiredCommandCount += commands.length;
      recommendedRequiredCommand ??= commands[0] ?? null;
      if (severityRank(severity) > severityRank(maxRequiredSeverity)) {
        maxRequiredSeverity = severity;
      }
    } else {
      hintActionCount += 1;
      hintCommandCount += commands.length;
      recommendedHintCommand ??= commands[0] ?? null;
    }
  }
  return {
    actionCount: actionPlan.length,
    commandCount,
    hintActionCount,
    hintCommandCount,
    maxSeverity,
    maxRequiredSeverity,
    recommendedHintCommand,
    recommendedNextCommand: actionPlan[0]?.commands?.[0] ?? null,
    recommendedRequiredCommand,
    requiredActionCount,
    requiredCommandCount,
    severityCounts,
  };
}

export function actionPlanMeetsSeverity(summary, threshold) {
  if (!threshold) {
    return false;
  }
  return severityRank(summary?.maxSeverity ?? 'none') >= severityRank(threshold);
}

function explicitSignalInputFile(input) {
  const text = String(input ?? '');
  return /^scripts\/.+\.(?:mjs|js|sh)$/u.test(text)
    && !text.includes('*')
    && !text.includes('{')
    && !text.includes('}');
}

function signalTargetFiles(gate, targetFiles) {
  const files = new Set(targetFiles);
  for (const input of gate?.inputs ?? []) {
    if (explicitSignalInputFile(input)) {
      files.add(input);
    }
  }
  return [...files];
}

function enrichGateStatsItem(item, registry, repoRoot) {
  const gate = registry.byName.get(item.name);
  const targetFiles = commandTargetFiles(gate?.command);
  const signalFiles = signalTargetFiles(gate, targetFiles);
  const targetSignals = analyzeQualityStatsTargetFiles(repoRoot, signalFiles);
  const category = categoryForGate(gate, targetFiles);
  const budget = budgetForCategory(category);
  const currentBudgetStatus = budgetStatus(item, budget);
  const gateInputHealth = inputHealth(gate);
  const signals = {
    cacheable: gate?.cacheable ?? null,
    cachedCount: item.cachedCount ?? 0,
    cacheHitRate: item.cacheHitRate ?? 0,
    commandKind: commandKind(gate?.command),
    coldCount: item.coldCount ?? 0,
    cost: gate?.cost ?? 'unknown',
    gateName: item.name,
    group: gate?.group ?? 'unknown',
    hasOutputs: (gate?.outputs ?? []).length > 0,
    inputCount: gateInputHealth.inputCount,
    inputHealth: gateInputHealth.status,
    broadInputs: gateInputHealth.broadInputs,
    parallel: gate?.parallel !== false,
    signalFiles,
    targetFiles,
    ...targetSignals,
  };
  return {
    ...item,
    benchmarkCommand: benchmarkCommandForGate(item.name),
    category,
    budgetStatus: currentBudgetStatus,
    budget: {
      profile: budget.profile,
      warnAvgMs: budget.warnAvgMs,
      warnMaxMs: budget.warnMaxMs,
    },
    cacheHealth: diagnoseCacheHealth(item, gate),
    recommendation: recommendationFor(category, signals),
    sampleHealth: diagnoseSampleHealth(item, budget, currentBudgetStatus),
    signals,
  };
}

export function enrichQualityStats(stats, registry, options = {}) {
  const { repoRoot = process.cwd() } = options;
  const slowest = (stats.slowest ?? []).map((item) => enrichGateStatsItem(item, registry, repoRoot));
  const gateSummaries = stats.gateSummaries ?? null;
  const latestColdSource = gateSummaries
    ? gateSummaries.filter((item) => item.lastColdDurationMs !== null && item.lastColdDurationMs !== undefined)
    : (stats.latestCold ?? []);
  const slowestColdSource = gateSummaries
    ? gateSummaries.filter((item) => item.coldCount > 0)
    : (stats.slowestCold ?? []);
  const latestColdLimit = stats.latestCold?.length ?? latestColdSource.length;
  const slowestColdLimit = stats.slowestCold?.length ?? slowestColdSource.length;
  const latestCold = sortGateStatsItems(
    latestColdSource.map((item) => enrichGateStatsItem(item, registry, repoRoot)),
    compareGateStatsByCurrentCold,
  ).slice(0, latestColdLimit);
  const slowestCold = sortGateStatsItems(
    slowestColdSource.map((item) => enrichGateStatsItem(item, registry, repoRoot)),
    compareGateStatsByColdMax,
  ).slice(0, slowestColdLimit);

  const factorMap = new Map();
  for (const item of slowest) {
    const current = factorMap.get(item.category) ?? {
      category: item.category,
      count: 0,
      currentColdMaxMs: 0,
      maxMs: 0,
      staleWarnCount: 0,
      warnCount: 0,
    };
    current.count += 1;
    current.maxMs = Math.max(current.maxMs, item.maxMs ?? 0);
    current.currentColdMaxMs = Math.max(current.currentColdMaxMs ?? 0, currentFactorDurationMs(item));
    if (item.budgetStatus === 'warn' && !isHistoricalBudgetWarning(item)) {
      current.warnCount += 1;
    } else if (item.budgetStatus === 'warn') {
      current.staleWarnCount = (current.staleWarnCount ?? 0) + 1;
    }
    factorMap.set(item.category, current);
  }

  return {
    ...stats,
    slowest,
    latestCold,
    slowestCold,
    nextActions: slowest
      .filter((item) => item.budgetStatus === 'warn' && !isHistoricalBudgetWarning(item))
      .sort((left, right) => (
        (right.coldMaxMs ?? 0) - (left.coldMaxMs ?? 0)
        || (right.coldAvgMs ?? 0) - (left.coldAvgMs ?? 0)
        || (right.maxMs ?? 0) - (left.maxMs ?? 0)
      ))
      .slice(0, 5)
      .map((item) => ({
        benchmarkCommand: item.benchmarkCommand,
        gate: item.name,
        category: item.category,
        cacheAction: item.cacheHealth.action,
        cacheReason: item.cacheHealth.reason,
        coldMaxMs: item.coldMaxMs ?? 0,
        coldAvgMs: item.coldAvgMs ?? 0,
        cacheHitRate: item.cacheHitRate ?? 0,
        inputHealth: item.signals.inputHealth,
        recommendation: item.recommendation,
        sampleHealth: item.sampleHealth,
      })),
    slowFactors: [...factorMap.values()].sort((left, right) => (
      compatibilityRank(left.category) - compatibilityRank(right.category)
      || right.warnCount - left.warnCount
      || (right.staleWarnCount ?? 0) - (left.staleWarnCount ?? 0)
      || (right.currentColdMaxMs ?? 0) - (left.currentColdMaxMs ?? 0)
      || (right.maxMs ?? 0) - (left.maxMs ?? 0)
    )),
    budgetWarnings: slowest.filter((item) => item.budgetStatus === 'warn' && !isHistoricalBudgetWarning(item)),
    staleBudgetWarnings: slowest.filter((item) => item.budgetStatus === 'warn' && isHistoricalBudgetWarning(item)),
  };
}
