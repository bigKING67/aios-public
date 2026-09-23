import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_CACHE_DIR,
  getQualityCacheRoot,
  safeCacheSegment,
} from './quality-cache-paths.mjs';
import {
  validateGateArtifactOutputs,
} from './quality-cache-artifact-outputs.mjs';
import {
  artifactFilesRoot,
  artifactOutputFiles,
  copyRepoFile,
  fileContentDigest,
  removeArtifactOutputRoots,
} from './quality-cache-artifact-files.mjs';

export {
  normalizeOutputPatterns,
  normalizeStringList,
  validateGateArtifactOutputs,
} from './quality-cache-artifact-outputs.mjs';

export {
  copyDirectoryRecursive,
} from './quality-cache-artifact-files.mjs';

const ARTIFACT_MANIFEST_FILE = 'manifest.json';
export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 2;

export function getGateArtifactManifest(repoRoot, gate, cacheKey) {
  const validation = validateGateArtifactOutputs(gate);
  const { outputs } = validation;
  if (outputs.length === 0) {
    return null;
  }
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'));
  }
  const safeGateName = safeCacheSegment(gate.name);
  const artifactRoot = path.join(getQualityCacheRoot(repoRoot), ARTIFACT_CACHE_DIR, safeGateName, cacheKey);
  return {
    artifactRoot,
    cacheKey,
    gate: gate.name,
    outputs,
  };
}

function artifactManifestFilePath(artifactRoot) {
  return path.join(artifactRoot, ARTIFACT_MANIFEST_FILE);
}

function isArtifactManifestPayload(value, artifactManifest) {
  return value?.schema === ARTIFACT_MANIFEST_SCHEMA_VERSION
    && value?.gate === artifactManifest.gate
    && value?.cacheKey === artifactManifest.cacheKey
    && Array.isArray(value?.outputs)
    && JSON.stringify(value.outputs) === JSON.stringify(artifactManifest.outputs)
    && Array.isArray(value?.files)
    && value.files.every((entry) => (
      entry
      && typeof entry.path === 'string'
      && typeof entry.digest === 'string'
      && Number.isInteger(entry.size)
    ));
}

export function writeGateArtifacts(repoRoot, artifactManifest) {
  if (!artifactManifest) {
    return null;
  }

  const files = artifactOutputFiles(repoRoot, artifactManifest.outputs);
  const filesRoot = artifactFilesRoot(artifactManifest.artifactRoot);
  rmSync(artifactManifest.artifactRoot, { force: true, recursive: true });
  mkdirSync(filesRoot, { recursive: true });
  const entries = [];
  for (const file of files) {
    copyRepoFile(repoRoot, filesRoot, file);
    const sourcePath = path.join(repoRoot, file);
    const stat = statSync(sourcePath);
    entries.push({
      path: file,
      digest: fileContentDigest(sourcePath),
      size: stat.size,
    });
  }

  const payload = {
    schema: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    gate: artifactManifest.gate,
    cacheKey: artifactManifest.cacheKey,
    outputs: artifactManifest.outputs,
    files: entries,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(artifactManifestFilePath(artifactManifest.artifactRoot), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function restoreGateArtifacts(repoRoot, artifactManifest) {
  if (!artifactManifest) {
    return false;
  }

  const manifestPath = artifactManifestFilePath(artifactManifest.artifactRoot);
  if (!existsSync(manifestPath)) {
    return false;
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return false;
  }
  if (!isArtifactManifestPayload(payload, artifactManifest)) {
    return false;
  }

  const filesRoot = artifactFilesRoot(artifactManifest.artifactRoot);
  for (const entry of payload.files) {
    const file = entry.path;
    if (file.startsWith('/') || file === '..' || file.startsWith('../') || file.includes('/../')) {
      return false;
    }
    const artifactFilePath = path.join(filesRoot, file);
    if (!existsSync(artifactFilePath)) {
      return false;
    }
    const stat = statSync(artifactFilePath);
    if (!stat.isFile() || stat.size !== entry.size || fileContentDigest(artifactFilePath) !== entry.digest) {
      return false;
    }
  }

  removeArtifactOutputRoots(repoRoot, artifactManifest.outputs);
  for (const entry of payload.files) {
    copyRepoFile(filesRoot, repoRoot, entry.path);
  }
  return true;
}
