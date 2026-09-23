function eventCacheMode(event) {
  if (event?.cache === false) {
    return 'off';
  }
  if (event?.cache === true) {
    return 'on';
  }
  return 'unknown';
}

function createGateDurationSummary(name) {
  return {
    name,
    cachedCount: 0,
    cachedTotalMs: 0,
    cachedMaxMs: 0,
    localCachedCount: 0,
    remoteCachedCount: 0,
    coldByCacheMode: {
      off: 0,
      on: 0,
      unknown: 0,
    },
    coldMaxMsByCacheMode: {
      off: 0,
      on: 0,
      unknown: 0,
    },
    coldTotalMsByCacheMode: {
      off: 0,
      on: 0,
      unknown: 0,
    },
    coldCount: 0,
    coldTotalMs: 0,
    coldMaxMs: 0,
    lastCacheHit: null,
    lastCacheOnColdDurationMs: null,
    lastCacheOnColdTimestamp: null,
    lastColdCacheMode: null,
    lastColdDurationMs: null,
    lastColdTimestamp: null,
    lastDiagnosticColdDurationMs: null,
    lastDiagnosticColdTimestamp: null,
    lastDurationMs: null,
    lastSeenTimestamp: null,
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };
}

function recordCacheMode(cacheModes, cacheMode) {
  if (cacheMode === 'off') {
    cacheModes.off += 1;
  } else if (cacheMode === 'on') {
    cacheModes.on += 1;
  } else {
    cacheModes.unknown += 1;
  }
}

function recordGateResult(summary, eventTimestamp, cacheMode, gate) {
  const durationMs = gate.durationMs ?? 0;
  summary.count += 1;
  summary.totalMs += durationMs;
  summary.maxMs = Math.max(summary.maxMs, durationMs);
  summary.lastCacheHit = Boolean(gate.cacheHit);
  summary.lastDurationMs = durationMs;
  summary.lastSeenTimestamp = eventTimestamp;

  if (gate.cacheHit) {
    summary.cachedCount += 1;
    summary.cachedTotalMs += durationMs;
    summary.cachedMaxMs = Math.max(summary.cachedMaxMs, durationMs);
    if (gate.cacheSource === 'remote') {
      summary.remoteCachedCount += 1;
    } else {
      summary.localCachedCount += 1;
    }
    return false;
  }

  summary.coldByCacheMode[cacheMode] = (summary.coldByCacheMode[cacheMode] ?? 0) + 1;
  summary.coldTotalMsByCacheMode[cacheMode] = (summary.coldTotalMsByCacheMode[cacheMode] ?? 0) + durationMs;
  summary.coldMaxMsByCacheMode[cacheMode] = Math.max(summary.coldMaxMsByCacheMode[cacheMode] ?? 0, durationMs);
  summary.coldCount += 1;
  summary.coldTotalMs += durationMs;
  summary.coldMaxMs = Math.max(summary.coldMaxMs, durationMs);
  summary.lastColdCacheMode = cacheMode;
  summary.lastColdDurationMs = durationMs;
  summary.lastColdTimestamp = eventTimestamp;
  if (cacheMode === 'on') {
    summary.lastCacheOnColdDurationMs = durationMs;
    summary.lastCacheOnColdTimestamp = eventTimestamp;
  } else if (cacheMode === 'off') {
    summary.lastDiagnosticColdDurationMs = durationMs;
    summary.lastDiagnosticColdTimestamp = eventTimestamp;
  }
  return true;
}

function buildGateSummaries(gateDurations) {
  return [...gateDurations.values()]
    .map((item) => ({
      ...item,
      avgMs: Math.round(item.totalMs / item.count),
      cachedAvgMs: item.cachedCount === 0 ? 0 : Math.round(item.cachedTotalMs / item.cachedCount),
      cacheHitRate: item.count === 0 ? 0 : item.cachedCount / item.count,
      coldAvgMs: item.coldCount === 0 ? 0 : Math.round(item.coldTotalMs / item.coldCount),
      coldAvgMsByCacheMode: {
        off: item.coldByCacheMode.off === 0 ? 0 : Math.round(item.coldTotalMsByCacheMode.off / item.coldByCacheMode.off),
        on: item.coldByCacheMode.on === 0 ? 0 : Math.round(item.coldTotalMsByCacheMode.on / item.coldByCacheMode.on),
        unknown: item.coldByCacheMode.unknown === 0 ? 0 : Math.round(item.coldTotalMsByCacheMode.unknown / item.coldByCacheMode.unknown),
      },
    }));
}

export function summarizeParsedQualityEvents(events, options = {}) {
  const { since = null, slowLimit = 10 } = options;
  const gateDurations = new Map();
  let cacheHits = 0;
  let gateResults = 0;
  let coldGateResults = 0;
  const modes = {};
  const cacheModes = {
    off: 0,
    on: 0,
    unknown: 0,
  };
  const cacheSources = {
    local: 0,
    remote: 0,
  };

  for (const event of events) {
    modes[event.mode] = (modes[event.mode] ?? 0) + 1;
    const currentCacheMode = eventCacheMode(event);
    recordCacheMode(cacheModes, currentCacheMode);
    const eventTimestamp = event.timestamp ?? null;
    for (const gate of event.gates ?? []) {
      gateResults += 1;
      if (gate.cacheHit) {
        cacheHits += 1;
        if (gate.cacheSource === 'remote') {
          cacheSources.remote += 1;
        } else {
          cacheSources.local += 1;
        }
      }
      const current = gateDurations.get(gate.name) ?? createGateDurationSummary(gate.name);
      if (recordGateResult(current, eventTimestamp, currentCacheMode, gate)) {
        coldGateResults += 1;
      }
      gateDurations.set(gate.name, current);
    }
  }

  const gateSummaries = buildGateSummaries(gateDurations);
  const result = {
    cacheHits,
    cacheModes,
    cacheSources,
    since,
    totalRuns: events.length,
    totalGateResults: gateResults,
    cacheHitRate: gateResults === 0 ? 0 : cacheHits / gateResults,
    coldGateResults,
    slowest: [...gateSummaries]
      .sort((a, b) => b.maxMs - a.maxMs)
      .slice(0, slowLimit),
    latestCold: [...gateSummaries]
      .filter((item) => item.lastColdDurationMs !== null && item.lastColdDurationMs !== undefined)
      .sort((a, b) => (b.lastColdDurationMs ?? 0) - (a.lastColdDurationMs ?? 0))
      .slice(0, slowLimit),
    slowestCold: [...gateSummaries]
      .filter((item) => item.coldCount > 0)
      .sort((a, b) => b.coldMaxMs - a.coldMaxMs)
      .slice(0, slowLimit),
    modes,
  };
  // Keep unsliced summaries available for registry-aware ordering without bloating JSON output.
  Object.defineProperty(result, 'gateSummaries', {
    enumerable: false,
    value: gateSummaries,
  });
  return result;
}
