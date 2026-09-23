import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../shared/guard-utils.mjs';
import {
  REPO_NAMING_ENFORCED_PATHS,
  isRepoNamingEnforcedPath,
} from './repo-governance-gates.mjs';

const GUARD_NAME = 'repo-naming';
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|css)$/u;
const LOWER_KEBAB_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const DIRECTORY_NAME_PATTERN = new RegExp(`^_?${LOWER_KEBAB_SEGMENT}$`, 'u');
const DYNAMIC_ROUTE_SEGMENT_PATTERN = /^\[[A-Za-z_$][\w$]*\]$/u;
const LOWER_KEBAB_SOURCE_FILE_PATTERNS = Object.freeze([
  new RegExp(`^${LOWER_KEBAB_SEGMENT}\\.(?:ts|tsx|js|jsx|mjs|css)$`, 'u'),
  new RegExp(`^${LOWER_KEBAB_SEGMENT}\\.(?:test|spec)\\.(?:ts|tsx|js|jsx|mjs)$`, 'u'),
  new RegExp(`^${LOWER_KEBAB_SEGMENT}\\.module\\.css$`, 'u'),
  new RegExp(`^${LOWER_KEBAB_SEGMENT}\\.behavior\\.mjs$`, 'u'),
]);

const CANONICAL_FRAMEWORK_FILES = Object.freeze(new Set([
  'error.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.ts',
  'index.tsx',
  'layout.tsx',
  'loading.tsx',
  'not-found.tsx',
  'page.tsx',
]));

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listSourceFilesRecursive(repoRoot, relativePath, options = {}) {
  const {
    listDirEntries = (dirPath) => readdirSync(path.join(repoRoot, dirPath), { withFileTypes: true }),
    statPath = (filePath) => statSync(path.join(repoRoot, filePath)),
  } = options;
  let stat;
  try {
    stat = statPath(relativePath);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return SOURCE_FILE_PATTERN.test(relativePath) ? [relativePath] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const files = [];
  function walk(currentPath) {
    const entries = listDirEntries(currentPath)
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = normalizeRepoPath(path.join(currentPath, entry.name));
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && SOURCE_FILE_PATTERN.test(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  walk(relativePath);
  return files;
}

export function listRepoNamingSourceFiles(repoRoot, options = {}) {
  return [...new Set(REPO_NAMING_ENFORCED_PATHS.flatMap((root) => (
    listSourceFilesRecursive(repoRoot, root, options)
  )))].sort();
}

function isCanonicalSourceFilename(filename) {
  return CANONICAL_FRAMEWORK_FILES.has(filename)
    || LOWER_KEBAB_SOURCE_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function listDirectorySegments(file) {
  const dir = path.dirname(file);
  if (dir === '.' || !dir) {
    return [];
  }
  return dir.split('/');
}

function isCanonicalDirectorySegment(segment) {
  return DIRECTORY_NAME_PATTERN.test(segment) || DYNAMIC_ROUTE_SEGMENT_PATTERN.test(segment);
}

export function auditRepoNamingFile(file) {
  if (!isRepoNamingEnforcedPath(file) || !SOURCE_FILE_PATTERN.test(file)) {
    return [];
  }

  const findings = [];
  for (const segment of listDirectorySegments(file)) {
    if (!isCanonicalDirectorySegment(segment)) {
      findings.push({
        file,
        kind: 'directory',
        segment,
        reason: 'directory names inside migrated source domains must use lower-kebab-case; a leading "_" is allowed for private route folders; React Router dynamic page segments may use "[paramName]"',
        suggestion: 'rename the directory to lower-kebab-case, an explicit private folder such as "_components", or a valid dynamic route segment such as "[assetId]"',
      });
    }
  }

  const filename = path.basename(file);
  if (!isCanonicalSourceFilename(filename)) {
    findings.push({
      file,
      kind: 'file',
      segment: filename,
      reason: 'source files inside migrated domains must use lower-kebab-case while exported symbols may stay PascalCase',
      suggestion: 'rename the file to lower-kebab-case, for example "creator-library-detail-drawer.tsx"',
    });
  }

  return findings;
}

export function auditRepoNamingFiles(files) {
  return files.flatMap(auditRepoNamingFile);
}

export function formatRepoNamingFindings(findings) {
  const lines = [`[${GUARD_NAME}] Non-canonical repository names were found:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}`);
    lines.push(`  kind: ${finding.kind}`);
    lines.push(`  segment: ${finding.segment}`);
    lines.push(`  reason: ${finding.reason}`);
    lines.push(`  suggestion: ${finding.suggestion}`);
  }
  lines.push('');
  lines.push(`Enforced roots: ${REPO_NAMING_ENFORCED_PATHS.join(', ')}. Expand this list only after a domain has been migrated.`);
  return lines.join('\n');
}

export function runRepoNamingCheck() {
  const { fail, reportOk } = createCheckGuard(GUARD_NAME);
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listRepoNamingSourceFiles(repoRoot);
  const findings = auditRepoNamingFiles(files);

  if (findings.length > 0) {
    console.error(formatRepoNamingFindings(findings));
    process.exit(1);
  }

  reportOk(`scanned ${files.length} migrated source files; repository naming contract holds.`);
}
