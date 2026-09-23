import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  getRemoteCacheDiagnostics,
} from './quality-cache.mjs';
import {
  defaultRemoteCachePath,
  remoteCacheEnvForOptions,
  remoteCacheUrlForPath,
} from './quality-runner-remote-cache.mjs';
import {
  remoteCacheSmoke,
} from './quality-runner-remote-cache-smoke.mjs';

const REMOTE_CACHE_URL_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
const REMOTE_CACHE_MODE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_MODE';

function rootPathForFileUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'file:' ? path.resolve(fileURLToPath(url)) : null;
  } catch {
    return null;
  }
}

function setupTargetOptions(options = {}, env = process.env) {
  if (options.remoteCacheMode === 'read') {
    throw new Error('remote cache setup requires --remote-cache-mode readwrite');
  }
  if (options.remoteCachePath || options.remoteCacheUrl) {
    return {
      options: {
        ...options,
        remoteCacheMode: options.remoteCacheMode ?? 'readwrite',
      },
      source: 'override',
    };
  }

  const envUrl = String(env[REMOTE_CACHE_URL_ENV] ?? '').trim();
  if (envUrl) {
    return {
      options: {
        ...options,
        remoteCacheMode: 'readwrite',
        remoteCacheUrl: envUrl,
      },
      source: 'current-env',
    };
  }

  return {
    options: {
      ...options,
      remoteCacheMode: 'readwrite',
      remoteCachePath: defaultRemoteCachePath(),
    },
    source: 'default-path',
  };
}

function commandForPath(rootPath) {
  return `node scripts/quality-runner.mjs run affected --remote-cache-path ${JSON.stringify(rootPath)}`;
}

function printTextSetup(result) {
  const details = [
    `source=${result.source}`,
    `status=${result.status}`,
    `root=${result.rootPath ?? 'N/A'}`,
    `diagnostics=${result.diagnostics?.status ?? 'unknown'}`,
    `smoke=${result.smoke?.status ?? 'skipped'}`,
  ].join(' ');
  console.log(`[quality] remote cache setup ${details}`);
  if (result.status !== 'pass') {
    console.log(`[quality] reason=${result.reason ?? 'remote cache setup failed'}`);
    return;
  }
  console.log('[quality] remote cache setup passed. To enable it for future runs, export:');
  for (const command of result.exportCommands) {
    console.log(`  ${command}`);
  }
  console.log(`[quality] one-shot read-only run: ${result.runCommand}`);
}

export async function remoteCacheSetup(options = {}) {
  const env = options.env ?? process.env;
  const target = setupTargetOptions(options, env);
  const { env: remoteEnv } = remoteCacheEnvForOptions(target.options, env, {
    commandName: 'remote cache setup',
    defaultModeForOverride: 'readwrite',
  });
  const rootPath = rootPathForFileUrl(remoteEnv[REMOTE_CACHE_URL_ENV]);
  const setupUrl = rootPath ? remoteCacheUrlForPath(rootPath) : null;
  const result = {
    diagnostics: null,
    env: {
      [REMOTE_CACHE_MODE_ENV]: remoteEnv[REMOTE_CACHE_MODE_ENV],
      [REMOTE_CACHE_URL_ENV]: setupUrl,
    },
    exportCommands: [],
    reason: null,
    rootPath,
    runCommand: null,
    smoke: null,
    source: target.source,
    status: 'fail',
  };

  if (!rootPath) {
    result.reason = 'remote cache setup currently supports file: targets only';
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTextSetup(result);
    }
    return result;
  }

  mkdirSync(rootPath, { recursive: true });
  result.diagnostics = getRemoteCacheDiagnostics(remoteEnv);
  result.exportCommands = [
    `export ${REMOTE_CACHE_URL_ENV}=${JSON.stringify(remoteCacheUrlForPath(rootPath))}`,
    `export ${REMOTE_CACHE_MODE_ENV}=readwrite`,
  ];
  result.runCommand = commandForPath(rootPath);

  result.smoke = await remoteCacheSmoke({
    env: remoteEnv,
    quiet: true,
    remoteCachePath: rootPath,
  });
  result.status = result.diagnostics.usable && result.smoke.status === 'pass' ? 'pass' : 'fail';
  result.reason = result.status === 'pass'
    ? null
    : (result.diagnostics.reason ?? result.diagnostics.status ?? result.smoke.reason ?? 'remote cache setup failed');

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextSetup(result);
  }
  return result;
}
