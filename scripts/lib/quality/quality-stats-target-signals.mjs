import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export {
  commandTargetFiles,
} from './quality-gate-command-targets.mjs';

const PROCESS_TARGET_FILE_SIGNALS = new Map();

export function commandKind(command) {
  const text = String(command ?? '').trim();
  if (/^(node|tsx)\b/.test(text)) {
    return 'node';
  }
  if (/^(bash|sh)\b/.test(text)) {
    return 'shell';
  }
  if (/\bcargo\b/.test(text)) {
    return 'cargo';
  }
  if (/\bvite\b/.test(text)) {
    return 'vite';
  }
  if (/\btsc\b/.test(text)) {
    return 'tsc';
  }
  return text.split(/\s+/)[0] || 'unknown';
}

function countCallExpressions(source, identifier) {
  const regex = new RegExp(`\\b${identifier}\\s*\\(`, 'g');
  let count = 0;
  for (const match of source.matchAll(regex)) {
    const prefix = source.slice(Math.max(0, match.index - 32), match.index);
    if (/\bfunction\s*\*?\s+$/u.test(prefix)) {
      continue;
    }
    count += 1;
  }
  return count;
}

export function analyzeQualityStatsTargetFiles(repoRoot, targetFiles) {
  const totals = {
    analyzedFiles: 0,
    createFixtureWorkspaceCount: 0,
    createTempRepoCount: 0,
    execFileSyncCount: 0,
    fixtureFactoryCount: 0,
    mkdtempCount: 0,
    runFixtureCommandCount: 0,
    runFixtureGitCount: 0,
    spawnSyncCount: 0,
    withFixtureWorkspaceCount: 0,
    withTempRepoCount: 0,
  };

  for (const targetFile of targetFiles) {
    const filePath = path.join(repoRoot, targetFile);
    if (!existsSync(filePath)) {
      continue;
    }
    const cacheKey = `${filePath}\0${targetFile}`;
    let signals = PROCESS_TARGET_FILE_SIGNALS.get(cacheKey);
    if (!signals) {
      const source = readFileSync(filePath, 'utf8');
      const withTempRepoCount = countCallExpressions(source, 'withTempRepo');
      const withFixtureWorkspaceCount = countCallExpressions(source, 'withFixtureWorkspace');
      const createFixtureWorkspaceCount = countCallExpressions(source, 'createFixtureWorkspace');
      signals = {
        analyzedFiles: 1,
        createFixtureWorkspaceCount,
        createTempRepoCount: countCallExpressions(source, 'createTempRepo'),
        execFileSyncCount: countCallExpressions(source, 'execFileSync'),
        fixtureFactoryCount: withTempRepoCount + withFixtureWorkspaceCount + createFixtureWorkspaceCount,
        mkdtempCount: countCallExpressions(source, 'mkdtempSync'),
        runFixtureCommandCount: countCallExpressions(source, 'runFixtureCommand'),
        runFixtureGitCount: countCallExpressions(source, 'runFixtureGit'),
        spawnSyncCount: countCallExpressions(source, 'spawnSync'),
        withFixtureWorkspaceCount,
        withTempRepoCount,
      };
      PROCESS_TARGET_FILE_SIGNALS.set(cacheKey, signals);
    }
    totals.analyzedFiles += 1;
    totals.createFixtureWorkspaceCount += signals.createFixtureWorkspaceCount;
    totals.createTempRepoCount += signals.createTempRepoCount;
    totals.execFileSyncCount += signals.execFileSyncCount;
    totals.fixtureFactoryCount += signals.fixtureFactoryCount;
    totals.mkdtempCount += signals.mkdtempCount;
    totals.runFixtureCommandCount += signals.runFixtureCommandCount;
    totals.runFixtureGitCount += signals.runFixtureGitCount;
    totals.spawnSyncCount += signals.spawnSyncCount;
    totals.withFixtureWorkspaceCount += signals.withFixtureWorkspaceCount;
    totals.withTempRepoCount += signals.withTempRepoCount;
  }

  return totals;
}

export function resetQualityStatsTargetFileSignalCacheForTests() {
  PROCESS_TARGET_FILE_SIGNALS.clear();
}

export function qualityStatsTargetFileSignalCacheSizeForTests() {
  return PROCESS_TARGET_FILE_SIGNALS.size;
}
