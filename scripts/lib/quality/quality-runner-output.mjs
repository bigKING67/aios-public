export function makeLogger(options = {}) {
  const { json = false, summaryOnly = false } = options;
  if (json || summaryOnly) {
    return {
      gateStart() {},
      gateDone() {},
    };
  }

  return {
    gateStart(gate) {
      console.log(`[run] ${gate.name}`);
    },
    gateDone(result) {
      if (result.cacheHit) {
        console.log(`[cache hit] ${result.gate.name}`);
        return;
      }
      const prefix = result.status === 'pass' ? '[pass]' : '[fail]';
      console.log(`${prefix} ${result.gate.name} ${result.durationMs}ms`);
    },
  };
}

function sortedEntriesByKey(entries) {
  return [...entries].sort(([left], [right]) => left.localeCompare(right));
}

function sortedGatesByName(gates) {
  return [...gates].sort((left, right) => left.name.localeCompare(right.name));
}

export function printGateList(mode, gates, context = {}) {
  console.log(`[quality] mode=${mode} gates=${gates.length}`);
  if (context.changedFiles?.length) {
    console.log(`[quality] changed=${context.changedFiles.length}`);
  }
  const groups = new Map();
  for (const gate of gates) {
    const list = groups.get(gate.group) ?? [];
    list.push(gate);
    groups.set(gate.group, list);
  }
  for (const [group, groupGates] of sortedEntriesByKey(groups.entries())) {
    console.log(`\n[group] ${group} ${groupGates.length}`);
    for (const gate of sortedGatesByName(groupGates)) {
      const flags = [
        `cost=${gate.cost ?? 'unknown'}`,
        `cache=${gate.cacheable ? 'yes' : 'no'}`,
        `parallel=${gate.parallel === false ? 'no' : 'yes'}`,
        gate.deps?.length ? `deps=${gate.deps.join(',')}` : null,
      ].filter(Boolean).join(' ');
      console.log(`- ${gate.name} [${flags}] :: ${gate.command}`);
    }
  }
}

export function printCompactGateList(mode, gates, context = {}) {
  console.log(`[quality] mode=${mode} gates=${gates.length}`);
  if (context.changedFiles?.length) {
    console.log(`[quality] changed=${context.changedFiles.length}`);
  }
  const groups = new Map();
  for (const gate of gates) {
    groups.set(gate.group, (groups.get(gate.group) ?? 0) + 1);
  }
  for (const [group, count] of sortedEntriesByKey(groups.entries())) {
    console.log(`- ${group}: ${count}`);
  }
}

function normalizedReason(reason) {
  const text = String(reason);
  const marker = ': ';
  const index = text.indexOf(marker);
  return index === -1 ? text : text.slice(index + marker.length);
}

export function buildAffectedSummary(changedFiles, selection, registry, options = {}) {
  const { isIgnoredFile = () => false } = options;
  const ignored = changedFiles.filter(isIgnoredFile);
  const byGroup = new Map();
  for (const name of selection.names) {
    const gate = registry.byName.get(name);
    const group = gate?.group ?? 'unknown';
    byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
  }

  const reasonCounts = new Map();
  for (const reasons of Object.values(selection.reasons ?? {})) {
    for (const reason of reasons) {
      const key = normalizedReason(reason);
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }
  }
  return {
    changedCount: changedFiles.length,
    ignoredCount: ignored.length,
    selectedCount: selection.names.length,
    groups: Object.fromEntries([...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))),
    topReasons: [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([reason, count]) => ({ count, reason })),
    ignoredFiles: ignored,
  };
}

export function printAffectedSummary(changedFiles, selection, registry, options = {}) {
  const summary = buildAffectedSummary(changedFiles, selection, registry, options);
  console.log(`[quality] changed=${summary.changedCount} ignored=${summary.ignoredCount} selected=${summary.selectedCount}`);
  if (summary.ignoredFiles.length > 0) {
    console.log('[quality] ignored files');
    for (const file of summary.ignoredFiles) {
      console.log(`- ${file}`);
    }
  }
  console.log('[quality] selected groups');
  for (const [group, count] of Object.entries(summary.groups)) {
    console.log(`- ${group}: ${count}`);
  }
  console.log('[quality] top reasons');
  for (const { count, reason } of summary.topReasons) {
    console.log(`- ${reason}: ${count}`);
  }
}

export function printBenchmarkResult(event) {
  const { gate, runs, summary } = event;
  for (const run of runs) {
    const prefix = run.status === 'pass' ? '[benchmark pass]' : '[benchmark fail]';
    console.log(`${prefix} ${gate.name} run=${run.run} duration=${run.durationMs}ms`);
  }
  console.log(`[benchmark summary] gate=${gate.name} runs=${summary.runs} passed=${summary.passed} failed=${summary.failed} min=${summary.minMs}ms avg=${summary.avgMs}ms max=${summary.maxMs}ms cache=off`);
  console.log('[benchmark hint] compare avg/max with `node scripts/quality-runner.mjs stats --since <ISO>`; if benchmark is fast but stats cold sample is slow, suspect scheduler window or stale history before rewriting the gate.');
}

export function printTextActionPlan(actionPlan = [], summary = {}) {
  const details = [
    summary.maxSeverity ? `severity=${summary.maxSeverity}` : null,
    summary.maxRequiredSeverity ? `requiredSeverity=${summary.maxRequiredSeverity}` : null,
    Number.isInteger(summary.actionCount) ? `actions=${summary.actionCount}` : null,
    Number.isInteger(summary.requiredActionCount) ? `required=${summary.requiredActionCount}` : null,
    Number.isInteger(summary.hintActionCount) ? `hints=${summary.hintActionCount}` : null,
    Number.isInteger(summary.commandCount) ? `commands=${summary.commandCount}` : null,
  ].filter(Boolean).join(' ');
  console.log(`[quality] action plan${details ? ` ${details}` : ''}`);
  if (summary.recommendedNextCommand) {
    console.log(`[quality] next command: ${summary.recommendedNextCommand}`);
  }
  if (actionPlan.length === 0) {
    console.log('- no current action');
    return;
  }
  actionPlan.forEach((item, index) => {
    const subject = item.gate ? ` ${item.gate}` : '';
    const kind = item.kind ? ` kind=${item.kind}` : '';
    console.log(`${index + 1}. [${item.type}] ${item.action}${subject}${kind}: ${item.reason}`);
    for (const command of item.commands ?? []) {
      console.log(`   command: ${command}`);
    }
  });
}

export function printTextStats(stats, since = null) {
  console.log(`[quality] runs=${stats.totalRuns} gates=${stats.totalGateResults ?? 0} cacheHitRate=${Math.round(stats.cacheHitRate * 100)}% cold=${stats.coldGateResults ?? 0}${since ? ` since=${since}` : ''}`);
  console.log('[quality] modes');
  for (const [mode, count] of Object.entries(stats.modes)) {
    console.log(`- ${mode}: ${count}`);
  }
  if (stats.cacheModes) {
    console.log('[quality] cache modes');
    for (const [mode, count] of Object.entries(stats.cacheModes)) {
      if (count > 0) {
        console.log(`- ${mode}: ${count}`);
      }
    }
  }
  if (stats.cacheSources) {
    console.log('[quality] cache sources');
    for (const [source, count] of Object.entries(stats.cacheSources)) {
      if (count > 0 || source === 'remote') {
        console.log(`- ${source}: ${count}`);
      }
    }
  }
  if (stats.remoteCache) {
    const details = [
      `status=${stats.remoteCache.status}`,
      `mode=${stats.remoteCache.mode}`,
      `backend=${stats.remoteCache.backend}`,
      stats.remoteCache.protocol ? `protocol=${stats.remoteCache.protocol}` : null,
      `usable=${stats.remoteCache.usable ? 'yes' : 'no'}`,
      stats.remoteCache.rootExists === undefined ? null : `rootExists=${stats.remoteCache.rootExists ? 'yes' : 'no'}`,
      stats.remoteCache.canRead === undefined ? null : `canRead=${stats.remoteCache.canRead ? 'yes' : 'no'}`,
      stats.remoteCache.canWrite === undefined ? null : `canWrite=${stats.remoteCache.canWrite ? 'yes' : 'no'}`,
      stats.remoteCache.reason ? `reason=${stats.remoteCache.reason}` : null,
    ].filter(Boolean).join(' ');
    console.log(`[quality] remote cache ${details}`);
    if (stats.remoteCache.status === 'off' && stats.remoteCache.reason?.includes('AIOS_QUALITY_REMOTE_CACHE_URL')) {
      console.log('[quality] remote cache hint: set AIOS_QUALITY_REMOTE_CACHE_URL=file://<shared-cache-dir>; add AIOS_QUALITY_REMOTE_CACHE_MODE=readwrite only when publishing pass-only results');
    }
  }
  if (stats.remoteCacheHealth) {
    const details = [
      `status=${stats.remoteCacheHealth.status}`,
      `freshness=${stats.remoteCacheHealth.freshness}`,
      `matchesRemote=${stats.remoteCacheHealth.matchesRemote ? 'yes' : 'no'}`,
      stats.remoteCacheHealth.ageMinutes === null || stats.remoteCacheHealth.ageMinutes === undefined
        ? null
        : `age=${stats.remoteCacheHealth.ageMinutes}m`,
      stats.remoteCacheHealth.command ? `command=${stats.remoteCacheHealth.command}` : null,
    ].filter(Boolean).join(' ');
    console.log(`[quality] remote cache health ${details}`);
  }
  if ((stats.remoteCacheActions?.length ?? 0) > 0) {
    console.log('[quality] remote cache actions');
    for (const item of stats.remoteCacheActions) {
      console.log(`- ${item.action}: ${item.reason}`);
      if (item.envCommand) {
        console.log(`  env: ${item.envCommand}`);
      }
      if (item.activateCommand) {
        console.log(`  activate: ${item.activateCommand}`);
      }
      if (item.publishEnvCommand) {
        console.log(`  publish-env: ${item.publishEnvCommand}`);
      }
      if (item.publishActivateCommand) {
        console.log(`  publish-activate: ${item.publishActivateCommand}`);
      }
      if (item.setupCommand) {
        console.log(`  setup: ${item.setupCommand}`);
      }
      if (item.doctorCommand) {
        console.log(`  doctor: ${item.doctorCommand}`);
      }
      if (item.smokeCommand) {
        console.log(`  smoke: ${item.smokeCommand}`);
      }
    }
  }
  console.log('[quality] slowest (current cold first, primary first)');
  const displaySlowest = stats.slowest
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      Number(left.item.category === 'compatibility-slice') - Number(right.item.category === 'compatibility-slice')
      || (right.item.lastColdDurationMs ?? -1) - (left.item.lastColdDurationMs ?? -1)
      || left.index - right.index
    ))
    .map(({ item }) => item);
  for (const item of displaySlowest) {
    const signals = item.signals ?? {};
    const tempRepoSignals = Math.max(
      signals.withTempRepoCount ?? 0,
      signals.withFixtureWorkspaceCount ?? 0,
      signals.createFixtureWorkspaceCount ?? 0,
      signals.createTempRepoCount ?? 0,
      signals.mkdtempCount ?? 0,
    );
    const subprocessSignals = (signals.spawnSyncCount ?? 0)
      + (signals.execFileSyncCount ?? 0)
      + (signals.runFixtureCommandCount ?? 0)
      + (signals.runFixtureGitCount ?? 0);
    const fixtureSignals = item.category === 'behavior-fixture'
      ? ` tempRepos=${tempRepoSignals} subprocesses=${subprocessSignals}`
      : '';
    const cacheAction = item.cacheHealth?.action && item.cacheHealth.action !== 'monitor'
      ? ` cacheAction=${item.cacheHealth.action}`
      : '';
    const lastCold = item.lastColdDurationMs === null || item.lastColdDurationMs === undefined
      ? ''
      : ` lastCold=${item.lastColdDurationMs}ms`;
    const lastColdMode = item.lastColdCacheMode ? ` coldMode=${item.lastColdCacheMode}` : '';
    const coldModes = item.coldByCacheMode
      ? ` coldModes=on:${item.coldByCacheMode.on ?? 0}/off:${item.coldByCacheMode.off ?? 0}/unknown:${item.coldByCacheMode.unknown ?? 0}`
      : '';
    const sampleHealth = item.sampleHealth?.status && item.sampleHealth.status !== 'current'
      ? [
          ` sample=${item.sampleHealth.status}`,
          item.sampleHealth.lastDurationMs === null || item.sampleHealth.lastDurationMs === undefined ? '' : ` last=${item.sampleHealth.lastDurationMs}ms`,
          item.sampleHealth.lastColdDurationMs === null || item.sampleHealth.lastColdDurationMs === undefined ? '' : ` lastCold=${item.sampleHealth.lastColdDurationMs}ms`,
          item.sampleHealth.coldMaxMs === null || item.sampleHealth.coldMaxMs === undefined ? '' : ` oldColdMax=${item.sampleHealth.coldMaxMs}ms`,
        ].join('')
      : '';
    console.log(`- ${item.name}: max=${item.maxMs}ms avg=${item.avgMs}ms coldMax=${item.coldMaxMs ?? 0}ms coldAvg=${item.coldAvgMs ?? 0}ms${lastCold}${lastColdMode}${coldModes} cacheHitRate=${Math.round((item.cacheHitRate ?? 0) * 100)}% count=${item.count} category=${item.category} budget=${item.budgetStatus}${cacheAction}${sampleHealth}${fixtureSignals}`);
    if (item.budgetStatus === 'warn' && (
      item.sampleHealth?.status === 'stale-max'
      || item.sampleHealth?.status === 'cache-recovered'
    )) {
      console.log(`  hint: ${item.sampleHealth.reason}`);
      console.log(`  benchmark: ${item.benchmarkCommand}`);
    } else if (item.budgetStatus === 'warn') {
      console.log(`  hint: ${item.recommendation}`);
      console.log(`  benchmark: ${item.benchmarkCommand}`);
    }
  }
  if ((stats.latestCold?.length ?? 0) > 0) {
    console.log('[quality] latest cold (current signal)');
    for (const item of stats.latestCold) {
      const lastColdMode = item.lastColdCacheMode ? ` coldMode=${item.lastColdCacheMode}` : '';
      console.log(`- ${item.name}: lastCold=${item.lastColdDurationMs}ms${lastColdMode} coldMax=${item.coldMaxMs ?? 0}ms coldAvg=${item.coldAvgMs ?? 0}ms cacheHitRate=${Math.round((item.cacheHitRate ?? 0) * 100)}% count=${item.count}`);
    }
  }
  if (stats.slowFactors.length > 0) {
    console.log('[quality] slow factors');
    for (const item of stats.slowFactors) {
      const stale = item.staleWarnCount ? ` stale=${item.staleWarnCount}` : '';
      const currentCold = item.currentColdMaxMs ? ` currentColdMax=${item.currentColdMaxMs}ms` : '';
      console.log(`- ${item.category}: count=${item.count} warn=${item.warnCount}${stale}${currentCold} max=${item.maxMs}ms`);
    }
  }
  if ((stats.actionPlan?.length ?? 0) > 0) {
    printTextActionPlan(stats.actionPlan, stats.actionPlanSummary);
  }
  if (stats.nextActions.length > 0) {
    console.log('[quality] next actions');
    for (const item of stats.nextActions) {
      console.log(`- ${item.gate}: coldMax=${item.coldMaxMs}ms coldAvg=${item.coldAvgMs}ms cacheHitRate=${Math.round(item.cacheHitRate * 100)}%`);
      console.log(`  ${item.recommendation}`);
      console.log(`  benchmark: ${item.benchmarkCommand}`);
    }
  } else if ((stats.staleBudgetWarnings?.length ?? 0) > 0) {
    console.log(`[quality] no current next actions (staleWarnings=${stats.staleBudgetWarnings.length})`);
    console.log('[quality] hint: use --since <ISO> or --since-commit <ref> to isolate current samples before optimizing historical peaks');
  }
}
