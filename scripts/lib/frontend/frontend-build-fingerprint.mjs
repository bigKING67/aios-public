import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const FRONTEND_BUILD_MANIFEST_PATH = 'apps/web-vite/dist/aios-build-manifest.json';

const SOURCE_DIRS = Object.freeze([
  'apps/web-vite/src',
  'public',
  'apps/web-vite/src',
]);

const CONFIG_FILES = Object.freeze([
  'apps/web-vite/index.html',
  'apps/web-vite/tsconfig.json',
  'apps/web-vite/vite.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
]);

const ENV_FILES = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  'apps/web-vite/.env',
  'apps/web-vite/.env.local',
  'apps/web-vite/.env.production',
  'apps/web-vite/.env.production.local',
]);

const VITE_ENV_KEYS = Object.freeze([
  'API_GATEWAY_PREFIX',
  'AIOS_ACCESS_COOKIE_NAME',
  'AIOS_REFRESH_COOKIE_NAME',
  'NODE_ENV',
  'VITE_API_DEBUG_LOGS',
  'VITE_API_GATEWAY_PREFIX',
  'VITE_API_GATEWAY_TARGET',
  'VITE_API_URL',
  'VITE_DASHBOARD_MAX_QUERY_DAYS',
  'VITE_FORCE_FRESH_DATA',
  'VITE_REPORT_API',
  'VITE_SUPER_ADMIN_ACCOUNTS',
]);

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
]);

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function createFingerprintIo(options = {}) {
  return {
    exists: options.exists ?? existsSync,
    isDirectory: options.isDirectory ?? ((filePath) => statSync(filePath).isDirectory()),
    isFile: options.isFile ?? ((filePath) => statSync(filePath).isFile()),
    listDir: options.listDir ?? ((filePath) => readdirSync(filePath, { withFileTypes: true })),
    readFile: options.readFile ?? readFileSync,
  };
}

function isReadableFile(filePath, io) {
  try {
    return io.exists(filePath) && io.isFile(filePath);
  } catch {
    return false;
  }
}

function listFilesRecursive(absDir, repoRoot, io) {
  if (!io.exists(absDir) || !io.isDirectory(absDir)) {
    return [];
  }

  const files = [];
  const entries = io.listDir(absDir)
    .filter((entry) => !IGNORED_FILE_NAMES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(absPath, repoRoot, io));
      continue;
    }

    if (entry.isFile()) {
      files.push(normalizeRepoPath(path.relative(repoRoot, absPath)));
    }
  }

  return files;
}

export function listFrontendBuildFingerprintInputs(repoRoot, options = {}) {
  const io = createFingerprintIo(options);
  const fileInputs = new Set();

  for (const filePath of [...CONFIG_FILES, ...ENV_FILES]) {
    if (isReadableFile(path.join(repoRoot, filePath), io)) {
      fileInputs.add(filePath);
    }
  }

  for (const sourceDir of SOURCE_DIRS) {
    for (const filePath of listFilesRecursive(path.join(repoRoot, sourceDir), repoRoot, io)) {
      fileInputs.add(filePath);
    }
  }

  return {
    envKeys: [...VITE_ENV_KEYS],
    files: [...fileInputs].sort(),
  };
}

export function computeFrontendBuildFingerprint(repoRoot, options = {}) {
  const env = options.env ?? process.env;
  const io = createFingerprintIo(options);
  const inputs = listFrontendBuildFingerprintInputs(repoRoot, io);
  const hash = createHash('sha256');

  hash.update('aios-frontend-build-fingerprint-v1\0');

  for (const envKey of inputs.envKeys) {
    hash.update('env\0');
    hash.update(envKey);
    hash.update('\0');
    hash.update(env[envKey] ?? '');
    hash.update('\0');
  }

  for (const filePath of inputs.files) {
    const absPath = path.join(repoRoot, filePath);
    const content = io.readFile(absPath);
    hash.update('file\0');
    hash.update(filePath);
    hash.update('\0');
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }

  return {
    envKeys: inputs.envKeys,
    files: inputs.files,
    fingerprint: hash.digest('hex'),
    version: 1,
  };
}
