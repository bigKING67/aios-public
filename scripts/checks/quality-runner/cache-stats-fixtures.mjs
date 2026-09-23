import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  printStats,
} from '../../quality-runner.mjs';

const DEFAULT_STATS_ENV_PATCH = Object.freeze({
  AIOS_QUALITY_REMOTE_CACHE_MODE: undefined,
  AIOS_QUALITY_REMOTE_CACHE_URL: undefined,
});

export function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

export function createCacheStatsTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-cache-stats-'));
}

export function captureStdout(callback) {
  const originalStdoutWrite = process.stdout.write;
  let output = '';
  try {
    process.stdout.write = (chunk, encoding, done) => {
      output += String(chunk);
      if (typeof done === 'function') {
        done();
      }
      return true;
    };
    callback();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return output;
}

function withEnvPatch(envPatch, callback) {
  const previousValues = new Map();
  for (const key of Object.keys(envPatch)) {
    previousValues.set(key, process.env[key]);
    if (envPatch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envPatch[key];
    }
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function printStatsWithCwd(repoRoot, options, envPatch = DEFAULT_STATS_ENV_PATCH) {
  const originalCwd = process.cwd();
  try {
    process.chdir(repoRoot);
    return withEnvPatch(envPatch, () => {
      return captureStdout(() => {
        printStats(options);
      });
    });
  } finally {
    process.chdir(originalCwd);
  }
}
