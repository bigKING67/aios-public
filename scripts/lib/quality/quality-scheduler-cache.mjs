import {
  computeGateCacheKey,
  createQualityCacheContext,
  getRemoteCacheConfig,
  readGateCache,
  writeGateCache,
} from './quality-cache.mjs';

function cacheHitResult(gate, command, cached = {}) {
  return {
    cacheHit: true,
    cacheSource: cached.cacheSource ?? 'local',
    command,
    durationMs: 0,
    exitCode: 0,
    gate,
    status: 'pass',
    stdout: '',
    stderr: '',
  };
}

export function createSchedulerCacheState({ cache, env, repoRoot }) {
  return {
    cacheContext: cache ? createQualityCacheContext(repoRoot, { env }) : null,
    remoteCacheConfig: cache ? getRemoteCacheConfig(env ?? process.env) : null,
  };
}

export function prepareSchedulerCachedExecution({
  cache,
  cacheContext,
  command,
  env,
  gate,
  remoteCacheConfig,
  repoRoot,
}) {
  const cacheInfo = cache && gate.cacheable ? computeGateCacheKey(repoRoot, gate, cacheContext) : null;
  const cached = cacheInfo ? readGateCache(repoRoot, gate, cacheInfo.cacheKey, {
    env,
    remoteConfig: remoteCacheConfig,
  }) : null;
  if (cached) {
    return {
      cacheInfo,
      cachedResult: cacheHitResult(gate, command, cached),
      command,
    };
  }
  return { cacheInfo, command };
}

export function writeSchedulerGateCache({
  cacheInfo,
  env,
  gate,
  remoteCacheConfig,
  repoRoot,
  result,
}) {
  if (result.status !== 'pass' || !cacheInfo) {
    return;
  }
  writeGateCache(repoRoot, gate, cacheInfo.cacheKey, result, {
    env,
    remoteConfig: remoteCacheConfig,
  });
}

export {
  flushQualityCacheContext,
} from './quality-cache.mjs';
