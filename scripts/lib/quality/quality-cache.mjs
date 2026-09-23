import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_CACHE_DIR,
  DIGEST_CACHE_DIR,
  getQualityCacheRoot,
  RESULT_CACHE_DIR,
  safeCacheSegment,
} from './quality-cache-paths.mjs';
import {
  ARTIFACT_MANIFEST_SCHEMA_VERSION,
  copyDirectoryRecursive,
  getGateArtifactManifest,
  normalizeOutputPatterns,
  restoreGateArtifacts,
  writeGateArtifacts,
} from './quality-cache-artifacts.mjs';
import {
  getRemoteCacheConfig,
  remoteArtifactRoot,
  remoteCacheFilePath,
  remoteCacheMetadata,
} from './quality-cache-remote.mjs';
import {
  CACHE_SCHEMA_VERSION,
} from './quality-cache-key.mjs';

export {
  getQualityCacheRoot,
} from './quality-cache-paths.mjs';
export {
  getGateArtifactManifest,
  restoreGateArtifacts,
  validateGateArtifactOutputs,
  writeGateArtifacts,
} from './quality-cache-artifacts.mjs';
export {
  appendQualityEvent,
  cacheKeyDigest,
  qualityEventPath,
  summarizeQualityEvents,
} from './quality-events.mjs';
export {
  getRemoteCacheDiagnostics,
  getRemoteCacheConfig,
} from './quality-cache-remote.mjs';
export {
  CACHE_SCHEMA_VERSION,
  computeGateCacheKey,
  createQualityCacheContext,
  expandGateInputFiles,
  flushQualityCacheContext,
  resetProcessToolVersionCacheForTests,
} from './quality-cache-key.mjs';

export function ensureQualityCacheDirs(repoRoot) {
  const root = getQualityCacheRoot(repoRoot);
  mkdirSync(path.join(root, ARTIFACT_CACHE_DIR), { recursive: true });
  mkdirSync(path.join(root, DIGEST_CACHE_DIR), { recursive: true });
  mkdirSync(path.join(root, RESULT_CACHE_DIR), { recursive: true });
  return root;
}

function cacheFilePath(repoRoot, gateName, cacheKey) {
  const safeGateName = safeCacheSegment(gateName);
  return path.join(getQualityCacheRoot(repoRoot), RESULT_CACHE_DIR, safeGateName, `${cacheKey}.json`);
}

function isPassCachePayload(value, gate, cacheKey) {
  const outputs = normalizeOutputPatterns(gate.outputs);
  return value?.schema === CACHE_SCHEMA_VERSION
    && value?.gate === gate.name
    && value?.cacheKey === cacheKey
    && value?.status === 'pass'
    && (
      outputs.length === 0
      || value?.artifacts?.schema === ARTIFACT_MANIFEST_SCHEMA_VERSION
    );
}

export function readGateCache(repoRoot, gate, cacheKey, options = {}) {
  if (!gate.cacheable) {
    return null;
  }
  const artifactManifest = getGateArtifactManifest(repoRoot, gate, cacheKey);
  const filePath = cacheFilePath(repoRoot, gate.name, cacheKey);
  if (!existsSync(filePath)) {
    return readRemoteGateCache(repoRoot, gate, cacheKey, options);
  }
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!isPassCachePayload(value, gate, cacheKey)) {
      return readRemoteGateCache(repoRoot, gate, cacheKey, options);
    }
    if (artifactManifest && !restoreGateArtifacts(repoRoot, artifactManifest)) {
      return null;
    }
    return {
      ...value,
      cacheSource: 'local',
    };
  } catch {
    return readRemoteGateCache(repoRoot, gate, cacheKey, options);
  }
}

function readRemoteGateCache(repoRoot, gate, cacheKey, options = {}) {
  const config = options.remoteConfig ?? getRemoteCacheConfig(options.env ?? process.env);
  const remoteFilePath = remoteCacheFilePath(config, gate.name, cacheKey);
  if (!remoteFilePath || !existsSync(remoteFilePath)) {
    return null;
  }

  try {
    const value = JSON.parse(readFileSync(remoteFilePath, 'utf8'));
    if (!isPassCachePayload(value, gate, cacheKey)) {
      return null;
    }

    const localFilePath = cacheFilePath(repoRoot, gate.name, cacheKey);
    mkdirSync(path.dirname(localFilePath), { recursive: true });
    copyFileSync(remoteFilePath, localFilePath);
    const artifactManifest = getGateArtifactManifest(repoRoot, gate, cacheKey);
    if (artifactManifest) {
      if (!restoreGateArtifacts(repoRoot, artifactManifest)) {
        const localArtifactRoot = artifactManifest.artifactRoot;
        const remoteRoot = remoteArtifactRoot(config, gate.name, cacheKey);
        if (!remoteRoot || !copyDirectoryRecursive(remoteRoot, localArtifactRoot) || !restoreGateArtifacts(repoRoot, artifactManifest)) {
          return null;
        }
      }
    }

    return {
      ...value,
      cacheSource: 'remote',
      remoteCache: remoteCacheMetadata(config),
    };
  } catch {
    return null;
  }
}

export function writeGateCache(repoRoot, gate, cacheKey, result, options = {}) {
  if (!gate.cacheable || result.status !== 'pass') {
    return;
  }
  const filePath = cacheFilePath(repoRoot, gate.name, cacheKey);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const artifactManifest = getGateArtifactManifest(repoRoot, gate, cacheKey);
  const artifacts = writeGateArtifacts(repoRoot, artifactManifest);
  const payload = {
    schema: CACHE_SCHEMA_VERSION,
    gate: gate.name,
    cacheKey,
    status: 'pass',
    durationMs: result.durationMs,
    ...(artifacts ? {
      artifacts: {
        fileCount: artifacts.files.length,
        schema: artifacts.schema,
      },
    } : {}),
    timestamp: new Date().toISOString(),
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(filePath, serialized, 'utf8');
  writeRemoteGateCache(gate, cacheKey, serialized, {
    ...options,
    repoRoot,
  });
}

function writeRemoteGateCache(gate, cacheKey, serializedPayload, options = {}) {
  const config = options.remoteConfig ?? getRemoteCacheConfig(options.env ?? process.env);
  if (!config.enabled || config.mode !== 'readwrite') {
    return;
  }
  const remoteFilePath = remoteCacheFilePath(config, gate.name, cacheKey);
  if (!remoteFilePath) {
    return;
  }
  try {
    mkdirSync(path.dirname(remoteFilePath), { recursive: true });
    writeFileSync(remoteFilePath, serializedPayload, 'utf8');
    const artifactManifest = options.repoRoot ? getGateArtifactManifest(options.repoRoot, gate, cacheKey) : null;
    const remoteRoot = remoteArtifactRoot(config, gate.name, cacheKey);
    if (artifactManifest && remoteRoot && existsSync(artifactManifest.artifactRoot)) {
      copyDirectoryRecursive(artifactManifest.artifactRoot, remoteRoot);
    }
  } catch {
    // Remote cache must be fail-open: local correctness must not depend on it.
  }
}
