import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_CACHE_DIR,
  RESULT_CACHE_DIR,
  safeCacheSegment,
} from './quality-cache-paths.mjs';

const REMOTE_CACHE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
const REMOTE_CACHE_MODE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_MODE';
const REMOTE_CACHE_SCHEMA_VERSION = 1;

function canAccess(filePath, mode) {
  try {
    accessSync(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

function nearestExistingParent(filePath) {
  let current = path.resolve(filePath);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return current;
}

export function getRemoteCacheConfig(env = process.env) {
  const rawUrl = String(env[REMOTE_CACHE_ENV] ?? '').trim();
  if (!rawUrl) {
    return {
      enabled: false,
      mode: 'off',
      reason: `${REMOTE_CACHE_ENV} is not set`,
    };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      enabled: false,
      mode: 'invalid',
      reason: `${REMOTE_CACHE_ENV} must be a valid URL`,
    };
  }

  if (!['file:', 'https:'].includes(url.protocol)) {
    return {
      enabled: false,
      mode: 'invalid',
      reason: `${REMOTE_CACHE_ENV} only supports file: or https: URLs`,
    };
  }

  const mode = String(env[REMOTE_CACHE_MODE_ENV] ?? 'read').trim() || 'read';
  if (!['read', 'readwrite'].includes(mode)) {
    return {
      enabled: false,
      mode: 'invalid',
      reason: `${REMOTE_CACHE_MODE_ENV} must be read or readwrite`,
    };
  }

  return {
    enabled: true,
    mode,
    protocol: url.protocol,
    url: url.toString(),
  };
}

function localPathForFileUrl(urlString) {
  return path.resolve(fileURLToPath(urlString));
}

export function remoteCacheRootPath(config) {
  if (!config?.enabled || config.protocol !== 'file:') {
    return null;
  }
  try {
    return localPathForFileUrl(config.url);
  } catch {
    return null;
  }
}

export function redactRemoteCacheUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.username) {
      url.username = '***';
    }
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return null;
  }
}

function fileRemoteCacheDiagnostics(config) {
  const rootPath = remoteCacheRootPath(config);
  if (!rootPath) {
    return {
      canRead: false,
      canWrite: false,
      rootExists: false,
      rootPath: null,
      status: 'invalid-file-url',
      usable: false,
    };
  }

  const rootExists = existsSync(rootPath);
  const writableParent = nearestExistingParent(path.dirname(rootPath));
  const canRead = rootExists && canAccess(rootPath, constants.R_OK);
  const canWrite = rootExists
    ? canAccess(rootPath, constants.W_OK)
    : Boolean(writableParent && canAccess(writableParent, constants.W_OK));
  const status = config.mode === 'readwrite'
    ? (canWrite ? 'ready-readwrite' : 'write-unavailable')
    : (canRead ? 'ready-readonly' : 'missing-readonly-source');

  return {
    canRead,
    canWrite,
    rootExists,
    rootPath,
    status,
    usable: config.mode === 'readwrite' ? canWrite : canRead,
  };
}

export function getRemoteCacheDiagnostics(env = process.env) {
  const rawUrl = String(env[REMOTE_CACHE_ENV] ?? '').trim();
  const rawMode = String(env[REMOTE_CACHE_MODE_ENV] ?? '').trim();
  const config = getRemoteCacheConfig(env);
  const base = {
    backend: 'none',
    enabled: config.enabled,
    env: {
      mode: rawMode || null,
      modeSet: Boolean(rawMode),
      urlSet: Boolean(rawUrl),
    },
    mode: config.mode,
    protocol: config.protocol ?? null,
    reason: config.reason ?? null,
    status: config.enabled ? 'configured' : config.mode,
    url: config.url ? redactRemoteCacheUrl(config.url) : null,
    usable: false,
  };

  if (!config.enabled) {
    return Object.freeze(base);
  }

  if (config.protocol !== 'file:') {
    return Object.freeze({
      ...base,
      backend: 'unsupported',
      reason: 'runtime remote cache currently supports file: URLs for read/write operations',
      status: 'unsupported-protocol',
    });
  }

  return Object.freeze({
    ...base,
    backend: 'file',
    ...fileRemoteCacheDiagnostics(config),
  });
}

export function remoteCacheFilePath(config, gateName, cacheKey) {
  if (!config?.enabled || config.protocol !== 'file:') {
    return null;
  }
  try {
    const root = remoteCacheRootPath(config);
    if (!root) {
      return null;
    }
    return path.join(root, `schema-v${REMOTE_CACHE_SCHEMA_VERSION}`, RESULT_CACHE_DIR, safeCacheSegment(gateName), `${cacheKey}.json`);
  } catch {
    return null;
  }
}

export function remoteArtifactRoot(config, gateName, cacheKey) {
  if (!config?.enabled || config.protocol !== 'file:') {
    return null;
  }
  try {
    const root = remoteCacheRootPath(config);
    if (!root) {
      return null;
    }
    return path.join(root, `schema-v${REMOTE_CACHE_SCHEMA_VERSION}`, ARTIFACT_CACHE_DIR, safeCacheSegment(gateName), cacheKey);
  } catch {
    return null;
  }
}

export function remoteCacheMetadata(config) {
  if (!config?.enabled) {
    return null;
  }
  return {
    mode: config.mode,
    protocol: config.protocol,
    schema: REMOTE_CACHE_SCHEMA_VERSION,
  };
}
