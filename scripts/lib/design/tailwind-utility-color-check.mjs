import {
  assertRepoRelativePath,
  assertRepoRoot,
  listGitFiles,
  readRepoFileLines,
  readRequiredJsonFile,
  repoFileExists,
} from '../shared/guard-utils.mjs';
import {
  compareTailwindUtilityCounts,
  countTailwindColorUtilitiesInLines,
  countTailwindUtilityOccurrences,
  isSupportedTailwindUtilityAllowlistKey,
} from './tailwind-utility-color-core.mjs';

export const TAILWIND_UTILITY_COLOR_ALLOWLIST_CONFIG_PATH = 'scripts/config/allowlists/tailwind-utility-color-allowlist.json';

export const TAILWIND_UTILITY_COLOR_SOURCE_PATHS = Object.freeze([
  ':(glob)apps/web-vite/src/**/*.js',
  ':(glob)apps/web-vite/src/**/*.jsx',
  ':(glob)apps/web-vite/src/**/*.ts',
  ':(glob)apps/web-vite/src/**/*.tsx',
  ':(glob)apps/web-vite/src/**/*.css',
  ':(glob)apps/web-vite/src/**/*.js',
  ':(glob)apps/web-vite/src/**/*.jsx',
  ':(glob)apps/web-vite/src/**/*.ts',
  ':(glob)apps/web-vite/src/**/*.tsx',
  ':(glob)apps/web-vite/src/**/*.css',
]);

function failConfig(fail, message) {
  fail(`Invalid ${TAILWIND_UTILITY_COLOR_ALLOWLIST_CONFIG_PATH}: ${message}`);
}

function assertAllowedPath(filePath, fail, context) {
  return assertRepoRelativePath(filePath, (message) => failConfig(fail, message), {
    allowedPrefixes: ['apps/web-vite/src/', 'apps/web-vite/src/'],
    context,
  });
}

export function loadTailwindUtilityColorAllowlist(repoRoot, fail) {
  if (!repoFileExists(repoRoot, TAILWIND_UTILITY_COLOR_ALLOWLIST_CONFIG_PATH)) {
    failConfig(fail, 'file not found.');
  }

  const config = readRequiredJsonFile(repoRoot, TAILWIND_UTILITY_COLOR_ALLOWLIST_CONFIG_PATH, (message) => failConfig(fail, message));

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    failConfig(fail, 'root must be an object.');
  }

  if (config.version !== 1) {
    failConfig(fail, 'version must be 1.');
  }

  if (!Array.isArray(config.allowed)) {
    failConfig(fail, 'allowed must be an array.');
  }

  const allowlist = new Map();
  config.allowed.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      failConfig(fail, `allowed[${index}] must be an object.`);
    }

    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      failConfig(fail, `allowed[${index}].path must be a non-empty string.`);
    }

    const repoPath = assertAllowedPath(entry.path.trim(), fail, `allowed[${index}].path`);

    if (allowlist.has(repoPath)) {
      failConfig(fail, `${repoPath} is duplicated.`);
    }

    if (!repoFileExists(repoRoot, repoPath)) {
      failConfig(fail, `${repoPath} does not exist.`);
    }

    if (!entry.utilities || typeof entry.utilities !== 'object' || Array.isArray(entry.utilities)) {
      failConfig(fail, `allowed[${index}].utilities must be an object.`);
    }

    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      failConfig(fail, `allowed[${index}].reason must be a non-empty string.`);
    }

    const utilityCounts = new Map();
    for (const [utility, count] of Object.entries(entry.utilities)) {
      if (!isSupportedTailwindUtilityAllowlistKey(utility)) {
        failConfig(fail, `${repoPath} contains unsupported utility key: ${utility}`);
      }

      if (!Number.isInteger(count) || count <= 0) {
        failConfig(fail, `${repoPath}.${utility} count must be a positive integer.`);
      }

      utilityCounts.set(utility, count);
    }

    if (utilityCounts.size === 0) {
      failConfig(fail, `${repoPath} must list at least one utility.`);
    }

    allowlist.set(repoPath, utilityCounts);
  });

  return allowlist;
}

export function listTailwindUtilityColorCandidateFiles(repoRoot) {
  return listGitFiles(TAILWIND_UTILITY_COLOR_SOURCE_PATHS, {
    cwd: repoRoot,
  });
}

export function countTailwindUtilitiesInRepoFile(repoRoot, file) {
  return countTailwindColorUtilitiesInLines(
    file,
    readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' }),
  );
}

export function countTailwindUtilitiesInRepo(repoRoot) {
  const actual = new Map();
  const files = listTailwindUtilityColorCandidateFiles(repoRoot);

  for (const file of files) {
    const counts = countTailwindUtilitiesInRepoFile(repoRoot, file);
    if (counts.size > 0) {
      actual.set(file, counts);
    }
  }

  return { actual, fileCount: files.length };
}

export function auditTailwindUtilityColors(repoRoot, fail) {
  assertRepoRoot(repoRoot, fail);

  const allowlist = loadTailwindUtilityColorAllowlist(repoRoot, fail);
  const { actual, fileCount } = countTailwindUtilitiesInRepo(repoRoot);
  const violations = compareTailwindUtilityCounts(actual, allowlist);

  return {
    actual,
    fileCount,
    occurrenceCount: countTailwindUtilityOccurrences(actual),
    violations,
  };
}

export function formatTailwindUtilityColorDebtSummary(actual, occurrenceCount) {
  return occurrenceCount === 0
    ? 'clean baseline; no frozen Tailwind color utility debt.'
    : `${actual.size} allowlisted files; ${occurrenceCount} legacy/default, arbitrary raw-color, or compatibility-alias utility occurrences frozen.`;
}

export function formatTailwindUtilityColorViolation(violation) {
  const label = violation.type === 'stale' ? 'allowlist stale' : 'new/increased usage';
  return `${violation.file}: ${violation.utility} (${label}; actual=${violation.actual}, allowed=${violation.allowed})`;
}

export function reportTailwindUtilityColorAudit({
  fail,
  repoRoot,
  reportOk,
}) {
  const {
    actual,
    fileCount,
    occurrenceCount,
    violations,
  } = auditTailwindUtilityColors(repoRoot, fail);

  if (violations.length > 0) {
    console.error('[tailwind-utility-colors] Tailwind color utility drift found.');
    console.error(
      '[tailwind-utility-colors] Replace usages with AIOS aliases. ' +
        'Default palette utilities may only stay as frozen legacy debt; ' +
        'arbitrary raw-color utilities, legacy compatibility aliases, and legacy global utility definitions are not allowlisted.\n',
    );

    for (const violation of violations) {
      console.error(formatTailwindUtilityColorViolation(violation));
    }

    process.exit(1);
  }

  reportOk(`scanned ${fileCount} source files; ${formatTailwindUtilityColorDebtSummary(actual, occurrenceCount)}`);
}
