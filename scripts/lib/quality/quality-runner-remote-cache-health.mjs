import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  getQualityCacheRoot,
} from './quality-cache-paths.mjs';
import {
  redactRemoteCacheUrl,
} from './quality-cache-remote.mjs';

const REMOTE_CACHE_URL_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
export const REMOTE_CACHE_HEALTH_DISABLED_ENV = 'AIOS_QUALITY_REMOTE_CACHE_HEALTH_DISABLED';
const REMOTE_CACHE_HEALTH_SCHEMA_VERSION = 1;
const REMOTE_CACHE_HEALTH_FILE = 'remote-cache-health.json';
const DEFAULT_REMOTE_CACHE_HEALTH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function remoteCacheHealthPath(repoRoot) {
  return path.join(getQualityCacheRoot(repoRoot), REMOTE_CACHE_HEALTH_FILE);
}

function compactDiagnostics(diagnostics) {
  if (!diagnostics) {
    return null;
  }
  return {
    backend: diagnostics.backend ?? null,
    canRead: diagnostics.canRead ?? null,
    canWrite: diagnostics.canWrite ?? null,
    mode: diagnostics.mode ?? null,
    protocol: diagnostics.protocol ?? null,
    reason: diagnostics.reason ?? null,
    rootExists: diagnostics.rootExists ?? null,
    status: diagnostics.status ?? null,
    usable: diagnostics.usable ?? null,
  };
}

function compactSmoke(smoke) {
  if (!smoke) {
    return null;
  }
  return {
    read: smoke.read ? {
      artifactRestored: smoke.read.artifactRestored === true,
      localRefill: smoke.read.localRefill === true,
      remoteHit: smoke.read.remoteHit === true,
      status: smoke.read.status ?? null,
    } : null,
    status: smoke.status ?? null,
    write: smoke.write ? {
      remoteArtifactExists: smoke.write.remoteArtifactExists === true,
      remoteResultExists: smoke.write.remoteResultExists === true,
      status: smoke.write.status ?? null,
    } : null,
  };
}

function remoteForResult(command, result) {
  if (command === 'setup') {
    const url = result?.env?.[REMOTE_CACHE_URL_ENV] ?? null;
    return {
      rootPath: result?.rootPath ?? null,
      source: result?.source ?? null,
      url: url ? redactRemoteCacheUrl(url) : null,
    };
  }
  return {
    rootPath: result?.remote?.rootPath ?? null,
    source: result?.remote?.source ?? null,
    url: result?.remote?.url ? redactRemoteCacheUrl(result.remote.url) : null,
  };
}

export function writeRemoteCacheHealth(repoRoot, {
  command,
  env = process.env,
  result,
  now = new Date(),
} = {}) {
  if (env?.[REMOTE_CACHE_HEALTH_DISABLED_ENV] === '1') {
    return {
      reason: `disabled by ${REMOTE_CACHE_HEALTH_DISABLED_ENV}`,
      written: false,
    };
  }

  const remote = remoteForResult(command, result);
  if (!remote.url || remote.source === 'temp-default') {
    return {
      reason: remote.source === 'temp-default'
        ? 'skip temp default smoke target'
        : 'skip missing remote cache url',
      written: false,
    };
  }

  const payload = {
    command,
    diagnostics: {
      read: compactDiagnostics(result?.diagnostics?.read),
      readAfterWrite: compactDiagnostics(result?.diagnostics?.readAfterWrite),
      setup: compactDiagnostics(result?.diagnostics),
      write: compactDiagnostics(result?.diagnostics?.write),
    },
    remote,
    schema: REMOTE_CACHE_HEALTH_SCHEMA_VERSION,
    smoke: compactSmoke(command === 'setup' ? result?.smoke : result),
    status: result?.status ?? 'unknown',
    updatedAt: now.toISOString(),
  };
  const filePath = remoteCacheHealthPath(repoRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    path: filePath,
    written: true,
  };
}

export function readRemoteCacheHealth(repoRoot, remoteCache, options = {}) {
  const filePath = remoteCacheHealthPath(repoRoot);
  if (!existsSync(filePath)) {
    return {
      freshness: 'missing',
      matchesRemote: false,
      path: filePath,
      status: 'missing',
    };
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      freshness: 'invalid',
      matchesRemote: false,
      path: filePath,
      status: 'invalid',
    };
  }

  if (payload?.schema !== REMOTE_CACHE_HEALTH_SCHEMA_VERSION) {
    return {
      freshness: 'invalid',
      matchesRemote: false,
      path: filePath,
      schema: payload?.schema ?? null,
      status: 'invalid',
    };
  }

  const nowMs = Number(options.nowMs ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? DEFAULT_REMOTE_CACHE_HEALTH_MAX_AGE_MS);
  const updatedAtMs = Date.parse(payload.updatedAt);
  const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, nowMs - updatedAtMs) : null;
  const freshness = ageMs === null
    ? 'invalid'
    : (ageMs <= maxAgeMs ? 'fresh' : 'stale');
  const matchesRemote = Boolean(remoteCache?.url && payload.remote?.url === remoteCache.url);
  return {
    ageMs,
    ageMinutes: ageMs === null ? null : Math.floor(ageMs / 60000),
    command: payload.command ?? null,
    freshness,
    matchesRemote,
    path: filePath,
    remote: payload.remote ?? null,
    smoke: payload.smoke ?? null,
    status: payload.status ?? 'unknown',
    updatedAt: payload.updatedAt ?? null,
  };
}

export function isFreshPassingRemoteCacheHealth(health) {
  return health?.status === 'pass'
    && health?.freshness === 'fresh'
    && health?.matchesRemote === true
    && health?.smoke?.status === 'pass'
    && health?.smoke?.read?.remoteHit === true
    && health?.smoke?.read?.artifactRestored === true;
}
