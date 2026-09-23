#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { printStats } from '../../quality-runner.mjs';
import {
  remoteCacheHealthPath,
} from '../../lib/quality/quality-runner-remote-cache-health.mjs';
import {
  createCacheRemoteTempWorkspace,
  removeCacheRemoteTempWorkspace,
  writeText,
} from './cache-remote-fixtures.mjs';

const {
  assertEqual,
  assertIncludes,
  reportOk,
} = createCheckGuard('quality-runner-cache-remote-stats-behavior');

function captureStdout(callback) {
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

function printStatsWithCwd(repoRoot, options) {
  const originalCwd = process.cwd();
  try {
    process.chdir(repoRoot);
    return captureStdout(() => {
      printStats(options);
    });
  } finally {
    process.chdir(originalCwd);
  }
}

export function runQualityRunnerCacheRemoteStatsBehaviorCheck() {
  const repoRoot = createCacheRemoteTempWorkspace();
  try {
    writeText(path.join(repoRoot, 'package.json'), '{}\n');
    writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
      mode: 'fixture',
      status: 'pass',
      gates: [
        {
          cacheHit: true,
          cacheSource: 'remote',
          durationMs: 0,
          name: 'remote-cache-probe',
          status: 'pass',
        },
        {
          cacheHit: true,
          cacheSource: 'local',
          durationMs: 0,
          name: 'local-cache-probe',
          status: 'pass',
        },
      ],
      summary: {
        cached: 2,
        failed: 0,
        passed: 2,
        total: 2,
      },
      timestamp: '2026-05-10T00:00:00.000Z',
    })}\n`);
    const originalInitialRemoteCacheUrl = process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
    const originalInitialRemoteCacheMode = process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
    try {
      delete process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
      delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
      const remoteStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 2 });
      assertIncludes(remoteStats, '"cacheSources"', 'stats JSON should expose local/remote cache source totals');
      assertIncludes(remoteStats, '"remoteCache"', 'stats JSON should expose remote cache diagnostics');
      assertIncludes(remoteStats, '"status": "off"', 'stats JSON should explain disabled remote cache status when unconfigured');
      assertIncludes(remoteStats, '"remote": 1', 'stats JSON should count remote cache hits');
      assertIncludes(remoteStats, '"local": 1', 'stats JSON should count local cache hits');
      assertIncludes(remoteStats, '"remoteCachedCount": 1', 'per-gate summaries should expose remote cache hit counts');
      assertIncludes(remoteStats, '"localCachedCount": 1', 'per-gate summaries should expose local cache hit counts');
    } finally {
      if (originalInitialRemoteCacheUrl === undefined) {
        delete process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
      } else {
        process.env.AIOS_QUALITY_REMOTE_CACHE_URL = originalInitialRemoteCacheUrl;
      }
      if (originalInitialRemoteCacheMode === undefined) {
        delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
      } else {
        process.env.AIOS_QUALITY_REMOTE_CACHE_MODE = originalInitialRemoteCacheMode;
      }
    }

    writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
      mode: 'fixture',
      status: 'pass',
      gates: [
        {
          cacheHit: true,
          cacheSource: 'local',
          durationMs: 0,
          name: 'local-cache-probe',
          status: 'pass',
        },
      ],
      summary: {
        cached: 1,
        failed: 0,
        passed: 1,
        total: 1,
      },
      timestamp: '2026-05-10T00:01:00.000Z',
    })}\n`);
    const remoteRoot = path.join(repoRoot, 'remote-cache');
    writeText(path.join(remoteRoot, '.keep'), '');
    const remoteUrl = pathToFileURL(remoteRoot).toString();
    writeText(remoteCacheHealthPath(repoRoot), `${JSON.stringify({
      command: 'smoke',
      remote: {
        rootPath: remoteRoot,
        source: 'override',
        url: remoteUrl,
      },
      schema: 1,
      smoke: {
        read: {
          artifactRestored: true,
          localRefill: true,
          remoteHit: true,
          status: 'pass',
        },
        status: 'pass',
        write: {
          remoteArtifactExists: true,
          remoteResultExists: true,
          status: 'pass',
        },
      },
      status: 'pass',
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const originalRemoteCacheUrl = process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
    const originalRemoteCacheMode = process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
    try {
      delete process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
      delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
      const enableActionPlan = JSON.parse(printStatsWithCwd(repoRoot, {
        actionPlan: true,
        json: true,
        limit: 200,
        slowLimit: 2,
      }));
      assertEqual(enableActionPlan.remoteCache.status, 'off', 'stats action plan should expose disabled remote cache status before env activation');
      assertEqual(enableActionPlan.remoteCacheHealth.status, 'pass', 'disabled remote cache stats should still read latest health signal');
      assertEqual(enableActionPlan.remoteCacheHealth.freshness, 'fresh', 'disabled remote cache stats should classify fresh setup health');
      assertEqual(enableActionPlan.remoteCacheHealth.matchesRemote, false, 'disabled remote cache health cannot match an inactive env URL');
      assertEqual(enableActionPlan.remoteCacheActions[0].action, 'enable-remote-cache-env', 'fresh setup health should ask operators to enable env instead of rerunning setup');
      assertIncludes(
        enableActionPlan.actionPlanSummary.recommendedNextCommand,
        'remote-cache env --remote-cache-url',
        'fresh setup health should recommend formal read-only env activation as the next command',
      );
      assertIncludes(
        enableActionPlan.actionPlanSummary.recommendedNextCommand,
        '--remote-cache-mode read',
        'fresh setup health should keep the next command read-only for explicit stats/manual runs',
      );
      assertIncludes(
        enableActionPlan.remoteCacheActions[0].reason,
        'auto-activate it read-only',
        'fresh setup health should explain that run/prepush can already auto-activate read-only cache',
      );
      assertIncludes(
        enableActionPlan.actionPlan[0].commands[2],
        '--remote-cache-mode readwrite',
        'fresh setup health should still expose explicit readwrite publishing activation after the read-only command',
      );
      assertIncludes(
        enableActionPlan.actionPlan[0].commands[4],
        'remote-cache smoke --remote-cache-url',
        'fresh setup health should include a target-specific smoke command after activation',
      );
      process.env.AIOS_QUALITY_REMOTE_CACHE_URL = remoteUrl;
      delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
      const actionPlan = JSON.parse(printStatsWithCwd(repoRoot, {
        actionPlan: true,
        json: true,
        limit: 200,
        slowLimit: 2,
      }));
      assertEqual(actionPlan.remoteCacheHealth.status, 'pass', 'stats action plan should expose latest remote cache health status');
      assertEqual(actionPlan.remoteCacheHealth.freshness, 'fresh', 'stats action plan should classify recent remote cache health as fresh');
      assertEqual(actionPlan.remoteCacheHealth.matchesRemote, true, 'stats action plan should match health to the current remote URL');
      assertEqual(actionPlan.remoteCacheActions[0].action, 'monitor-remote-cache', 'fresh remote health should suppress repeated smoke action');
      assertEqual(actionPlan.actionPlan.length, 0, 'fresh remote health should leave no remote cache action plan item when there are no slow gates');
      writeText(remoteCacheHealthPath(repoRoot), `${JSON.stringify({
        command: 'smoke',
        remote: {
          rootPath: remoteRoot,
          source: 'override',
          url: remoteUrl,
        },
        schema: 1,
        smoke: {
          read: {
            artifactRestored: true,
            localRefill: true,
            remoteHit: true,
            status: 'pass',
          },
          status: 'pass',
          write: {
            remoteArtifactExists: true,
            remoteResultExists: true,
            status: 'pass',
          },
        },
        status: 'pass',
        updatedAt: '2000-01-01T00:00:00.000Z',
      }, null, 2)}\n`);
      const staleActionPlan = JSON.parse(printStatsWithCwd(repoRoot, {
        actionPlan: true,
        json: true,
        limit: 200,
        slowLimit: 2,
      }));
      assertEqual(staleActionPlan.remoteCacheHealth.freshness, 'stale', 'stats action plan should classify old remote cache health as stale');
      assertEqual(staleActionPlan.remoteCacheActions[0].action, 'verify-remote-hit', 'stale remote cache health should request smoke verification');
      assertEqual(staleActionPlan.actionPlanSummary.maxSeverity, 'warn', 'stale remote cache health should raise action plan severity');
      assertIncludes(
        staleActionPlan.actionPlanSummary.recommendedNextCommand,
        'remote-cache smoke',
        'stale remote cache health should recommend smoke as the next command',
      );
    } finally {
      if (originalRemoteCacheUrl === undefined) {
        delete process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
      } else {
        process.env.AIOS_QUALITY_REMOTE_CACHE_URL = originalRemoteCacheUrl;
      }
      if (originalRemoteCacheMode === undefined) {
        delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
      } else {
        process.env.AIOS_QUALITY_REMOTE_CACHE_MODE = originalRemoteCacheMode;
      }
    }
  } finally {
    removeCacheRemoteTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheRemoteStatsBehaviorCheck();
  reportOk('cache-source stats passed.');
}
