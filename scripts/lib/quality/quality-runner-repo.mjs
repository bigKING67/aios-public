import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import {
  defaultAffectedBase,
} from './quality-affected.mjs';

function gitCommitTimestamp(repoRoot, ref) {
  try {
    const unixSeconds = execFileSync('git', ['show', '-s', '--format=%ct', ref], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const timestamp = Number.parseInt(unixSeconds, 10);
    if (!Number.isInteger(timestamp)) {
      return null;
    }
    return new Date(timestamp * 1000).toISOString();
  } catch {
    return null;
  }
}

export function resolveStatsSince(repoRoot, options = {}) {
  if (options.since) {
    return options.since;
  }
  if (!options.sinceCommit) {
    return null;
  }
  const since = gitCommitTimestamp(repoRoot, options.sinceCommit);
  if (!since) {
    throw new Error(`--since-commit could not resolve git ref: ${options.sinceCommit}`);
  }
  return since;
}

export function getRepoRoot() {
  let current = process.cwd();
  while (current !== '/') {
    if (existsSync(`${current}/package.json`)) {
      return current;
    }
    current = current.split('/').slice(0, -1).join('/') || '/';
  }
  return process.cwd();
}

export function changedFilesMayNeedPackageBase(changedFiles) {
  return changedFiles.some((file) => file === 'package.json' || file === 'package-lock.json');
}

export function baseForChangedFileScan(repoRoot, options) {
  if (options.base !== undefined || options.changedFiles?.length) {
    return options.base;
  }
  return defaultAffectedBase(repoRoot);
}

export function baseForAffectedSelection(repoRoot, options, changedFiles, scanBase) {
  if (options.base !== undefined || !changedFilesMayNeedPackageBase(changedFiles)) {
    return options.base;
  }
  return scanBase === undefined ? defaultAffectedBase(repoRoot) : scanBase;
}
