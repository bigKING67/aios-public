import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const GIT_LS_FILES_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export function normalizeQualityRepoPath(filePath) {
  return String(filePath ?? '').split(path.sep).join('/');
}

function globPrefix(pattern) {
  const wildcardIndex = pattern.search(/[*?[{]/);
  const rawPrefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
  const slashIndex = rawPrefix.lastIndexOf('/');
  return slashIndex === -1 ? '' : rawPrefix.slice(0, slashIndex + 1);
}

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

export function listQualityTrackedFiles(repoRoot) {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: repoRoot,
      encoding: 'buffer',
      maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map(normalizeQualityRepoPath)
      .sort();
  } catch {
    return [];
  }
}

function expandPatternsWithTrackedFiles(repoRoot, patterns, trackedFiles) {
  const files = new Set();
  for (const pattern of patterns) {
    if (!pattern || pattern.includes('{')) {
      continue;
    }
    const normalizedPattern = normalizeQualityRepoPath(pattern);
    if (!/[?*[]/.test(normalizedPattern)) {
      const fullPath = path.join(repoRoot, normalizedPattern);
      if (existsSync(fullPath)) {
        files.add(normalizedPattern);
      }
      continue;
    }
    const prefix = globPrefix(normalizedPattern);
    const matcher = globToRegExp(normalizedPattern);
    for (const file of trackedFiles) {
      if (prefix && !file.startsWith(prefix)) {
        continue;
      }
      if (matcher.test(file)) {
        files.add(file);
      }
    }
  }
  return [...files].sort();
}

export function createQualityRepoScan(repoRoot, options = {}) {
  const trackedFiles = options.trackedFiles
    ? [...options.trackedFiles].map(normalizeQualityRepoPath).sort()
    : listQualityTrackedFiles(repoRoot);
  const expandedInputs = new Map();
  const fileStats = new Map();

  return {
    repoRoot,
    trackedFiles,
    expandPatterns(patterns) {
      const normalizedPatterns = [...new Set((patterns ?? [])
        .filter((pattern) => typeof pattern === 'string' && pattern.trim())
        .map((pattern) => normalizeQualityRepoPath(pattern.trim())))]
        .sort();
      const cacheKey = normalizedPatterns.join('\0');
      if (expandedInputs.has(cacheKey)) {
        return expandedInputs.get(cacheKey);
      }
      const expanded = expandPatternsWithTrackedFiles(repoRoot, normalizedPatterns, trackedFiles);
      expandedInputs.set(cacheKey, expanded);
      return expanded;
    },
    statFile(file) {
      const normalized = normalizeQualityRepoPath(file);
      if (fileStats.has(normalized)) {
        return fileStats.get(normalized);
      }
      const fullPath = path.join(repoRoot, normalized);
      let result;
      try {
        const stat = statSync(fullPath);
        result = stat.isFile()
          ? {
              ctimeMs: Math.round(stat.ctimeMs),
              mtimeMs: Math.round(stat.mtimeMs),
              path: normalized,
              size: stat.size,
            }
          : null;
      } catch {
        result = {
          missing: true,
          path: normalized,
        };
      }
      fileStats.set(normalized, result);
      return result;
    },
  };
}

export function expandQualityInputPatterns(repoRoot, patterns, repoScan = null) {
  const scan = repoScan ?? createQualityRepoScan(repoRoot);
  return scan.expandPatterns(patterns);
}
