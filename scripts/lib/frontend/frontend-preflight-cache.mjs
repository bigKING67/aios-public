import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  commandOutput,
  parseArgs,
} from './frontend-preflight-cache-command.mjs';
import {
  fileDigest,
  readManifestSnapshot,
} from './frontend-preflight-cache-manifest.mjs';
import {
  CACHE_DIR,
  CACHE_SCHEMA_VERSION,
  readCacheHit,
  writeCachePass,
} from './frontend-preflight-cache-store.mjs';

export {
  CACHE_SCHEMA_VERSION,
  readCacheHit,
  writeCachePass,
} from './frontend-preflight-cache-store.mjs';

const HELPER_PATH = fileURLToPath(import.meta.url);

export const FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES = Object.freeze([
  'frontend-preflight-cache-command.mjs',
  'frontend-preflight-cache-manifest.mjs',
  'frontend-preflight-cache-store.mjs',
]);

function normalizedRelative(repoRoot, filePath) {
  const relativePath = path.relative(repoRoot, filePath);
  return relativePath.startsWith('..') ? filePath : relativePath.split(path.sep).join('/');
}

function helperInputPaths(helperPath) {
  const helperDir = path.dirname(helperPath);
  return [
    helperPath,
    ...FRONTEND_PREFLIGHT_CACHE_HELPER_BASENAMES.map((fileName) => path.join(helperDir, fileName)),
  ];
}

function hashHelperInputs(hash, repoRoot, helperPath) {
  for (const inputPath of helperInputPaths(helperPath)) {
    hash.update(`helper=${normalizedRelative(repoRoot, inputPath)}:${fileDigest(inputPath)}\n`);
  }
}

export function computeCacheKey(options) {
  const repoRoot = path.resolve(options['repo-root']);
  const vendorDir = path.resolve(options['vendor-dir']);
  const manifestPath = path.resolve(options['manifest-file']);
  const wrapperPath = path.resolve(options.wrapper);
  const helperPath = path.resolve(options['helper-path'] || HELPER_PATH);
  const pythonBin = options['python-bin'];
  const pythonId = options['python-id'] || pythonBin;
  const pythonVersionId = options['python-version-id']
    || commandOutput(pythonBin, ['-c', 'import platform, sys; print(platform.python_implementation(), sys.version)'], { cwd: repoRoot });
  const bashVersionId = options['bash-version-id']
    || commandOutput('bash', ['--version'], { cwd: repoRoot });
  const gitVersionId = options['git-version-id']
    || commandOutput('git', ['--version'], { cwd: repoRoot });
  const systemId = options['system-id']
    || commandOutput('uname', ['-sm'], { cwd: repoRoot });
  const skipPrompts = options['skip-prompts'] ?? '1';
  const manifestSnapshot = readManifestSnapshot(manifestPath, vendorDir);

  if (skipPrompts !== '1') {
    return {
      cacheable: false,
      reason: 'prompt sync reads global Codex prompt files',
    };
  }

  const hash = createHash('sha256');
  hash.update(`schema=${CACHE_SCHEMA_VERSION}\n`);
  hashHelperInputs(hash, repoRoot, helperPath);
  hash.update(`wrapper=${normalizedRelative(repoRoot, wrapperPath)}:${fileDigest(wrapperPath)}\n`);
  hash.update(`manifest=${normalizedRelative(repoRoot, manifestPath)}:${manifestSnapshot.digest}\n`);
  hash.update(`node=${process.version}\n`);
  hash.update(`bash=${bashVersionId}\n`);
  hash.update(`python_id=${pythonId}\n`);
  hash.update(`python_version=${pythonVersionId}\n`);
  hash.update(`git=${gitVersionId}\n`);
  hash.update(`system=${systemId}\n`);
  hash.update(`skip_prompts=${skipPrompts}\n`);

  for (const entry of manifestSnapshot.entries) {
    hash.update(`entry=${entry.raw}\n`);
    hash.update(`mode=${entry.mode}\n`);
    hash.update(`actual=${entry.actualDigest}\n`);
  }

  const cacheKey = hash.digest('hex');
  return {
    cacheable: true,
    cacheFile: path.join(repoRoot, CACHE_DIR, `${cacheKey}.json`),
    cacheKey,
    reason: 'content-addressed vendor preflight snapshot',
  };
}

function printProbe(result) {
  const lines = [
    `cacheable=${result.cacheable ? '1' : '0'}`,
    `cache_schema=${CACHE_SCHEMA_VERSION}`,
    `cache_key=${result.cacheKey ?? ''}`,
    `cache_file=${result.cacheFile ?? ''}`,
    `cache_hit=${result.hit ? '1' : '0'}`,
    `cache_reason=${result.reason ?? ''}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function commandProbe(argv) {
  const options = parseArgs(argv);
  if (options['disabled-reason']) {
    if (options['manifest-file'] && options['vendor-dir']) {
      readManifestSnapshot(path.resolve(options['manifest-file']), path.resolve(options['vendor-dir']));
    }
    printProbe({
      cacheable: false,
      hit: false,
      reason: options['disabled-reason'],
    });
    return;
  }
  const result = computeCacheKey(options);
  printProbe({
    ...result,
    hit: result.cacheable ? readCacheHit(result.cacheFile, result.cacheKey) : false,
  });
}

function commandWrite(argv) {
  const options = parseArgs(argv);
  writeCachePass(options['cache-file'], options['cache-key']);
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'probe') {
    commandProbe(argv);
    return;
  }
  if (command === 'write') {
    commandWrite(argv);
    return;
  }
  throw new Error(`unknown command: ${command ?? '<missing>'}`);
}

function isCliEntrypoint() {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  try {
    return realpathSync(entryPath) === realpathSync(HELPER_PATH);
  } catch {
    return path.resolve(entryPath) === path.resolve(HELPER_PATH);
  }
}

if (isCliEntrypoint()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[frontend-preflight-cache] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
