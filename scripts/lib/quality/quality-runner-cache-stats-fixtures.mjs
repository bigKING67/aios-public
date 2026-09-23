import { categoryForGate, CATEGORY_BUDGETS, budgetForCategory, budgetStatus } from './quality-stats-categories.mjs';
import { rmSync } from 'node:fs';
import path from 'node:path';

import {
  printStats,
} from '../../quality-runner.mjs';
import {
  parseArgs,
} from './quality-runner-args.mjs';
import {
  actionPlanMeetsSeverity,
  buildQualityStatsActionPlan,
  remoteCacheStatsActions,
  summarizeQualityStatsActionPlan,
} from './quality-stats-insights.mjs';
import {
  evaluateQualityStatsBudget,
  qualityStatsBudgetPolicyFromEnv,
} from './quality-stats-budget-core.mjs';
import {
  assertCacheStatsCompatibilityOrdering,
} from '../../checks/quality-runner/cache-stats-compatibility-fixtures.mjs';
import {
  assertCacheStatsRollingWindow,
  assertCacheStatsSinceCommit,
} from '../../checks/quality-runner/cache-stats-rolling-fixtures.mjs';
import {
  assertCacheStatsSampleHealth,
} from '../../checks/quality-runner/cache-stats-sample-health-fixtures.mjs';
import {
  assertCacheStatsTargetFileSignalMemoization,
} from '../../checks/quality-runner/cache-stats-signal-fixtures.mjs';
import {
  captureStdout,
  createCacheStatsTempWorkspace,
  printStatsWithCwd,
  writeText,
} from '../../checks/quality-runner/cache-stats-fixtures.mjs';

function withRemoteCacheEnvCleared(callback) {
  const originalRemoteCacheUrl = process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
  const originalRemoteCacheMode = process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
  try {
    delete process.env.AIOS_QUALITY_REMOTE_CACHE_URL;
    delete process.env.AIOS_QUALITY_REMOTE_CACHE_MODE;
    return callback();
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
}

export async function runQualityRunnerCacheStatsBehaviorFixtures(assertions) {
  for (const name of ['audit:dependencies:npm', 'audit:dependencies:python', 'audit:dependencies:rust']) {
    assertions.assertEqual(categoryForGate({ name }), 'dependency-audit', 'live advisory checks have explicit network budgets');
  }
  assertions.assertEqual(budgetStatus({ coldMaxMs: 60001, coldAvgMs: 1000 }, CATEGORY_BUDGETS['dependency-audit']), 'warn', 'audit peak overrun must fail');
  assertions.assertEqual(budgetStatus({ coldMaxMs: 40000, coldAvgMs: 30001 }, CATEGORY_BUDGETS['dependency-audit']), 'warn', 'audit average overrun must fail');
  for (const name of ['test:frontend:unit', 'test:etl:unit']) {
    assertions.assertEqual(categoryForGate({ name }), 'unit-suite', 'full test suites have explicit runtime budgets');
  }
  assertions.assertEqual(categoryForGate({ name: 'test:unknown' }), 'other', 'unclassified tests keep the existing strict budget');
  assertions.assertEqual(budgetStatus({ coldMaxMs: 20001, coldAvgMs: 1000 }, CATEGORY_BUDGETS['unit-suite']), 'warn', 'suite peak overrun must fail');
  assertions.assertEqual(budgetStatus({ coldMaxMs: 15000, coldAvgMs: 12001 }, CATEGORY_BUDGETS['unit-suite']), 'warn', 'suite average overrun must fail');
  const githubLinux = { platform: 'linux', env: { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux' } };
  const ciSuiteBudget = budgetForCategory('unit-suite', githubLinux);
  assertions.assertEqual(budgetStatus({ coldMaxMs: 60000, coldAvgMs: 45000 }, ciSuiteBudget), 'ok', 'approved Linux CI limits are inclusive');
  assertions.assertEqual(budgetStatus({ coldMaxMs: 60001, coldAvgMs: 1000 }, ciSuiteBudget), 'warn', 'Linux CI peak overrun remains blocking');
  assertions.assertEqual(budgetStatus({ coldMaxMs: 50000, coldAvgMs: 45001 }, ciSuiteBudget), 'warn', 'Linux CI average overrun remains blocking');
  for (const runtime of [
    { platform: 'darwin', env: {} },
    { platform: 'linux', env: {} },
    { platform: 'linux', env: { CI: 'true' } },
    { platform: 'linux', env: { GITHUB_ACTIONS: 'true' } },
    { platform: 'darwin', env: githubLinux.env },
    { platform: 'linux', env: { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows' } },
  ]) {
    assertions.assertEqual(budgetForCategory('unit-suite', runtime).warnAvgMs, 12000, 'other runtimes retain the local suite average budget');
    assertions.assertEqual(budgetForCategory('unit-suite', runtime).warnMaxMs, 20000, 'other runtimes retain the local suite peak budget');
  }
  for (const [category, budget] of Object.entries(CATEGORY_BUDGETS)) {
    if (category === 'unit-suite') continue;
    assertions.assertEqual(budgetForCategory(category, githubLinux).warnAvgMs, budget.warnAvgMs, 'CI does not relax unrelated average budgets');
    assertions.assertEqual(budgetForCategory(category, githubLinux).warnMaxMs, budget.warnMaxMs, 'CI does not relax unrelated peak budgets');
  }

  const {
    assertEqual,
    assertIncludes,
    assertNotIncludes,
    assertTrue,
  } = assertions;
  const readyRemoteActions = remoteCacheStatsActions({
    backend: 'file',
    enabled: true,
    mode: 'read',
    status: 'ready-readonly',
    usable: true,
  }, {
    cacheSources: { remote: 0 },
  });
  assertEqual(readyRemoteActions[0].action, 'verify-remote-hit', 'ready remote cache with zero recent hits should prompt smoke verification');
  assertIncludes(
    readyRemoteActions[0].setupCommand,
    'remote-cache setup',
    'ready remote cache action should include a setup command',
  );
  assertIncludes(
    readyRemoteActions[0].smokeCommand,
    'remote-cache smoke',
    'ready remote cache action should include a smoke command',
  );
  const disabledRemoteActionPlan = buildQualityStatsActionPlan({
    remoteCacheActions: remoteCacheStatsActions({
      enabled: false,
      reason: 'AIOS_QUALITY_REMOTE_CACHE_URL is not set',
      status: 'off',
    }, {
      cacheSources: { remote: 0 },
    }),
  });
  assertIncludes(
    disabledRemoteActionPlan[0].commands[0],
    'remote-cache setup',
    'unconfigured remote cache action should recommend setup first',
  );
  const disabledFreshHealthActions = remoteCacheStatsActions({
    enabled: false,
    reason: 'AIOS_QUALITY_REMOTE_CACHE_URL is not set',
    status: 'off',
  }, {
    cacheSources: { remote: 0 },
    remoteCacheHealth: {
      ageMinutes: 2,
      command: 'setup',
      freshness: 'fresh',
      matchesRemote: false,
      remote: {
        source: 'override',
        url: 'file:///tmp/aios-quality-remote',
      },
      smoke: {
        read: {
          artifactRestored: true,
          remoteHit: true,
        },
        status: 'pass',
      },
      status: 'pass',
    },
  });
  assertEqual(
    disabledFreshHealthActions[0].action,
    'enable-remote-cache-env',
    'unconfigured remote cache with fresh setup health should recommend enabling env before setup',
  );
  assertEqual(
    disabledFreshHealthActions[0].runAutoActivation,
    true,
    'fresh known remote cache health should mark run/prepush read-only auto activation',
  );
  assertIncludes(
    disabledFreshHealthActions[0].reason,
    'auto-activate it read-only',
    'fresh known remote cache health should explain that normal run modes already auto-activate read-only cache',
  );
  const disabledFreshHealthActionPlan = buildQualityStatsActionPlan({
    remoteCacheActions: disabledFreshHealthActions,
  });
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[0],
    'remote-cache env --remote-cache-url',
    'fresh known remote cache health should recommend the formal read-only env activation command first',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[0],
    '--remote-cache-mode read',
    'fresh known remote cache health should default explicit activation to read-only mode',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[1],
    'export AIOS_QUALITY_REMOTE_CACHE_URL=',
    'fresh known remote cache health should keep raw read-only export activation as a fallback command',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[1],
    'AIOS_QUALITY_REMOTE_CACHE_MODE=read',
    'fresh known remote cache health should include read-only mode activation',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[2],
    '--remote-cache-mode readwrite',
    'fresh known remote cache health should keep an explicit readwrite publishing command',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[3],
    'AIOS_QUALITY_REMOTE_CACHE_MODE=readwrite',
    'fresh known remote cache health should keep raw readwrite publishing activation',
  );
  assertIncludes(
    disabledFreshHealthActionPlan[0].commands[4],
    'remote-cache smoke --remote-cache-url',
    'fresh known remote cache health should keep a target-specific smoke command',
  );
  assertEqual(
    disabledFreshHealthActionPlan[0].kind,
    'operator-hint',
    'fresh known remote cache health action should be classified as an operator hint',
  );
  const disabledFreshHealthActionSummary = summarizeQualityStatsActionPlan(disabledFreshHealthActionPlan);
  assertEqual(
    disabledFreshHealthActionSummary.requiredActionCount,
    0,
    'fresh known remote cache health hint should not be counted as a required action',
  );
  assertEqual(
    disabledFreshHealthActionSummary.hintActionCount,
    1,
    'fresh known remote cache health hint should be counted separately from required actions',
  );
  assertEqual(
    disabledFreshHealthActionSummary.maxRequiredSeverity,
    'none',
    'hint-only action plans should expose no required severity',
  );
  assertEqual(
    disabledFreshHealthActionSummary.recommendedHintCommand,
    disabledFreshHealthActionPlan[0].commands[0],
    'hint-only action plans should expose a recommended hint command',
  );
  assertEqual(
    disabledFreshHealthActionSummary.recommendedRequiredCommand,
    null,
    'hint-only action plans should not expose a required next command',
  );
  const repairRemoteActionPlan = buildQualityStatsActionPlan({
    remoteCacheActions: remoteCacheStatsActions({
      backend: 'file',
      enabled: true,
      mode: 'readwrite',
      reason: 'remote cache root is not writable',
      status: 'unusable',
      usable: false,
    }, {
      cacheSources: { remote: 0 },
    }),
  });
  assertIncludes(
    repairRemoteActionPlan[0].commands[0],
    'remote-cache doctor',
    'unusable remote cache action should recommend doctor first',
  );
  const hitRemoteActions = remoteCacheStatsActions({
    backend: 'file',
    enabled: true,
    mode: 'read',
    status: 'ready-readonly',
    usable: true,
  }, {
    cacheSources: { remote: 3 },
  });
  assertEqual(hitRemoteActions[0].action, 'monitor-remote-cache', 'remote cache with recent hits should switch to monitor action');
  const freshHealthRemoteActions = remoteCacheStatsActions({
    backend: 'file',
    enabled: true,
    mode: 'read',
    status: 'ready-readonly',
    usable: true,
  }, {
    cacheSources: { remote: 0 },
    remoteCacheHealth: {
      ageMinutes: 3,
      command: 'smoke',
      freshness: 'fresh',
      matchesRemote: true,
      smoke: {
        read: {
          artifactRestored: true,
          remoteHit: true,
        },
        status: 'pass',
      },
      status: 'pass',
    },
  });
  assertEqual(
    freshHealthRemoteActions[0].action,
    'monitor-remote-cache',
    'fresh passing remote cache health should avoid repeating smoke when no remote hit has appeared yet',
  );
  const staleHealthRemoteActions = remoteCacheStatsActions({
    backend: 'file',
    enabled: true,
    mode: 'read',
    status: 'ready-readonly',
    usable: true,
  }, {
    cacheSources: { remote: 0 },
    remoteCacheHealth: {
      ageMinutes: 1800,
      command: 'smoke',
      freshness: 'stale',
      matchesRemote: true,
      smoke: {
        read: {
          artifactRestored: true,
          remoteHit: true,
        },
        status: 'pass',
      },
      status: 'pass',
    },
  });
  assertEqual(staleHealthRemoteActions[0].action, 'verify-remote-hit', 'stale remote cache health should prompt a fresh smoke check');
  assertEqual(staleHealthRemoteActions[0].severity, 'warn', 'stale remote cache health should raise action plan severity');
  const staleHealthActionPlan = buildQualityStatsActionPlan({
    remoteCacheActions: staleHealthRemoteActions,
  });
  assertIncludes(
    staleHealthActionPlan[0].commands[0],
    'remote-cache smoke',
    'stale remote cache health should recommend smoke first',
  );
  const failedHealthActionPlan = buildQualityStatsActionPlan({
    remoteCacheActions: remoteCacheStatsActions({
      backend: 'file',
      enabled: true,
      mode: 'read',
      status: 'ready-readonly',
      usable: true,
    }, {
      cacheSources: { remote: 0 },
      remoteCacheHealth: {
        ageMinutes: 4,
        command: 'setup',
        freshness: 'fresh',
        matchesRemote: true,
        status: 'fail',
      },
    }),
  });
  assertEqual(
    failedHealthActionPlan[0].action,
    'repair-remote-cache',
    'failed remote cache health should switch to repair action',
  );
  assertIncludes(
    failedHealthActionPlan[0].commands[0],
    'remote-cache doctor',
    'failed remote cache health should recommend doctor first',
  );
  const actionPlan = buildQualityStatsActionPlan({
    nextActions: [{
      benchmarkCommand: 'node scripts/quality-runner.mjs benchmark verify:slow --runs 3',
      cacheAction: 'inspect-cache-key',
      category: 'node-check',
      gate: 'verify:slow',
      recommendation: 'benchmark slow gate before refactor',
    }],
    remoteCacheActions: readyRemoteActions,
  });
  assertEqual(actionPlan[0].type, 'remote-cache', 'action plan should prioritize remote cache readiness before gate tuning');
  assertIncludes(
    actionPlan[0].commands[0],
    'remote-cache smoke',
    'configured zero-hit remote cache action should recommend smoke before setup',
  );
  assertEqual(actionPlan[1].type, 'gate', 'action plan should keep slow gate benchmark actions');
  assertEqual(actionPlan[0].kind, 'operator-hint', 'info-level remote cache verification should be classified as an operator hint');
  assertEqual(actionPlan[1].kind, 'required-action', 'warn-level gate tuning should be classified as a required action');
  const actionPlanSummary = summarizeQualityStatsActionPlan(actionPlan);
  assertEqual(
    actionPlanSummary.recommendedNextCommand,
    actionPlan[0].commands[0],
    'action plan summary should expose the state-specific first command',
  );
  assertEqual(
    actionPlanSummary.recommendedHintCommand,
    actionPlan[0].commands[0],
    'action plan summary should expose the first operator hint command',
  );
  assertEqual(
    actionPlanSummary.recommendedRequiredCommand,
    actionPlan[1].commands[0],
    'action plan summary should expose the first required action command separately',
  );
  assertEqual(actionPlanSummary.maxSeverity, 'warn', 'action plan summary should expose max severity');
  assertEqual(actionPlanSummary.maxRequiredSeverity, 'warn', 'action plan summary should expose max required severity');
  assertEqual(actionPlanSummary.requiredActionCount, 1, 'action plan summary should count required actions');
  assertEqual(actionPlanSummary.hintActionCount, 1, 'action plan summary should count operator hints');
  assertEqual(actionPlanSummary.commandCount, 4, 'action plan summary should count copyable commands');
  assertEqual(actionPlanMeetsSeverity(actionPlanSummary, 'info'), true, 'action plan severity helper should trip on matching severity');
  assertEqual(actionPlanMeetsSeverity(actionPlanSummary, 'warn'), true, 'action plan severity helper should trip on warning severity');
  assertEqual(actionPlanMeetsSeverity(actionPlanSummary, 'error'), false, 'action plan severity helper should not trip above max severity');
  const parsedActionPlanArgs = parseArgs(['stats', '--action-plan', '--print-next-command', '--json', '--fail-on-action-severity', 'warn']);
  assertEqual(parsedActionPlanArgs.positionals.join(' '), 'stats', 'stats --action-plan should preserve command positional');
  assertEqual(parsedActionPlanArgs.options.actionPlan, true, 'stats --action-plan should parse action plan mode');
  assertEqual(parsedActionPlanArgs.options.printNextCommand, true, 'stats --print-next-command should parse next command mode');
  assertEqual(parsedActionPlanArgs.options.failOnActionSeverity, 'warn', 'stats action plan should parse severity fail threshold');
  const stdout = captureStdout(() => {
    printStats({ json: true, limit: 200, slowLimit: 3 });
  });
  assertIncludes(stdout, '"slowest"', 'stats JSON should include slowest list');
  assertIncludes(stdout, '"latestCold"', 'stats JSON should include latest cold list');
  assertIncludes(stdout, '"slowestCold"', 'stats JSON should include cold-path slowest list');
  assertIncludes(stdout, '"slowFactors"', 'stats JSON should include slow factor summary');
  assertIncludes(stdout, '"nextActions"', 'stats JSON should include actionable next steps');
  assertIncludes(stdout, '"remoteCache"', 'stats JSON should include remote cache diagnostics');
  assertIncludes(stdout, '"remoteCacheActions"', 'stats JSON should include remote cache action diagnostics');
  assertIncludes(stdout, '"actionPlan"', 'stats JSON should include a unified action plan');
  assertIncludes(stdout, '"actionPlanSummary"', 'stats JSON should include action plan summary');
  const actionPlanJsonOutput = captureStdout(() => {
    printStats({ actionPlan: true, json: true, limit: 200, slowLimit: 3 });
  });
  assertIncludes(actionPlanJsonOutput, '"actionPlan"', 'stats --action-plan JSON should include the unified plan');
  assertIncludes(actionPlanJsonOutput, '"actionPlanSummary"', 'stats --action-plan JSON should include the plan summary');
  assertNotIncludes(actionPlanJsonOutput, '"slowest"', 'stats --action-plan JSON should omit full slowest payload');
  const actionPlanTextOutput = captureStdout(() => {
    printStats({ actionPlan: true, limit: 200, slowLimit: 3 });
  });
  assertIncludes(actionPlanTextOutput, '[quality] action plan', 'stats --action-plan text should print only the action plan section');
  assertIncludes(actionPlanTextOutput, 'severity=', 'stats --action-plan text should expose summary severity');
  assertIncludes(actionPlanTextOutput, 'required=', 'stats --action-plan text should expose required action count');
  assertIncludes(actionPlanTextOutput, 'hints=', 'stats --action-plan text should expose operator hint count');
  assertNotIncludes(actionPlanTextOutput, '[quality] slowest', 'stats --action-plan text should omit full stats sections');
  const nextCommandOutput = withRemoteCacheEnvCleared(() => captureStdout(() => {
    printStats({ printNextCommand: true, limit: 200, slowLimit: 3 });
  }));
  assertTrue(
    nextCommandOutput.includes('node scripts/quality-runner.mjs')
      || nextCommandOutput.includes('export AIOS_QUALITY_REMOTE_CACHE_URL='),
    'stats --print-next-command should print only the recommended command',
  );
  assertNotIncludes(nextCommandOutput, '[quality] action plan', 'stats --print-next-command should omit action plan decoration');
  const nextCommandJsonOutput = withRemoteCacheEnvCleared(() => captureStdout(() => {
    printStats({ json: true, printNextCommand: true, limit: 200, slowLimit: 3 });
  }));
  assertIncludes(nextCommandJsonOutput, '"nextCommand"', 'stats --print-next-command JSON should expose next command');
  assertNotIncludes(nextCommandJsonOutput, '"commands"', 'stats --print-next-command JSON should omit full action command list');

  const repoRoot = createCacheStatsTempWorkspace();
  try {
    writeText(path.join(repoRoot, 'package.json'), JSON.stringify({
      private: true,
      scripts: {
        'verify:app:page-size-behavior': 'node scripts/pass.mjs app-page-size-behavior',
        'verify:frontend:preflight': 'node scripts/pass.mjs frontend-preflight',
      },
    }, null, 2));
    writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
      cache: true,
      mode: 'ci',
      status: 'pass',
      durationMs: 9001,
      gates: [
        {
          cacheHit: false,
          durationMs: 9001,
          name: 'verify:app:page-size-behavior',
          status: 'pass',
        },
        {
          cacheHit: true,
          cacheSource: 'local',
          durationMs: 0,
          name: 'verify:frontend:preflight',
          status: 'pass',
        },
        {
          cacheHit: true,
          cacheSource: 'local',
          durationMs: 9001,
          name: 'verify:frontend:preflight',
          status: 'pass',
        },
      ],
      summary: {
        passed: 3,
        failed: 0,
        cached: 2,
        total: 3,
      },
      timestamp: '2026-05-10T00:00:00.000Z',
    })}\n`);
    const statsOutput = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 2 });
    const warningBudget = evaluateQualityStatsBudget(JSON.parse(statsOutput), {
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(warningBudget.status, 'fail', 'stats budget should fail on current budget warnings');
    assertTrue(
      warningBudget.findings.some((finding) => finding.includes('budget warnings')),
      'stats budget should explain budget warning failures',
    );
    assertIncludes(statsOutput, '"category": "behavior-fixture"', 'slow behavior gate should be categorized');
    assertIncludes(statsOutput, '"budgetStatus": "warn"', 'slow behavior gate should emit budget status');
    assertIncludes(statsOutput, '"budgetWarnings"', 'stats JSON should include budget warnings');
    assertIncludes(
      statsOutput,
      '"benchmarkCommand": "node scripts/quality-runner.mjs benchmark verify:app:page-size-behavior --runs 3"',
      'stats JSON should expose a copyable benchmark command for actionable slow gates',
    );
    assertIncludes(statsOutput, '"cacheModes"', 'stats JSON should include cache mode diagnostics');
    assertIncludes(statsOutput, '"remoteCache"', 'stats JSON should include remote cache readiness diagnostics');
    assertIncludes(statsOutput, '"remoteCacheActions"', 'stats JSON should include remote cache action commands');
    assertIncludes(statsOutput, '"actionPlan"', 'stats JSON should include unified action plan commands');
    assertIncludes(statsOutput, '"type": "remote-cache"', 'stats action plan should include remote-cache actions');
    assertIncludes(
      statsOutput,
      'node scripts/quality-runner.mjs remote-cache setup --remote-cache-path ~/.cache/aios-quality-remote --json',
      'stats JSON should expose a one-shot remote cache setup command when remote cache is unconfigured',
    );
    assertIncludes(
      statsOutput,
      'node scripts/quality-runner.mjs remote-cache smoke --remote-cache-path ~/.cache/aios-quality-remote --json',
      'stats JSON should expose a copyable remote cache smoke command when remote cache is unconfigured',
    );
    assertIncludes(statsOutput, '"on": 1', 'stats JSON should count cache-enabled runs separately');
    assertIncludes(statsOutput, '"coldByCacheMode"', 'stats JSON should expose cold samples by cache mode');
    assertIncludes(statsOutput, '"coldAvgMsByCacheMode"', 'stats JSON should expose cold average timings by cache mode');
    assertIncludes(statsOutput, '"cacheHealth"', 'stats JSON should include cache health diagnostics');
    assertIncludes(statsOutput, '"cacheAction"', 'stats nextActions should include cache tuning action');
    assertIncludes(statsOutput, '"inputHealth"', 'stats JSON should include input surface diagnostics');
    assertIncludes(statsOutput, '"action": "monitor"', 'single-sample precise-input cached gate should stay in monitor mode');
    assertIncludes(statsOutput, '"coldMaxMs": 9001', 'stats JSON should expose cold-path max timing');
    assertIncludes(statsOutput, '"cacheHits": 2', 'stats JSON should expose total cached gate counts even when cached gate is outside the slow list');
    assertIncludes(statsOutput, '"budgetStatus": "ok"', 'cached max timings should not by themselves trigger cold-path budget warnings');
    const statsTextOutput = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 2 });
    assertIncludes(
      statsTextOutput,
      'benchmark: node scripts/quality-runner.mjs benchmark verify:app:page-size-behavior --runs 3',
      'text stats should print a copyable benchmark command for current slow-gate warnings',
    );

    assertCacheStatsSampleHealth({
      assertIncludes,
      assertNotIncludes,
      repoRoot,
    });

    assertCacheStatsCompatibilityOrdering({
      assertIncludes,
      assertNotIncludes,
      assertTrue,
      repoRoot,
    });

    assertCacheStatsTargetFileSignalMemoization({
      assertEqual,
      assertTrue,
      repoRoot,
    });

    writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 21000,
      gates: [
        {
          cacheHit: false,
          durationMs: 21000,
          name: 'verify:frontend:design-evolution',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 0,
        total: 1,
      },
      timestamp: '2026-05-10T00:01:00.000Z',
    })}\n`);
    const designEvolutionStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
    assertIncludes(
      designEvolutionStats,
      'changed-file manifest driven',
      'design-evolution stats should explain changed-file manifest behavior instead of generic node advice',
    );

    writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
      mode: 'prepush',
      status: 'pass',
      durationMs: 131,
      gates: [
        {
          cacheHit: false,
          durationMs: 131,
          name: 'verify:ci:release-version-bump',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 0,
        total: 1,
      },
      timestamp: '2026-05-10T00:02:00.000Z',
    })}\n`);
    const releaseStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
    assertIncludes(
      releaseStats,
      '"action": "intentional-cold"',
      'release bump stats should distinguish cheap base/head-sensitive governance guards from cache drift',
    );
    assertIncludes(
      releaseStats,
      'keep correctness before cache tuning',
      'release bump stats should recommend correctness over weakening cache identity',
    );
    const releaseTextStats = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 1 });
    assertIncludes(
      releaseTextStats,
      'cacheAction=intentional-cold',
      'text stats should surface intentional cold governance guards inline',
    );
    assertIncludes(
      releaseTextStats,
      'lastCold=131ms',
      'text stats should expose latest cold timing even when the gate is within budget',
    );
    assertIncludes(
      releaseTextStats,
      '[quality] latest cold (current signal)',
      'text stats should include a latest-cold section sorted by current cold samples',
    );
    assertIncludes(
      releaseTextStats,
      '[quality] remote cache',
      'text stats should summarize remote cache readiness',
    );
    assertIncludes(
      releaseTextStats,
      '[quality] remote cache hint: set AIOS_QUALITY_REMOTE_CACHE_URL=file://<shared-cache-dir>; add AIOS_QUALITY_REMOTE_CACHE_MODE=readwrite only when publishing pass-only results',
      'text stats should give actionable remote cache setup guidance when remote cache is unconfigured',
    );
    assertIncludes(
      releaseTextStats,
      '[quality] remote cache actions',
      'text stats should include remote cache action commands',
    );
    assertIncludes(
      releaseTextStats,
      'setup: node scripts/quality-runner.mjs remote-cache setup --remote-cache-path ~/.cache/aios-quality-remote --json',
      'text stats should print a copyable remote cache setup command',
    );
    assertIncludes(
      releaseTextStats,
      'smoke: node scripts/quality-runner.mjs remote-cache smoke --remote-cache-path ~/.cache/aios-quality-remote --json',
      'text stats should print a copyable remote cache smoke command',
    );
    assertIncludes(
      releaseTextStats,
      '[quality] action plan',
      'text stats should include a unified action plan section',
    );
    assertIncludes(
      releaseTextStats,
      '[remote-cache] configure-remote-cache',
      'text action plan should prioritize remote cache configuration',
    );
    const releaseBudget = evaluateQualityStatsBudget(JSON.parse(releaseStats), {
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 50,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(releaseBudget.status, 'pass', 'stats budget should pass when low-sample cache hit-rate checks are deferred');
    assertTrue(
      releaseBudget.notes.some((note) => note.includes('cache hit-rate budget skipped')),
      'stats budget should explain skipped low-sample cache hit-rate checks',
    );
    const warnActionPlanBudget = evaluateQualityStatsBudget({
      actionPlanSummary: {
        maxSeverity: 'warn',
        maxRequiredSeverity: 'none',
        recommendedNextCommand: 'node scripts/quality-runner.mjs remote-cache smoke --json',
        recommendedRequiredCommand: null,
      },
      budgetWarnings: [],
      cacheHitRate: 1,
      nextActions: [],
      totalGateResults: 1,
      totalRuns: 1,
    }, {
      maxActionPlanSeverity: 'info',
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(warnActionPlanBudget.status, 'fail', 'stats budget should fail when action plan severity exceeds policy');
    assertTrue(
      warnActionPlanBudget.findings.some((finding) => finding.includes('action plan severity warn exceeded max info')),
      'stats budget should explain action plan severity failures',
    );
    const requiredScopeHintBudget = evaluateQualityStatsBudget({
      actionPlanSummary: {
        maxRequiredSeverity: 'none',
        maxSeverity: 'info',
        recommendedHintCommand: 'node scripts/quality-runner.mjs remote-cache env --health-only',
        recommendedNextCommand: 'node scripts/quality-runner.mjs remote-cache env --health-only',
        recommendedRequiredCommand: null,
      },
      budgetWarnings: [],
      cacheHitRate: 1,
      nextActions: [],
      totalGateResults: 1,
      totalRuns: 1,
    }, {
      actionPlanSeverityScope: 'required',
      maxActionPlanSeverity: 'none',
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(requiredScopeHintBudget.status, 'pass', 'required-scope stats budget should ignore operator-hint-only action plans');
    assertEqual(requiredScopeHintBudget.summary.actionPlanSeverity, 'none', 'required-scope stats budget should compare required severity');
    assertEqual(requiredScopeHintBudget.summary.actionPlanOverallSeverity, 'info', 'required-scope stats budget should still expose overall severity');
    const requiredScopeWarnBudget = evaluateQualityStatsBudget({
      actionPlanSummary: {
        maxRequiredSeverity: 'warn',
        maxSeverity: 'warn',
        recommendedNextCommand: 'node scripts/quality-runner.mjs remote-cache smoke --json',
        recommendedRequiredCommand: 'node scripts/quality-runner.mjs benchmark verify:slow --runs 3',
      },
      budgetWarnings: [],
      cacheHitRate: 1,
      nextActions: [],
      totalGateResults: 1,
      totalRuns: 1,
    }, {
      actionPlanSeverityScope: 'required',
      maxActionPlanSeverity: 'info',
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(requiredScopeWarnBudget.status, 'fail', 'required-scope stats budget should fail required actions above threshold');
    assertTrue(
      requiredScopeWarnBudget.findings.some((finding) => finding.includes('required action plan severity warn exceeded max info; next=node scripts/quality-runner.mjs benchmark verify:slow --runs 3')),
      'required-scope stats budget should report the required command, not the first operator hint',
    );
    const infoActionPlanBudget = evaluateQualityStatsBudget({
      actionPlanSummary: {
        maxSeverity: 'info',
      },
      budgetWarnings: [],
      cacheHitRate: 1,
      nextActions: [],
      totalGateResults: 1,
      totalRuns: 1,
    }, {
      maxActionPlanSeverity: 'info',
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(infoActionPlanBudget.status, 'pass', 'stats budget should allow info-level action plan items by default');
    const localProfile = qualityStatsBudgetPolicyFromEnv({});
    assertEqual(localProfile.profile, 'local', 'stats budget policy should default to local profile');
    assertEqual(localProfile.minCacheHitRate, 0, 'local stats budget should keep cache hit-rate diagnostics advisory');
    const ciProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_PROFILE: 'ci',
    });
    assertEqual(ciProfile.minCacheHitRate, 0.5, 'ci stats budget should keep cache hit-rate policy enforcement');
    const relaxedProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_PROFILE: 'relaxed',
    });
    assertEqual(relaxedProfile.profile, 'relaxed', 'stats budget policy should expose the selected profile');
    assertEqual(relaxedProfile.actionPlanSeverityScope, 'all', 'stats budget should preserve all-action severity scope by default');
    assertEqual(relaxedProfile.maxActionPlanSeverity, 'warn', 'relaxed stats budget profile should allow warn-level action plan items');
    assertEqual(relaxedProfile.maxNextActions, 3, 'relaxed stats budget profile should raise next-action tolerance');
    const strictProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_PROFILE: 'strict',
    });
    assertEqual(strictProfile.requireEvents, true, 'strict stats budget profile should require event history');
    assertEqual(strictProfile.actionPlanSeverityScope, 'all', 'strict stats budget profile should preserve existing all-action severity semantics by default');
    assertEqual(strictProfile.maxActionPlanSeverity, 'none', 'strict stats budget profile should fail on any action plan item');
    const ciRequiredProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_PROFILE: 'ci-required',
    });
    assertEqual(ciRequiredProfile.profile, 'ci-required', 'stats budget policy should expose the ci-required profile');
    assertEqual(ciRequiredProfile.actionPlanSeverityScope, 'required', 'ci-required profile should gate required actions only');
    assertEqual(ciRequiredProfile.maxActionPlanSeverity, 'none', 'ci-required profile should fail on any required action');
    assertEqual(ciRequiredProfile.requireEvents, false, 'ci-required profile should preserve ci event-history semantics');
    const strictRequiredProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_PROFILE: 'strict-required',
    });
    assertEqual(strictRequiredProfile.profile, 'strict-required', 'stats budget policy should expose the strict-required profile');
    assertEqual(strictRequiredProfile.actionPlanSeverityScope, 'required', 'strict-required profile should gate required actions only');
    assertEqual(strictRequiredProfile.maxActionPlanSeverity, 'none', 'strict-required profile should fail on any required action');
    assertEqual(strictRequiredProfile.requireEvents, true, 'strict-required profile should require event history');
    assertEqual(strictRequiredProfile.minGateResultsForCacheHitRate, 1, 'strict-required profile should use strict cache hit-rate sampling');
    const overriddenProfile = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE: 'required',
      QUALITY_STATS_BUDGET_MAX_ACTION_SEVERITY: 'error',
      QUALITY_STATS_BUDGET_PROFILE: 'relaxed',
    });
    assertEqual(overriddenProfile.actionPlanSeverityScope, 'required', 'explicit env should switch stats budget to required-only action severity scope');
    assertEqual(overriddenProfile.maxActionPlanSeverity, 'error', 'explicit env values should override profile presets');
    const requiredProfileOverride = qualityStatsBudgetPolicyFromEnv({
      QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE: 'all',
      QUALITY_STATS_BUDGET_PROFILE: 'ci-required',
    });
    assertEqual(requiredProfileOverride.actionPlanSeverityScope, 'all', 'explicit env should override ci-required action severity scope');
    let invalidProfileThrew = false;
    let invalidProfileMessage = '';
    try {
      qualityStatsBudgetPolicyFromEnv({
        QUALITY_STATS_BUDGET_PROFILE: 'unknown',
      });
    } catch (error) {
      invalidProfileThrew = true;
      invalidProfileMessage = error.message;
    }
    assertTrue(invalidProfileThrew, 'stats budget policy should reject unknown profiles');
    assertIncludes(invalidProfileMessage, 'ci-required', 'invalid profile message should list ci-required');
    assertIncludes(invalidProfileMessage, 'strict-required', 'invalid profile message should list strict-required');
    let invalidSeverityScopeThrew = false;
    try {
      qualityStatsBudgetPolicyFromEnv({
        QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE: 'unknown',
      });
    } catch {
      invalidSeverityScopeThrew = true;
    }
    assertTrue(invalidSeverityScopeThrew, 'stats budget policy should reject unknown action severity scopes');

    const emptyBudget = evaluateQualityStatsBudget({
      budgetWarnings: [],
      cacheHitRate: 0,
      nextActions: [],
      totalGateResults: 0,
      totalRuns: 0,
    });
    assertEqual(emptyBudget.status, 'pass', 'stats budget should treat empty local history as neutral by default');

    const requiredEmptyBudget = evaluateQualityStatsBudget({
      budgetWarnings: [],
      cacheHitRate: 0,
      nextActions: [],
      totalGateResults: 0,
      totalRuns: 0,
    }, {
      maxBudgetWarnings: 0,
      maxNextActions: 0,
      minCacheHitRate: 0.5,
      minGateResultsForCacheHitRate: 1,
      requireEvents: true,
      requireRemoteCache: false,
    });
    assertEqual(requiredEmptyBudget.status, 'fail', 'stats budget should fail empty history when events are required');

    assertCacheStatsRollingWindow({
      assertEqual,
      assertIncludes,
      assertNotIncludes,
      repoRoot,
    });
    assertCacheStatsSinceCommit({ assertEqual, repoRoot });
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
}
