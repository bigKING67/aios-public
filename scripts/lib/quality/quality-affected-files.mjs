import { execFileSync } from 'node:child_process';

import {
  packageJsonChangeKind as packageJsonChangeKindWithBase,
  packageLockChangeKind as packageLockChangeKindWithBase,
} from './quality-affected-package-diff.mjs';
import {
  dedupeChangedFileEntries,
  parseChangedFileEntry,
  parseGitNameStatusLine,
  parseGitStatusLine,
} from './quality-changed-file-entries.mjs';

export {
  packageJsonChangeRequiresFullCiWithReader,
  packageLockChangeRequiresFullCiWithReader,
} from './quality-affected-package-diff.mjs';
export {
  changedFilesEnvValue,
} from './quality-changed-file-entries.mjs';

const GIT_REPOSITORY_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]);

function gitCommandEnv() {
  const env = { ...process.env };
  // Hooks export repository-bound GIT_* values that would override repoRoot.
  for (const key of GIT_REPOSITORY_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function runGit(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitCommandEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function hasRef(repoRoot, ref) {
  try {
    runGit(repoRoot, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

export function packageJsonChangeRequiresFullCi(repoRoot, base = defaultAffectedBase(repoRoot), head = null) {
  return packageJsonChangeKind(repoRoot, base, head) === 'full-ci';
}

export function packageLockChangeRequiresFullCi(repoRoot, base = defaultAffectedBase(repoRoot), head = null) {
  return packageLockChangeKind(repoRoot, base, head) === 'full-ci';
}

export function packageJsonChangeKind(repoRootOrOptions = {}, base = undefined, head = null) {
  if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
    return packageJsonChangeKindWithBase(repoRootOrOptions);
  }
  const repoRoot = repoRootOrOptions;
  const resolvedBase = base === undefined ? defaultAffectedBase(repoRoot) : base;
  return packageJsonChangeKindWithBase(repoRoot, resolvedBase, head, runGit);
}

export function packageLockChangeKind(repoRootOrOptions = {}, base = undefined, head = null) {
  if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
    return packageLockChangeKindWithBase(repoRootOrOptions);
  }
  const repoRoot = repoRootOrOptions;
  const resolvedBase = base === undefined ? defaultAffectedBase(repoRoot) : base;
  return packageLockChangeKindWithBase(repoRoot, resolvedBase, head, runGit);
}

export function isIgnoredAffectedFile(file) {
  return [
    /^\.tmp-.*\.pid$/,
    /^\.cache\//,
    /^apps\/web-vite\/dist\//,
  ].some((pattern) => pattern.test(file));
}

export function defaultAffectedBase(repoRoot) {
  if (hasRef(repoRoot, 'origin/main')) {
    return 'origin/main';
  }
  if (hasRef(repoRoot, 'HEAD')) {
    return 'HEAD';
  }
  return null;
}

export function listChangedFileEntries(repoRoot, options = {}) {
  const {
    explicitFiles,
  } = options;
  if (explicitFiles?.length) {
    return dedupeChangedFileEntries(explicitFiles.map(parseChangedFileEntry));
  }

  const base = options.base === undefined ? defaultAffectedBase(repoRoot) : options.base;
  const entries = [];
  if (base === null) {
    try {
      entries.push(
        ...runGit(repoRoot, ['status', '--short', '--untracked-files=all'])
          .split(/\r?\n/)
          .map(parseGitStatusLine)
          .filter(Boolean),
      );
    } catch {
      // Ignore unavailable git state; safe fallback handles empty/unknown cases.
    }
    return dedupeChangedFileEntries(entries);
  }

  if (base) {
    try {
      entries.push(
        ...runGit(repoRoot, ['diff', '--name-status', '--find-renames', `${base}...HEAD`])
          .split(/\r?\n/)
          .map(parseGitNameStatusLine)
          .filter(Boolean),
      );
    } catch {
      try {
        entries.push(
          ...runGit(repoRoot, ['diff', '--name-status', '--find-renames', base])
            .split(/\r?\n/)
            .map(parseGitNameStatusLine)
            .filter(Boolean),
        );
      } catch {
        // Continue with worktree diffs below.
      }
    }
  }

  for (const args of [
    ['diff', '--name-status', '--find-renames'],
    ['diff', '--name-status', '--find-renames', '--cached'],
    ['status', '--short', '--untracked-files=all'],
  ]) {
    try {
      const parser = args[0] === 'status' ? parseGitStatusLine : parseGitNameStatusLine;
      entries.push(
        ...runGit(repoRoot, args)
          .split(/\r?\n/)
          .map(parser)
          .filter(Boolean),
      );
    } catch {
      // Ignore unavailable git state; safe fallback handles empty/unknown cases.
    }
  }

  return dedupeChangedFileEntries(entries);
}

export function listChangedFiles(repoRoot, options = {}) {
  return listChangedFileEntries(repoRoot, options).map((entry) => entry.file);
}
