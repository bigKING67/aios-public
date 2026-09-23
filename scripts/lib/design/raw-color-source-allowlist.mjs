import {
  assertRepoRelativePath,
  repoFileExists,
  readRequiredJsonFile,
} from '../shared/guard-utils.mjs';

export const RAW_COLOR_SOURCE_ALLOWLIST_PATH = 'scripts/config/allowlists/design-raw-color-allowlist.json';

function assertRawColorSourcePath(sourcePath, fail, options = {}) {
  const {
    fileExists,
    requireExistingFiles = true,
  } = options;
  const normalizedPath = assertRepoRelativePath(sourcePath, fail, {
    allowedPrefixes: ['apps/web-vite/src/'],
    context: sourcePath,
  });

  if (requireExistingFiles && !fileExists(normalizedPath)) {
    fail(`${normalizedPath} does not exist.`);
  }

  return normalizedPath;
}

export function parseRawColorSourceAllowlist(config, fail, options = {}) {
  const {
    fileExists = () => false,
    requireMetadata = true,
    requireExistingFiles = true,
  } = options;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} root must be an object.`);
  }

  if (config.version !== 1) {
    fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} version must be 1.`);
  }

  if (!Array.isArray(config.sources)) {
    fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources must be an array.`);
  }

  const sourceFiles = new Set();
  const requiredMetadata = ['owner', 'reason', 'allowed', 'notAllowed'];

  config.sources.forEach((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[${index}] must be an object.`);
    }

    if (typeof source.path !== 'string' || source.path.trim() === '') {
      fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[${index}].path must be a non-empty string.`);
    }

    if (requireMetadata) {
      for (const field of requiredMetadata) {
        if (typeof source[field] !== 'string' || source[field].trim() === '') {
          fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[${index}].${field} must be a non-empty string.`);
        }
      }
    }

    const normalizedPath = assertRawColorSourcePath(source.path.trim(), fail, {
      fileExists,
      requireExistingFiles,
    });

    if (sourceFiles.has(normalizedPath)) {
      fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} contains duplicate path: ${normalizedPath}`);
    }

    sourceFiles.add(normalizedPath);
  });

  return sourceFiles;
}

export function readRawColorSourceAllowlist(repoRoot, fail, options = {}) {
  const { requireExistingFiles = true } = options;
  const config = readRequiredJsonFile(repoRoot, RAW_COLOR_SOURCE_ALLOWLIST_PATH, fail, {
    missingMessage: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} not found.`,
  });

  return parseRawColorSourceAllowlist(config, fail, {
    ...options,
    fileExists: (normalizedPath) => !requireExistingFiles || repoFileExists(repoRoot, normalizedPath),
  });
}
