import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  computeGateCacheKey,
  createQualityCacheContext,
  getGateArtifactManifest,
  getRemoteCacheDiagnostics,
  getQualityCacheRoot,
} from './quality-cache.mjs';
import {
  RESULT_CACHE_DIR,
  safeCacheSegment,
} from './quality-cache-paths.mjs';
import {
  getRemoteCacheConfig,
  redactRemoteCacheUrl,
  remoteArtifactRoot,
  remoteCacheFilePath,
} from './quality-cache-remote.mjs';
import {
  runQualityGates,
} from './quality-scheduler.mjs';
import {
  remoteCacheUrlForPath,
} from './quality-runner-remote-cache.mjs';

const REMOTE_CACHE_URL_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
const REMOTE_CACHE_MODE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_MODE';
const SMOKE_ARTIFACT_PATH = 'dist/remote-cache-smoke-output.txt';

function rootPathForRemoteUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'file:' ? path.resolve(fileURLToPath(url)) : null;
  } catch {
    return null;
  }
}

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createSmokeGate() {
  const smokeId = `${Date.now()}-${process.pid}`;
  return {
    name: `remote-cache-smoke-${smokeId}`,
    command: 'node scripts/cache-probe.mjs',
    cacheable: true,
    cost: 'cheap',
    deps: [],
    group: 'quality-runner',
    inputs: ['scripts/cache-probe.mjs'],
    outputs: [SMOKE_ARTIFACT_PATH],
    parallel: true,
  };
}

function smokeTarget(options = {}, env = process.env, repoRoot) {
  if (options.remoteCacheUrl && options.remoteCachePath) {
    throw new Error('remote cache smoke accepts either --remote-cache-url or --remote-cache-path, not both');
  }
  if (options.remoteCachePath) {
    const rootPath = path.resolve(options.remoteCachePath);
    return {
      rootPath,
      source: 'override',
      url: remoteCacheUrlForPath(rootPath),
    };
  }
  if (options.remoteCacheUrl) {
    return {
      rootPath: rootPathForRemoteUrl(options.remoteCacheUrl),
      source: 'override',
      url: options.remoteCacheUrl,
    };
  }

  const envUrl = String(env[REMOTE_CACHE_URL_ENV] ?? '').trim();
  if (envUrl) {
    return {
      rootPath: rootPathForRemoteUrl(envUrl),
      source: 'current-env',
      url: envUrl,
    };
  }

  const rootPath = path.join(repoRoot, 'remote-quality-cache-smoke');
  return {
    rootPath,
    source: 'temp-default',
    url: remoteCacheUrlForPath(rootPath),
  };
}

function smokeEnv(url, mode) {
  return {
    [REMOTE_CACHE_MODE_ENV]: mode,
    [REMOTE_CACHE_URL_ENV]: url,
  };
}

function localResultPath(repoRoot, gateName, cacheKey) {
  return path.join(
    getQualityCacheRoot(repoRoot),
    RESULT_CACHE_DIR,
    safeCacheSegment(gateName),
    `${cacheKey}.json`,
  );
}

function removeLocalResult(repoRoot, gateName) {
  rmSync(path.join(getQualityCacheRoot(repoRoot), RESULT_CACHE_DIR, safeCacheSegment(gateName)), {
    force: true,
    recursive: true,
  });
}

function smokeStatus(report) {
  return report.write?.status === 'pass'
    && report.write?.cacheHit === false
    && report.write?.remoteResultExists === true
    && report.write?.remoteArtifactExists === true
    && report.read?.status === 'pass'
    && report.read?.remoteHit === true
    && report.read?.localRefill === true
    && report.read?.artifactRestored === true
    ? 'pass'
    : 'fail';
}

function printTextSmoke(report) {
  const details = [
    `source=${report.remote.source}`,
    `status=${report.status}`,
    `remoteHit=${report.read?.remoteHit ? 'yes' : 'no'}`,
    `localRefill=${report.read?.localRefill ? 'yes' : 'no'}`,
    `artifactRestored=${report.read?.artifactRestored ? 'yes' : 'no'}`,
    report.remote.rootPath ? `root=${report.remote.rootPath}` : null,
    report.reason ? `reason=${report.reason}` : null,
  ].filter(Boolean).join(' ');
  console.log(`[quality] remote cache smoke ${details}`);
  if (report.write) {
    console.log(`[quality] write status=${report.write.status} cacheHit=${report.write.cacheHit ? 'yes' : 'no'} remoteResult=${report.write.remoteResultExists ? 'yes' : 'no'} remoteArtifact=${report.write.remoteArtifactExists ? 'yes' : 'no'}`);
  }
  if (report.read) {
    console.log(`[quality] read status=${report.read.status} cacheHit=${report.read.cacheHit ? 'yes' : 'no'} cacheSource=${report.read.cacheSource ?? 'none'} fallbackRan=${report.read.fallbackRan ? 'yes' : 'no'}`);
  }
}

function printSmoke(report, options = {}) {
  if (options.quiet) {
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextSmoke(report);
  }
}

export async function remoteCacheSmoke(options = {}) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'aios-quality-remote-smoke-'));
  let report = null;
  try {
    writeText(path.join(repoRoot, 'scripts/cache-probe.mjs'), [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'mkdirSync("dist", { recursive: true });',
      `writeFileSync(${JSON.stringify(SMOKE_ARTIFACT_PATH)}, "remote cache smoke artifact\\n", "utf8");`,
      'console.log("remote cache smoke probe ran");',
      '',
    ].join('\n'));
    const gate = createSmokeGate();
    const target = smokeTarget(options, options.env ?? process.env, repoRoot);
    const writeEnv = smokeEnv(target.url, 'readwrite');
    const readEnv = smokeEnv(target.url, 'read');
    const writeConfig = getRemoteCacheConfig(writeEnv);
    const cacheKey = computeGateCacheKey(repoRoot, gate, createQualityCacheContext(repoRoot, { env: writeEnv })).cacheKey;
    const artifactManifest = getGateArtifactManifest(repoRoot, gate, cacheKey);
    const remoteResultFile = remoteCacheFilePath(writeConfig, gate.name, cacheKey);
    const remoteArtifactDir = remoteArtifactRoot(writeConfig, gate.name, cacheKey);
    const localResultFile = localResultPath(repoRoot, gate.name, cacheKey);
    const localArtifactFile = path.join(repoRoot, SMOKE_ARTIFACT_PATH);
    const remote = {
      rootPath: target.rootPath,
      source: target.source,
      url: redactRemoteCacheUrl(target.url),
    };
    const diagnostics = {
      read: getRemoteCacheDiagnostics(readEnv),
      write: getRemoteCacheDiagnostics(writeEnv),
    };

    if (!diagnostics.write.usable || !remoteResultFile) {
      report = {
        diagnostics,
        read: null,
        reason: diagnostics.write.reason ?? diagnostics.write.status ?? 'remote cache is not writable',
        remote,
        status: 'fail',
        write: null,
        workspace: { cleaned: true },
      };
      printSmoke(report, options);
      return report;
    }

    const writer = await runQualityGates([gate], {
      cache: true,
      env: writeEnv,
      parallel: 1,
      repoRoot,
      verbose: options.verbose,
    });
    const writerResult = writer.results[0] ?? {};
    const remoteResultExists = existsSync(remoteResultFile);
    const remoteArtifactExists = Boolean(remoteArtifactDir && existsSync(remoteArtifactDir));

    removeLocalResult(repoRoot, gate.name);
    rmSync(artifactManifest.artifactRoot, { force: true, recursive: true });
    rmSync(localArtifactFile, { force: true });
    let fallbackRan = false;
    const reader = await runQualityGates([gate], {
      cache: true,
      commandRunner: async () => {
        fallbackRan = true;
        return {
          durationMs: 1,
          exitCode: 97,
          stderr: 'remote cache smoke fallback ran\n',
          stdout: '',
        };
      },
      env: readEnv,
      parallel: 1,
      repoRoot,
    });
    const readerResult = reader.results[0] ?? {};
    const remoteHit = readerResult.cacheHit === true
      && readerResult.cacheSource === 'remote'
      && !fallbackRan;

    report = {
      diagnostics: {
        ...diagnostics,
        readAfterWrite: getRemoteCacheDiagnostics(readEnv),
      },
      read: {
        cacheHit: readerResult.cacheHit === true,
        cacheSource: readerResult.cacheSource ?? null,
        artifactRestored: remoteHit && existsSync(localArtifactFile),
        fallbackRan,
        localRefill: remoteHit && existsSync(localResultFile),
        remoteHit,
        status: reader.status,
      },
      remote,
      status: 'fail',
      write: {
        cacheHit: writerResult.cacheHit === true,
        remoteArtifactExists,
        remoteResultExists,
        status: writer.status,
      },
      workspace: { cleaned: true },
    };
    report.status = smokeStatus(report);
  } catch (error) {
    report = {
      error: error instanceof Error ? error.message : String(error),
      remote: { rootPath: null, source: 'unknown', url: null },
      status: 'fail',
      workspace: { cleaned: true },
    };
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }

  printSmoke(report, options);
  return report;
}
