import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  getRemoteCacheDiagnostics,
} from './quality-cache.mjs';

const REMOTE_CACHE_URL_ENV = 'AIOS_QUALITY_REMOTE_CACHE_URL';
const REMOTE_CACHE_MODE_ENV = 'AIOS_QUALITY_REMOTE_CACHE_MODE';

export function defaultRemoteCachePath() {
  return path.join(homedir(), '.cache', 'aios-quality-remote');
}

export function remoteCacheUrlForPath(filePath) {
  return pathToFileURL(path.resolve(filePath)).toString();
}

export function shellQuote(value) {
  return JSON.stringify(String(value));
}

export function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function commandWithRemoteCacheUrl(subcommand, remoteUrl, extraArgs = []) {
  return [
    'node scripts/quality-runner.mjs remote-cache',
    subcommand,
    '--remote-cache-url',
    shellQuote(remoteUrl),
    ...extraArgs,
  ].join(' ');
}

export function remoteCacheActivationUrl(rawValue) {
  const rawUrl = String(rawValue ?? '').trim();
  if (!rawUrl || rawUrl.includes('***')) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'file:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function remoteCacheActivationUrlFromHealth(health) {
  return remoteCacheActivationUrl(health?.remote?.url);
}

export function isFreshPassingRemoteCacheHealthSignal(health) {
  return health?.status === 'pass'
    && health?.freshness === 'fresh'
    && health?.smoke?.status === 'pass'
    && health?.smoke?.read?.remoteHit === true
    && health?.smoke?.read?.artifactRestored === true;
}

export function remoteCacheActivationCommandsForUrl(remoteUrl, options = {}) {
  const url = remoteCacheActivationUrl(remoteUrl);
  if (!url) {
    return null;
  }
  const mode = options.mode ?? 'readwrite';
  return {
    activateCommand: [
      'export',
      `${REMOTE_CACHE_URL_ENV}=${shellQuote(url)}`,
      `${REMOTE_CACHE_MODE_ENV}=${mode}`,
    ].join(' '),
    doctorCommand: commandWithRemoteCacheUrl('doctor', url, ['--remote-cache-mode', mode]),
    envCommand: `eval "$(node scripts/quality-runner.mjs remote-cache env --remote-cache-url ${shellSingleQuote(url)} --remote-cache-mode ${mode})"`,
    setupCommand: commandWithRemoteCacheUrl('setup', url, ['--json']),
    smokeCommand: commandWithRemoteCacheUrl('smoke', url, ['--json']),
  };
}

export function remoteCacheActivationForHealth(health, options = {}) {
  if (!isFreshPassingRemoteCacheHealthSignal(health)) {
    return null;
  }
  const remoteUrl = remoteCacheActivationUrlFromHealth(health);
  if (!remoteUrl) {
    return null;
  }
  return {
    remoteUrl,
    ...remoteCacheActivationCommandsForUrl(remoteUrl, options),
  };
}

export function remoteCacheEnvForOptions(options = {}, env = process.env, settings = {}) {
  const {
    commandName = 'remote cache',
    defaultModeForOverride = null,
  } = settings;
  const hasOverride = Boolean(options.remoteCacheUrl || options.remoteCachePath);
  const nextEnv = {};

  if (options.remoteCacheUrl && options.remoteCachePath) {
    throw new Error(`${commandName} accepts either --remote-cache-url or --remote-cache-path, not both`);
  }
  if (options.remoteCachePath) {
    nextEnv[REMOTE_CACHE_URL_ENV] = remoteCacheUrlForPath(options.remoteCachePath);
  } else if (options.remoteCacheUrl) {
    nextEnv[REMOTE_CACHE_URL_ENV] = options.remoteCacheUrl;
  } else if (env[REMOTE_CACHE_URL_ENV]) {
    nextEnv[REMOTE_CACHE_URL_ENV] = env[REMOTE_CACHE_URL_ENV];
  }
  if (options.remoteCacheMode) {
    nextEnv[REMOTE_CACHE_MODE_ENV] = options.remoteCacheMode;
  } else if (hasOverride && defaultModeForOverride) {
    nextEnv[REMOTE_CACHE_MODE_ENV] = defaultModeForOverride;
  } else if (env[REMOTE_CACHE_MODE_ENV]) {
    nextEnv[REMOTE_CACHE_MODE_ENV] = env[REMOTE_CACHE_MODE_ENV];
  }

  return {
    env: nextEnv,
    source: hasOverride ? 'override' : 'current-env',
  };
}

function remoteCacheEnvPlan(options = {}) {
  const runtimeEnv = options.env ?? process.env;
  let { env, source } = remoteCacheEnvForOptions(options, runtimeEnv, {
    commandName: 'remote cache env',
    defaultModeForOverride: 'readwrite',
  });
  let remoteUrl = env[REMOTE_CACHE_URL_ENV] ?? null;
  let mode = env[REMOTE_CACHE_MODE_ENV] ?? null;
  let reason = null;

  if (!remoteUrl && options.remoteCacheHealth) {
    const healthActivation = remoteCacheActivationForHealth(options.remoteCacheHealth, { mode: mode ?? 'readwrite' });
    if (healthActivation) {
      remoteUrl = healthActivation.remoteUrl;
      source = 'health';
      reason = 'latest remote cache health is fresh and usable';
    }
  }

  if (!remoteUrl && options.remoteCacheHealthOnly) {
    return {
      commands: null,
      env: {
        [REMOTE_CACHE_MODE_ENV]: mode ?? 'readwrite',
        [REMOTE_CACHE_URL_ENV]: null,
      },
      reason: 'no fresh remote cache health signal is available',
      source,
      status: 'fail',
    };
  }

  if (!remoteUrl) {
    const rootPath = path.resolve(options.remoteCachePath ?? defaultRemoteCachePath());
    remoteUrl = remoteCacheUrlForPath(rootPath);
    source = 'default-path';
    reason = 'no env or fresh health was available; using the default local shared cache path';
  }

  mode ??= source === 'current-env' ? 'read' : 'readwrite';

  const commands = remoteCacheActivationCommandsForUrl(remoteUrl, { mode });
  if (!commands) {
    return {
      commands: null,
      env: {
        [REMOTE_CACHE_MODE_ENV]: mode,
        [REMOTE_CACHE_URL_ENV]: remoteUrl,
      },
      reason: 'remote cache env currently supports file: targets only',
      source,
      status: 'fail',
    };
  }

  env = {
    [REMOTE_CACHE_MODE_ENV]: mode,
    [REMOTE_CACHE_URL_ENV]: remoteUrl,
  };
  return {
    commands,
    env,
    reason,
    source,
    status: 'pass',
  };
}

function printTextEnv(result) {
  if (result.status !== 'pass') {
    console.log(`[quality] remote cache env failed: ${result.reason ?? 'unknown error'}`);
    return;
  }
  console.log(result.commands.activateCommand);
}

export function remoteCacheEnv(options = {}) {
  const result = remoteCacheEnvPlan(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextEnv(result);
  }
  return result;
}

function setupSuggestion(options = {}) {
  const rootPath = path.resolve(options.remoteCachePath ?? defaultRemoteCachePath());
  const url = options.remoteCacheUrl ?? remoteCacheUrlForPath(rootPath);
  return {
    commands: [
      `mkdir -p ${JSON.stringify(rootPath)}`,
      `export ${REMOTE_CACHE_URL_ENV}=${JSON.stringify(url)}`,
      `export ${REMOTE_CACHE_MODE_ENV}=readwrite`,
      'npm run verify:affected',
    ],
    env: {
      [REMOTE_CACHE_MODE_ENV]: 'readwrite',
      [REMOTE_CACHE_URL_ENV]: url,
    },
    rootPath,
  };
}

function printTextDoctor(result) {
  const { diagnostics, source, suggestion } = result;
  const details = [
    `source=${source}`,
    `status=${diagnostics.status}`,
    `mode=${diagnostics.mode}`,
    `backend=${diagnostics.backend}`,
    diagnostics.protocol ? `protocol=${diagnostics.protocol}` : null,
    `usable=${diagnostics.usable ? 'yes' : 'no'}`,
    diagnostics.rootExists === undefined ? null : `rootExists=${diagnostics.rootExists ? 'yes' : 'no'}`,
    diagnostics.canRead === undefined ? null : `canRead=${diagnostics.canRead ? 'yes' : 'no'}`,
    diagnostics.canWrite === undefined ? null : `canWrite=${diagnostics.canWrite ? 'yes' : 'no'}`,
    diagnostics.rootPath ? `root=${diagnostics.rootPath}` : null,
    diagnostics.reason ? `reason=${diagnostics.reason}` : null,
  ].filter(Boolean).join(' ');
  console.log(`[quality] remote cache doctor ${details}`);
  if (diagnostics.usable) {
    console.log('[quality] remote cache is usable for the selected mode.');
    return;
  }
  console.log('[quality] suggested local shared cache setup:');
  for (const command of suggestion.commands) {
    console.log(`  ${command}`);
  }
}

export function remoteCacheDoctor(options = {}) {
  const { env, source } = remoteCacheEnvForOptions(options, options.env ?? process.env, {
    commandName: 'remote cache doctor',
    defaultModeForOverride: 'readwrite',
  });
  const suggestion = setupSuggestion(options);
  const result = {
    diagnostics: getRemoteCacheDiagnostics(env),
    source,
    suggestion,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printTextDoctor(result);
  }
  return result;
}
