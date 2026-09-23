import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
  normalizeOutputPatterns,
} from './quality-cache-artifacts.mjs';
import {
  createQualityRepoScan,
  expandQualityInputPatterns,
} from './quality-repo-scan.mjs';
import {
  fileDigest,
  hashString,
} from './quality-cache-digests.mjs';

export {
  flushQualityCacheContext,
} from './quality-cache-digests.mjs';

export const CACHE_SCHEMA_VERSION = 3;

export function createQualityCacheContext(repoRoot, options = {}) {
  return {
    repoRoot,
    diskDigestCache: null,
    env: options.env ?? process.env,
    expandedInputs: new Map(),
    fileDigests: new Map(),
    repoScan: options.repoScan ?? null,
    toolVersions: new Map(),
    toolVersionProbe: options.toolVersionProbe ?? null,
    trackedFiles: null,
  };
}

const PROCESS_TOOL_VERSIONS = new Map([
  ['node\0--version', process.version],
]);

export function resetProcessToolVersionCacheForTests() {
  PROCESS_TOOL_VERSIONS.clear();
  PROCESS_TOOL_VERSIONS.set('node\0--version', process.version);
}

function defaultToolVersionProbe(command, args, repoRoot) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function repoScanForContext(repoRoot, context = null) {
  if (!context) {
    return null;
  }
  if (!context.repoScan) {
    context.repoScan = createQualityRepoScan(repoRoot, {
      trackedFiles: context.trackedFiles,
    });
    context.trackedFiles = context.repoScan.trackedFiles;
  }
  return context.repoScan;
}

function expandInputPatterns(repoRoot, patterns, context = null) {
  const normalizedPatterns = patterns ?? [];
  const cacheKey = normalizedPatterns.join('\0');
  if (context?.expandedInputs.has(cacheKey)) {
    return context.expandedInputs.get(cacheKey);
  }

  if (normalizedPatterns.length === 0) {
    const expanded = [];
    context?.expandedInputs.set(cacheKey, expanded);
    return expanded;
  }

  const expanded = expandQualityInputPatterns(repoRoot, normalizedPatterns, repoScanForContext(repoRoot, context));
  context?.expandedInputs.set(cacheKey, expanded);
  return expanded;
}

export function expandGateInputFiles(repoRoot, inputs, context = null) {
  return expandInputPatterns(repoRoot, inputs ?? [], context);
}

function toolVersion(command, args, repoRoot, context = null) {
  const cacheKey = `${command}\0${args.join('\0')}`;
  if (context?.toolVersions.has(cacheKey)) {
    return context.toolVersions.get(cacheKey);
  }
  if (PROCESS_TOOL_VERSIONS.has(cacheKey)) {
    const version = PROCESS_TOOL_VERSIONS.get(cacheKey);
    context?.toolVersions.set(cacheKey, version);
    return version;
  }

  let version;
  try {
    const probe = typeof context?.toolVersionProbe === 'function'
      ? context.toolVersionProbe
      : defaultToolVersionProbe;
    version = String(probe(command, args, repoRoot) ?? '').trim();
  } catch {
    version = '<unavailable>';
  }
  PROCESS_TOOL_VERSIONS.set(cacheKey, version);
  context?.toolVersions.set(cacheKey, version);
  return version;
}

function commandUsesNpm(command) {
  return /(?:^|\s)(?:npm|npx)\s/u.test(String(command ?? ''));
}

function normalizeEnvKeys(envKeys) {
  return [...new Set((envKeys ?? [])
    .filter((envKey) => typeof envKey === 'string' && envKey.trim())
    .map((envKey) => envKey.trim()))]
    .sort();
}

function envValueForCache(env, key) {
  if (!Object.hasOwn(env ?? {}, key)) {
    return '<unset>';
  }
  return String(env[key] ?? '');
}

export function computeGateCacheKey(repoRoot, gate, context = null) {
  const files = expandInputPatterns(repoRoot, gate.inputs ?? [], context);
  const env = context?.env ?? process.env;
  const envKeys = normalizeEnvKeys(gate.envKeys);
  const outputs = normalizeOutputPatterns(gate.outputs);
  const hash = createHash('sha256');
  hash.update(`schema=${CACHE_SCHEMA_VERSION}\n`);
  hash.update(`gate=${gate.name}\n`);
  hash.update(`command=${gate.command}\n`);
  hash.update(`node=${process.version}\n`);
  if (commandUsesNpm(gate.command)) {
    hash.update(`npm=${toolVersion('npm', ['--version'], repoRoot, context)}\n`);
  }
  for (const output of outputs) {
    hash.update(`output=${output}\n`);
  }
  for (const envKey of envKeys) {
    hash.update(`env=${envKey}\n`);
    hash.update(hashString(envValueForCache(env, envKey)));
    hash.update('\n');
  }
  if (gate.group === 'backend' || gate.command.includes('cargo ')) {
    hash.update(`rustc=${toolVersion('rustc', ['--version'], repoRoot, context)}\n`);
    hash.update(`cargo=${toolVersion('cargo', ['--version'], repoRoot, context)}\n`);
  }

  for (const file of files) {
    hash.update(`file=${file}\n`);
    hash.update(fileDigest(repoRoot, file, context));
    hash.update('\n');
  }

  return {
    cacheKey: hash.digest('hex'),
    files,
  };
}
