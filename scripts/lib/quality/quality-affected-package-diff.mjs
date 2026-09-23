import { readFileSync } from 'node:fs';

import {
  packageScriptChangeCanUseFastPath,
} from './quality-affected-gates.mjs';

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function readJsonAtGitRef(repoRoot, ref, file, gitRunner) {
  return JSON.parse(gitRunner(repoRoot, ['show', `${ref}:${file}`]));
}

export function packageJsonChangeRequiresFullCi(repoRoot, base, head = null, gitRunner) {
  return packageJsonChangeKind(repoRoot, base, head, gitRunner) === 'full-ci';
}

export function packageLockChangeRequiresFullCi(repoRoot, base, head = null, gitRunner) {
  return packageLockChangeKind(repoRoot, base, head, gitRunner) === 'full-ci';
}

export function packageJsonChangeRequiresFullCiWithReader(options = {}) {
  return packageJsonChangeKind(options) === 'full-ci';
}

function packageJsonChangeKindWithReader(options = {}) {
  const {
    base,
    currentPackageJson,
    previousPackageJson,
    repoRoot,
  } = options;
  if (!repoRoot || !base) {
    return 'full-ci';
  }

  let previous;
  let current;
  try {
    previous = previousPackageJson();
    current = currentPackageJson();
  } catch {
    return 'full-ci';
  }

  const topLevelFields = new Set([...Object.keys(previous), ...Object.keys(current)]);
  topLevelFields.delete('scripts');
  topLevelFields.delete('version');
  for (const field of topLevelFields) {
    if (stableJson(previous[field]) !== stableJson(current[field])) {
      return 'full-ci';
    }
  }

  const previousScripts = previous.scripts ?? {};
  const currentScripts = current.scripts ?? {};
  const scriptNames = new Set([...Object.keys(previousScripts), ...Object.keys(currentScripts)]);
  let hasScriptFastPathChange = false;
  for (const scriptName of scriptNames) {
    if (stableJson(previousScripts[scriptName]) === stableJson(currentScripts[scriptName])) {
      continue;
    }
    if (!packageScriptChangeCanUseFastPath(scriptName, previousScripts[scriptName], currentScripts[scriptName])) {
      return 'full-ci';
    }
    hasScriptFastPathChange = true;
  }

  return hasScriptFastPathChange ? 'script-fast-path' : 'release-metadata-only';
}

export function packageJsonChangeKind(repoRootOrOptions = {}, base = undefined, head = null, gitRunner = null) {
  if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
    return packageJsonChangeKindWithReader(repoRootOrOptions);
  }
  const repoRoot = repoRootOrOptions;
  if (!gitRunner || base === undefined) {
    return 'full-ci';
  }
  return packageJsonChangeKindWithReader({
    currentPackageJson: () => (head
      ? readJsonAtGitRef(repoRoot, head, 'package.json', gitRunner)
      : JSON.parse(readFileSync(`${repoRoot}/package.json`, 'utf8'))),
    previousPackageJson: () => readJsonAtGitRef(repoRoot, base, 'package.json', gitRunner),
    repoRoot,
    base,
  });
}

function packageLockWithoutRootVersion(payload) {
  const normalized = structuredClone(payload ?? {});
  delete normalized.version;
  if (normalized.packages?.['']) {
    delete normalized.packages[''].version;
  }
  return normalized;
}

export function packageLockChangeRequiresFullCiWithReader(options = {}) {
  return packageLockChangeKind(options) === 'full-ci';
}

function packageLockChangeKindWithReader(options = {}) {
  const {
    base,
    currentPackageLock,
    previousPackageLock,
    repoRoot,
  } = options;
  if (!repoRoot || !base) {
    return 'full-ci';
  }

  let previous;
  let current;
  try {
    previous = previousPackageLock();
    current = currentPackageLock();
  } catch {
    return 'full-ci';
  }

  return stableJson(packageLockWithoutRootVersion(previous)) === stableJson(packageLockWithoutRootVersion(current))
    ? 'release-metadata-only'
    : 'full-ci';
}

export function packageLockChangeKind(repoRootOrOptions = {}, base = undefined, head = null, gitRunner = null) {
  if (typeof repoRootOrOptions === 'object' && repoRootOrOptions !== null) {
    return packageLockChangeKindWithReader(repoRootOrOptions);
  }
  const repoRoot = repoRootOrOptions;
  if (!gitRunner || base === undefined) {
    return 'full-ci';
  }
  return packageLockChangeKindWithReader({
    currentPackageLock: () => (head
      ? readJsonAtGitRef(repoRoot, head, 'package-lock.json', gitRunner)
      : JSON.parse(readFileSync(`${repoRoot}/package-lock.json`, 'utf8'))),
    previousPackageLock: () => readJsonAtGitRef(repoRoot, base, 'package-lock.json', gitRunner),
    repoRoot,
    base,
  });
}
