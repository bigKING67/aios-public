import process from 'node:process';

import {
  ensureQualityCacheDirs,
  getRemoteCacheDiagnostics,
} from './quality-cache.mjs';
import {
  appendQualityEvent,
  summarizeQualityEvents,
} from './quality-events.mjs';
import {
  defaultAffectedBase,
  explainAffectedSelection,
  isIgnoredAffectedFile,
  listChangedFiles,
  selectAffectedGates,
} from './quality-affected.mjs';
import {
  buildQualityGateRegistry,
  selectGatesByNames,
  validateQualityGateRegistry,
} from './quality-gate-registry.mjs';
import {
  createQualityManifestSnapshot,
  writeQualityManifestSnapshot,
} from './quality-manifest.mjs';
import {
  runBenchmarkGate,
} from './quality-runner-benchmark.mjs';
import {
  remoteCacheDoctor,
  remoteCacheEnv,
  remoteCacheActivationForHealth,
  remoteCacheEnvForOptions,
} from './quality-runner-remote-cache.mjs';
import {
  remoteCacheSmoke,
} from './quality-runner-remote-cache-smoke.mjs';
import {
  remoteCacheSetup,
} from './quality-runner-remote-cache-setup.mjs';
import {
  readRemoteCacheHealth,
  writeRemoteCacheHealth,
} from './quality-runner-remote-cache-health.mjs';
import {
  actionPlanMeetsSeverity,
  buildQualityStatsActionPlan,
  enrichQualityStats,
  remoteCacheStatsActions,
  summarizeQualityStatsActionPlan,
} from './quality-stats-insights.mjs';
import {
  formatFailure,
  runQualityGates,
  summarizeResults,
} from './quality-scheduler.mjs';
import {
  buildAffectedSummary,
  printCompactGateList,
  printGateList,
  printAffectedSummary,
  printTextStats,
  printTextActionPlan,
  makeLogger,
} from './quality-runner-output.mjs';
import {
  baseForAffectedSelection,
  baseForChangedFileScan,
  getRepoRoot,
  resolveStatsSince,
} from './quality-runner-repo.mjs';
import {
  createGateEnv,
  formatFailedGateAffectedContext,
  modeGateNames,
  sortAffectedReasons,
  runHeader,
} from './quality-runner-selection.mjs';
import {
  KNOWN_RUN_MODES,
  printUsage,
} from './quality-runner-args.mjs';

export {
  createGateEnv,
  formatFailedGateAffectedContext,
  modeGateNames,
  resolveStatsSince,
};

const REMOTE_CACHE_URL_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
const REMOTE_CACHE_MODE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_MODE';
const RUN_REMOTE_CACHE_AUTO_ENV = 'AIOS_QUALITY_REMOTE_CACHE_AUTO';
const PREPUSH_REMOTE_CACHE_AUTO_ENV = 'AIOS_QUALITY_PREPUSH_REMOTE_CACHE_AUTO';

function isRunRemoteCacheAutoDisabled(options = {}, env = process.env) {
  if (env[RUN_REMOTE_CACHE_AUTO_ENV] === '0') {
    return true;
  }
  return options.mode === 'prepush' && env[PREPUSH_REMOTE_CACHE_AUTO_ENV] === '0';
}

export function resolveRunModeRemoteCacheEnv(options = {}, repoRoot = getRepoRoot()) {
  const env = options.env ?? process.env;
  const remoteCache = remoteCacheEnvForOptions(options, env, {
    commandName: 'quality runner run',
    defaultModeForOverride: 'read',
  });
  if (
    options.cache === false
    || remoteCache.env[REMOTE_CACHE_URL_ENV]
    || options.remoteCacheMode
    || isRunRemoteCacheAutoDisabled(options, env)
  ) {
    return {
      ...remoteCache,
      autoActivated: false,
    };
  }

  const remoteCacheHealth = options.remoteCacheHealth
    ?? readRemoteCacheHealth(repoRoot, getRemoteCacheDiagnostics(env));
  const activation = remoteCacheActivationForHealth(remoteCacheHealth, { mode: 'read' });
  if (!activation) {
    return {
      ...remoteCache,
      autoActivated: false,
    };
  }

  return {
    autoActivated: true,
    env: {
      ...remoteCache.env,
      [REMOTE_CACHE_URL_ENV]: activation.remoteUrl,
      [REMOTE_CACHE_MODE_ENV]: 'read',
    },
    source: 'health-auto',
  };
}

export function createRunModeGateEnv(context = {}, options = {}, repoRoot = getRepoRoot()) {
  const remoteCache = resolveRunModeRemoteCacheEnv(options, repoRoot);
  return {
    ...createGateEnv(context.changedFileEntries ?? context.changedFiles),
    ...remoteCache.env,
    AIOS_QUALITY_BASE: options.base ?? defaultAffectedBase(repoRoot) ?? '',
    AIOS_QUALITY_HEAD: options.head ?? '',
  };
}

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

async function runSelection(mode, context, options, repoRoot, registry) {
  const { gates, missing } = selectGatesByNames(registry, context.names);
  if (missing.length > 0) {
    console.error(`[quality] missing gates: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (options.list) {
    if (options.json) {
      console.log(JSON.stringify({ mode, requestedGate: context.requestedGate ?? null, changedFiles: context.changedFiles, gates }, null, 2));
    } else if (options.compact) {
      printCompactGateList(mode, gates, context);
    } else {
      printGateList(mode, gates, context);
    }
    return;
  }

  const header = runHeader(mode, { ...context, names: gates.map((gate) => gate.name) }, options, repoRoot);
  const gateEnv = createRunModeGateEnv(context, { ...options, mode }, repoRoot);
  const remoteCacheDiagnostics = options.cache ? getRemoteCacheDiagnostics(gateEnv) : null;
  const remoteCacheAutoActivated = Boolean(
    gateEnv[REMOTE_CACHE_URL_ENV]
      && gateEnv[REMOTE_CACHE_MODE_ENV] === 'read'
      && !options.remoteCachePath
      && !options.remoteCacheUrl
      && !(options.env ?? process.env)[REMOTE_CACHE_URL_ENV],
  );
  if (!options.json) {
    if (remoteCacheAutoActivated) {
      console.log('[quality] remote cache auto env enabled mode=read source=health');
    }
    const remoteCacheStatus = remoteCacheDiagnostics
      ? ` remoteCache=${remoteCacheDiagnostics.status}`
      : '';
    const requestedGate = context.requestedGate ? ` requestedGate=${context.requestedGate}` : '';
    console.log(`[quality] mode=${header.mode}${requestedGate} base=${header.base ?? 'N/A'} changed=${header.changed} gates=${header.gates} parallel=${header.parallel} cache=${header.cache ? 'on' : 'off'}${remoteCacheStatus}`);
  }

  const result = await runQualityGates(gates, {
    cache: options.cache,
    env: gateEnv,
    logger: makeLogger(options),
    parallel: options.parallel,
    repoRoot,
    verbose: options.verbose,
  });
  const summary = summarizeResults(result.results);
  const event = {
    base: header.base,
    cache: header.cache,
    changedFiles: context.changedFiles,
    durationMs: result.durationMs,
    gates: result.results.map((item) => ({
      cacheHit: item.cacheHit,
      cacheSource: item.cacheSource,
      durationMs: item.durationMs,
      name: item.gate.name,
      status: item.status,
    })),
    mode,
    ...(context.requestedGate ? { requestedGate: context.requestedGate } : {}),
    ...(remoteCacheDiagnostics ? {
      remoteCache: {
        backend: remoteCacheDiagnostics.backend,
        enabled: remoteCacheDiagnostics.enabled,
        mode: remoteCacheDiagnostics.mode,
        protocol: remoteCacheDiagnostics.protocol,
        status: remoteCacheDiagnostics.status,
        usable: remoteCacheDiagnostics.usable,
      },
    } : {}),
    status: result.status,
    summary,
    timestamp: new Date().toISOString(),
  };
  appendQualityEvent(repoRoot, event);

  if (options.json) {
    console.log(JSON.stringify(event, null, 2));
  } else {
    console.log(`[summary] passed=${summary.passed} failed=${summary.failed} cached=${summary.cached} total=${summary.total} duration=${result.durationMs}ms`);
    for (const failure of result.results.filter((item) => item.status === 'fail')) {
      console.error(formatFailure(failure));
      if ((mode === 'affected' || mode === 'prepush') && context.changedFiles.length > 0) {
        console.error(formatFailedGateAffectedContext(failure, {
          ...context,
          mode,
        }));
      }
    }
  }

  if (result.status !== 'pass') {
    process.exit(1);
  }
}

export async function runMode(mode, options) {
  const repoRoot = getRepoRoot();
  ensureQualityCacheDirs(repoRoot);
  const registry = buildQualityGateRegistry({ repoRoot });
  validateRegistryOrExit(registry, repoRoot);
  return runSelection(mode, modeGateNames(mode, registry, repoRoot, options), options, repoRoot, registry);
}

export async function runGate(gateName, options = {}) {
  if (!gateName) {
    console.error('[quality] gate name is required.');
    process.exit(1);
  }
  const repoRoot = getRepoRoot();
  ensureQualityCacheDirs(repoRoot);
  const registry = buildQualityGateRegistry({ repoRoot });
  validateRegistryOrExit(registry, repoRoot);
  const context = {
    changedFiles: [],
    changedFileEntries: [],
    names: [gateName],
    reasons: {},
    requestedGate: gateName,
  };
  return runSelection('gate', context, options, repoRoot, registry);
}

export async function benchmarkGate(gateName, options = {}) {
  return runBenchmarkGate(gateName, options);
}

export function printRemoteCacheDoctor(options = {}) {
  return remoteCacheDoctor(options);
}

export function printRemoteCacheEnv(options = {}) {
  return remoteCacheEnv({
    ...options,
    remoteCacheHealth: options.remoteCacheHealth ?? readRemoteCacheHealth(
      options.repoRoot ?? getRepoRoot(),
      getRemoteCacheDiagnostics(options.env ?? process.env),
    ),
  });
}

export async function runRemoteCacheCommand(subcommand, options = {}) {
  if (subcommand === 'doctor') {
    return printRemoteCacheDoctor(options);
  }
  if (subcommand === 'env' || subcommand === 'activate') {
    const result = printRemoteCacheEnv(options);
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return result;
  }
  if (subcommand === 'smoke') {
    const result = await remoteCacheSmoke(options);
    writeRemoteCacheHealth(getRepoRoot(), { command: 'smoke', result });
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return result;
  }
  if (subcommand === 'setup') {
    const result = await remoteCacheSetup(options);
    writeRemoteCacheHealth(getRepoRoot(), { command: 'setup', result });
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return result;
  }
  printUsage();
  process.exit(1);
}

export function listMode(mode, options) {
  const repoRoot = getRepoRoot();
  const registry = buildQualityGateRegistry({ repoRoot });
  const names = mode && KNOWN_RUN_MODES.has(mode)
    ? modeGateNames(mode, registry, repoRoot, options).names
    : registry.gates.map((gate) => gate.name);
  const { gates } = selectGatesByNames(registry, names);
  if (options.json) {
    console.log(JSON.stringify({ mode: mode ?? 'all', gates }, null, 2));
    return;
  }
  if (options.compact) {
    printCompactGateList(mode ?? 'all', gates);
  } else {
    printGateList(mode ?? 'all', gates);
  }
}

export function explainAffected(options) {
  const repoRoot = getRepoRoot();
  const registry = buildQualityGateRegistry({ repoRoot });
  const scanBase = baseForChangedFileScan(repoRoot, options);
  const changedFiles = listChangedFiles(repoRoot, {
    base: scanBase,
    explicitFiles: options.changedFiles,
  });
  const selectionBase = baseForAffectedSelection(repoRoot, options, changedFiles, scanBase);
  const selection = selectAffectedGates(registry, changedFiles, {
    base: selectionBase,
    head: options.head,
    packageJsonKind: options.packageJsonKind,
    packageJsonRequiresFullCi: options.packageJsonRequiresFullCi,
    packageLockKind: options.packageLockKind,
    packageLockRequiresFullCi: options.packageLockRequiresFullCi,
    repoRoot,
  });
  const why = options.why
    ? {
      gate: options.why,
      selected: (selection.reasons?.[options.why]?.length ?? 0) > 0,
      reasons: sortAffectedReasons(selection.reasons?.[options.why] ?? []),
    }
    : null;
  if (options.json) {
    const output = { changedFiles, selection };
    if (options.summary) {
      output.summary = buildAffectedSummary(changedFiles, selection, registry, {
        isIgnoredFile: isIgnoredAffectedFile,
      });
    }
    if (why) {
      output.why = why;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  if (options.why) {
    console.log(`[quality] gate=${why.gate} selected=${why.selected ? 'yes' : 'no'}`);
    for (const reason of why.reasons) {
      console.log(`- ${reason}`);
    }
    return;
  }
  if (options.summary) {
    printAffectedSummary(changedFiles, selection, registry, {
      isIgnoredFile: isIgnoredAffectedFile,
    });
    return;
  }
  console.log(`[quality] changed files (${changedFiles.length})`);
  for (const file of changedFiles) {
    console.log(`- ${file}`);
  }
  console.log('\n[quality] affected gate reasons');
  console.log(explainAffectedSelection(selection));
}

export function printStats(options) {
  const repoRoot = getRepoRoot();
  const registry = buildQualityGateRegistry({ repoRoot });
  const since = resolveStatsSince(repoRoot, options);
  const remoteCache = getRemoteCacheDiagnostics(process.env);
  const remoteCacheHealth = readRemoteCacheHealth(repoRoot, remoteCache);
  const enrichedStats = enrichQualityStats(summarizeQualityEvents(repoRoot, {
    limit: options.limit ?? 200,
    since,
    slowLimit: options.slowLimit ?? 10,
  }), registry, { repoRoot });
  const stats = {
    ...enrichedStats,
    remoteCache,
    remoteCacheHealth,
    remoteCacheActions: remoteCacheStatsActions(remoteCache, {
      ...enrichedStats,
      remoteCacheHealth,
    }),
  };
  stats.actionPlan = buildQualityStatsActionPlan(stats);
  stats.actionPlanSummary = summarizeQualityStatsActionPlan(stats.actionPlan);
  if (options.printNextCommand) {
    if (options.json) {
      console.log(JSON.stringify({
        actionPlanSummary: stats.actionPlanSummary,
        nextCommand: stats.actionPlanSummary.recommendedNextCommand,
        since,
      }, null, 2));
    } else if (stats.actionPlanSummary.recommendedNextCommand) {
      console.log(stats.actionPlanSummary.recommendedNextCommand);
    } else {
      console.log('[quality] no next command');
    }
    if (actionPlanMeetsSeverity(stats.actionPlanSummary, options.failOnActionSeverity)) {
      process.exit(1);
    }
    return;
  }
  if (options.actionPlan) {
    if (options.json) {
      console.log(JSON.stringify({
        actionPlan: stats.actionPlan,
        actionPlanSummary: stats.actionPlanSummary,
        cacheSources: stats.cacheSources,
        remoteCache: stats.remoteCache,
        remoteCacheActions: stats.remoteCacheActions,
        remoteCacheHealth: stats.remoteCacheHealth,
        since,
      }, null, 2));
      if (actionPlanMeetsSeverity(stats.actionPlanSummary, options.failOnActionSeverity)) {
        process.exit(1);
      }
      return;
    }
    printTextActionPlan(stats.actionPlan, stats.actionPlanSummary);
    if (actionPlanMeetsSeverity(stats.actionPlanSummary, options.failOnActionSeverity)) {
      process.exit(1);
    }
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
    if (actionPlanMeetsSeverity(stats.actionPlanSummary, options.failOnActionSeverity)) {
      process.exit(1);
    }
    return;
  }
  printTextStats(stats, since);
  if (actionPlanMeetsSeverity(stats.actionPlanSummary, options.failOnActionSeverity)) {
    process.exit(1);
  }
}

export function writeManifest(mode, options) {
  if (!KNOWN_RUN_MODES.has(mode)) {
    printUsage();
    process.exit(1);
  }
  const repoRoot = getRepoRoot();
  ensureQualityCacheDirs(repoRoot);
  const registry = buildQualityGateRegistry({ repoRoot });
  validateRegistryOrExit(registry, repoRoot);

  const context = modeGateNames(mode, registry, repoRoot, options);
  const { gates, missing } = selectGatesByNames(registry, context.names);
  if (missing.length > 0) {
    console.error(`[quality] missing gates: ${missing.join(', ')}`);
    process.exit(1);
  }

  const snapshot = createQualityManifestSnapshot(repoRoot, gates, { mode });
  const manifestPath = writeQualityManifestSnapshot(repoRoot, snapshot, { manifestId: mode });
  const event = {
    changedFiles: context.changedFiles,
    fileCount: snapshot.fileCount,
    gateCount: snapshot.gateCount,
    inputCount: snapshot.inputCount,
    manifestPath,
    mode,
    snapshotDigest: snapshot.digest,
  };
  if (options.json) {
    console.log(JSON.stringify(event, null, 2));
    return;
  }
  console.log(`[quality] manifest mode=${mode} gates=${snapshot.gateCount} files=${snapshot.fileCount} inputs=${snapshot.inputCount} digest=${snapshot.digest.slice(0, 12)}`);
  console.log(`[quality] manifest wrote ${manifestPath}`);
}
