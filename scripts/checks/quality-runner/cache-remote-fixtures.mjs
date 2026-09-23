import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

export function createCacheRemoteTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-cache-remote-'));
}

export function removeCacheRemoteTempWorkspace(repoRoot) {
  rmSync(repoRoot, { force: true, recursive: true });
}

export function writeCacheProbe(repoRoot) {
  writeText(path.join(repoRoot, 'scripts/cache-probe.mjs'), 'console.log("cache probe ran");\n');
}

export function createCacheProbeGate(overrides = {}) {
  return {
    name: 'remote-cache-probe',
    command: 'node scripts/cache-probe.mjs',
    cacheable: true,
    cost: 'cheap',
    deps: [],
    group: 'fixture',
    inputs: ['scripts/cache-probe.mjs'],
    parallel: true,
    ...overrides,
  };
}

export function createRemoteCacheEnv(repoRoot) {
  const remoteRoot = path.join(repoRoot, 'remote-quality-cache');
  return {
    remoteRoot,
    remoteUrl: pathToFileURL(remoteRoot).toString(),
    remoteEnv: {
      AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
      AIOS_QUALITY_REMOTE_CACHE_URL: pathToFileURL(remoteRoot).toString(),
    },
  };
}

export function remoteResultPath(remoteRoot, gate, cacheKey) {
  return path.join(remoteRoot, 'schema-v1/results', gate.name, `${cacheKey}.json`);
}

export function readSingleRemoteResult(remoteRoot, gate) {
  const resultDir = path.join(remoteRoot, 'schema-v1/results', gate.name);
  const resultFiles = readdirSync(resultDir).filter((file) => file.endsWith('.json')).sort();
  if (resultFiles.length !== 1) {
    throw new Error(`expected one remote result for ${gate.name}, found ${resultFiles.length}`);
  }
  const fileName = resultFiles[0];
  return {
    cacheKey: fileName.replace(/\.json$/u, ''),
    path: path.join(resultDir, fileName),
  };
}

export function readSingleRemoteArtifact(remoteRoot, gate) {
  const artifactDir = path.join(remoteRoot, 'schema-v1/artifacts', gate.name);
  const cacheKeys = readdirSync(artifactDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (cacheKeys.length !== 1) {
    throw new Error(`expected one remote artifact for ${gate.name}, found ${cacheKeys.length}`);
  }
  const cacheKey = cacheKeys[0];
  const artifactRoot = path.join(artifactDir, cacheKey);
  return {
    cacheKey,
    manifestPath: path.join(artifactRoot, 'manifest.json'),
    path: artifactRoot,
  };
}

export function removeLocalResult(repoRoot, gateName) {
  rmSync(path.join(repoRoot, '.cache/aios-quality/results', gateName), { force: true, recursive: true });
}

export function exists(filePath) {
  return existsSync(filePath);
}
