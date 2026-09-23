#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  buildQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  getRemoteCacheDiagnostics,
} from '../../lib/quality/quality-cache.mjs';
import {
  summarizeQualityEvents,
} from '../../lib/quality/quality-events.mjs';
import {
  buildQualityStatsActionPlan,
  enrichQualityStats,
  remoteCacheStatsActions,
  summarizeQualityStatsActionPlan,
} from '../../lib/quality/quality-stats-insights.mjs';
import {
  readRemoteCacheHealth,
} from '../../lib/quality/quality-runner-remote-cache-health.mjs';
import {
  evaluateQualityStatsBudget,
  formatQualityStatsBudgetEvaluation,
  qualityStatsBudgetPolicyFromEnv,
} from '../../lib/quality/quality-stats-budget-core.mjs';
import {
  runQualityRunnerCacheStatsBehaviorFixtures,
} from '../../lib/quality/quality-runner-cache-stats-fixtures.mjs';

const {
  fail,
  reportOk,
  ...assertions
} = createCheckGuard('quality-runner-cache-stats-behavior');

export function shouldRunQualityRunnerStatsBudget(env = process.env) {
  return env.QUALITY_STATS_LIVE_BUDGET === '1';
}

export async function runQualityRunnerCacheStatsBehaviorCheck() {
  await runQualityRunnerCacheStatsBehaviorFixtures(assertions);

  let behaviorRuns = 0;
  let liveBudgetRuns = 0;
  const reports = [];
  const cliFixture = {
    behaviorCheck: async () => {
      behaviorRuns += 1;
    },
    formatEvaluation: () => 'fixture-evaluation',
    report: (message) => {
      reports.push(message);
    },
    statsBudgetCheck: () => {
      liveBudgetRuns += 1;
      return { status: 'pass' };
    },
  };

  await main({ ...cliFixture, env: {} });
  assertions.assertEqual(behaviorRuns, 1, 'default cache stats CLI should run deterministic behavior checks');
  assertions.assertEqual(liveBudgetRuns, 0, 'default cache stats CLI should not read live event history');
  assertions.assertIncludes(reports[0], 'live budget policy skipped', 'default cache stats CLI should report the skipped live policy');

  await main({
    ...cliFixture,
    env: { QUALITY_STATS_LIVE_BUDGET: '1' },
  });
  assertions.assertEqual(behaviorRuns, 2, 'live stats policy CLI should retain deterministic behavior checks');
  assertions.assertEqual(liveBudgetRuns, 1, 'explicit live stats policy flag should run the history budget');
  assertions.assertIncludes(reports[1], 'fixture-evaluation', 'live stats policy CLI should report its evaluation');
  assertions.assertFalse(
    shouldRunQualityRunnerStatsBudget({ QUALITY_STATS_LIVE_BUDGET: 'true' }),
    'live stats policy flag should require the exact value 1',
  );
}

export function runQualityRunnerStatsBudgetCheck() {
  const repoRoot = getRepoRoot();
  const policy = qualityStatsBudgetPolicyFromEnv();
  const registry = buildQualityGateRegistry({ repoRoot });
  const stats = enrichQualityStats(
    summarizeQualityEvents(repoRoot, {
      limit: policy.limit,
      slowLimit: policy.slowLimit,
    }),
    registry,
    { repoRoot },
  );
  const remoteCache = getRemoteCacheDiagnostics(process.env);
  const remoteCacheHealth = readRemoteCacheHealth(repoRoot, remoteCache);
  const statsWithActions = {
    ...stats,
    remoteCache,
    remoteCacheHealth,
    remoteCacheActions: remoteCacheStatsActions(remoteCache, {
      ...stats,
      remoteCacheHealth,
    }),
  };
  statsWithActions.actionPlan = buildQualityStatsActionPlan(statsWithActions);
  statsWithActions.actionPlanSummary = summarizeQualityStatsActionPlan(statsWithActions.actionPlan);
  const evaluation = evaluateQualityStatsBudget(statsWithActions, policy);
  if (evaluation.status === 'fail') {
    for (const finding of evaluation.findings) {
      console.error(`- ${finding}`);
    }
    fail(`quality stats budget failed: ${formatQualityStatsBudgetEvaluation(evaluation)}`);
  }
  return evaluation;
}

export async function main(options = {}) {
  const {
    behaviorCheck = runQualityRunnerCacheStatsBehaviorCheck,
    env = process.env,
    formatEvaluation = formatQualityStatsBudgetEvaluation,
    report = reportOk,
    statsBudgetCheck = runQualityRunnerStatsBudgetCheck,
  } = options;

  await behaviorCheck();
  if (!shouldRunQualityRunnerStatsBudget(env)) {
    report('stats JSON, cold-path diagnostics, cache health, and since-window behavior passed; live budget policy skipped (set QUALITY_STATS_LIVE_BUDGET=1 to enable).');
    return null;
  }

  const evaluation = statsBudgetCheck();
  report(`stats JSON, live budget policy, cold-path diagnostics, cache health, and since-window behavior passed; ${formatEvaluation(evaluation)}`);
  return evaluation;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
