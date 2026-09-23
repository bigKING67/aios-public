#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createCheckGuard,
} from '../../lib/shared/guard-utils.mjs';
import {
  renderQualityStatsStepSummary,
  writeQualityStatsStepSummary,
} from '../../lib/ci/quality-stats-step-summary.mjs';

const {
  assert,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  reportOk,
} = createCheckGuard('quality-stats-step-summary-behavior');

function warnStatsFixture() {
  return {
    actionPlan: [{
      action: 'verify-remote-hit',
      commands: ['node scripts/quality-runner.mjs remote-cache smoke --json'],
      kind: 'required-action',
      reason: 'remote cache is configured but recent stats have zero remote hits',
      required: true,
      severity: 'warn',
    }],
    actionPlanSummary: {
      hintActionCount: 0,
      maxSeverity: 'warn',
      maxRequiredSeverity: 'warn',
      recommendedNextCommand: 'node scripts/quality-runner.mjs remote-cache smoke --json',
      recommendedRequiredCommand: 'node scripts/quality-runner.mjs remote-cache smoke --json',
      requiredActionCount: 1,
      severityCounts: { error: 0, info: 0, warn: 1 },
    },
    cacheHitRate: 0.742,
    remoteCache: { mode: 'readwrite', status: 'ready' },
    remoteCacheHealth: { freshness: 'fresh', matchesRemote: true, status: 'pass' },
    totalGateResults: 224,
    totalRuns: 12,
  };
}

function mixedStatsFixture() {
  const hintCommand = 'node scripts/quality-runner.mjs remote-cache env --remote-cache-mode read';
  const requiredCommand = 'node scripts/quality-runner.mjs benchmark verify:ci --runs 3';
  return {
    actionPlan: [
      {
        action: 'enable-remote-cache-env',
        commands: [hintCommand],
        kind: 'operator-hint',
        reason: 'remote cache is healthy but not enabled for manual stats runs',
        required: false,
        severity: 'info',
      },
      {
        action: 'benchmark-slow-gate',
        commands: [requiredCommand],
        kind: 'required-action',
        reason: 'verify:ci latest cold duration exceeds the budget',
        required: true,
        severity: 'warn',
      },
    ],
    actionPlanSummary: {
      hintActionCount: 1,
      maxSeverity: 'warn',
      maxRequiredSeverity: 'warn',
      recommendedHintCommand: hintCommand,
      recommendedNextCommand: hintCommand,
      recommendedRequiredCommand: requiredCommand,
      requiredActionCount: 1,
      severityCounts: { error: 0, info: 1, warn: 1 },
    },
    cacheHitRate: 0.5,
    remoteCache: { mode: 'read', status: 'ready' },
    totalGateResults: 2,
    totalRuns: 1,
  };
}

function markdownSection(markdown, heading, nextHeading) {
  const start = markdown.indexOf(heading);
  if (start === -1) {
    return '';
  }
  const end = nextHeading ? markdown.indexOf(nextHeading, start + heading.length) : -1;
  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}

function runFixtures() {
  {
    const markdown = renderQualityStatsStepSummary(warnStatsFixture(), {
      policyExitCode: 1,
      profile: 'ci',
    });
    assertIncludes(markdown, '## Quality stats policy', 'summary should include title');
    assertIncludes(markdown, '| Profile | `ci` |', 'summary should include profile');
    assertIncludes(markdown, '| Policy result | fail (exit 1) |', 'summary should include captured policy failure');
    assertIncludes(markdown, '| Cache hit rate | 74% |', 'summary should include rounded cache hit rate');
    assertIncludes(markdown, '| Action severity | `warn` |', 'summary should include warning severity');
    assertIncludes(markdown, '| Required severity | `warn` |', 'summary should include required action severity');
    assertIncludes(markdown, '| Required actions | 1 |', 'summary should include required action count');
    assertIncludes(markdown, '| Operator hints | 0 |', 'summary should include operator hint count');
    assertIncludes(
      markdown,
      '### Required action plan',
      'required-only summary should include required action section',
    );
    assertNotIncludes(
      markdown,
      '### Operator hints',
      'required-only summary should not include empty hint section',
    );
    assertIncludes(markdown, 'required-action', 'summary should classify action plan rows');
    assertIncludes(markdown, 'remote cache is configured but recent stats have zero remote hits', 'summary should include action reason');
    assertIncludes(markdown, '`node scripts/quality-runner.mjs remote-cache smoke --json`', 'summary should include recommended command');
    assertIncludes(markdown, '### Operator runbook', 'failed policy summary should include operator runbook');
    assertIncludes(markdown, 'Re-run required-only policy when you only want blocking actions: `npm run verify:quality:stats-policy:required`.', 'runbook should include required-only policy rerun command');
    assertIncludes(markdown, 'Run the recommended required command if present: `node scripts/quality-runner.mjs remote-cache smoke --json`.', 'runbook should include required command guidance');
    assertIncludes(markdown, 'Re-run `npm run verify:quality:stats-policy` after remediation.', 'runbook should include policy rerun command');
    assertNotIncludes(markdown, 'undefined', 'summary should not leak undefined values');
  }

  {
    const markdown = renderQualityStatsStepSummary(mixedStatsFixture(), {
      policyExitCode: 1,
      profile: 'ci',
    });
    const requiredHeading = '### Required action plan';
    const hintHeading = '### Operator hints';
    assertIncludes(markdown, requiredHeading, 'mixed summary should include required section');
    assertIncludes(markdown, hintHeading, 'mixed summary should include operator hint section');
    assert(
      markdown.indexOf(requiredHeading) < markdown.indexOf(hintHeading),
      'mixed summary should render required actions before operator hints',
    );
    const requiredSection = markdownSection(markdown, requiredHeading, hintHeading);
    const hintSection = markdownSection(markdown, hintHeading, '### Operator runbook');
    assertIncludes(
      requiredSection,
      '`node scripts/quality-runner.mjs benchmark verify:ci --runs 3`',
      'required section should include required command',
    );
    assertNotIncludes(requiredSection, 'remote-cache env', 'required section should not include hint command');
    assertIncludes(
      hintSection,
      '`node scripts/quality-runner.mjs remote-cache env --remote-cache-mode read`',
      'hint section should include hint command',
    );
    assertNotIncludes(hintSection, 'benchmark verify:ci', 'hint section should not include required command');
    assertIncludes(
      markdown,
      'Run the recommended required command if present: `node scripts/quality-runner.mjs benchmark verify:ci --runs 3`.',
      'runbook should keep required command separate',
    );
    assertIncludes(
      markdown,
      'Run the recommended command if present: `node scripts/quality-runner.mjs remote-cache env --remote-cache-mode read`.',
      'runbook should keep next command separate',
    );
  }

  {
    const markdown = renderQualityStatsStepSummary({
      actionPlan: [],
      actionPlanSummary: {
        hintActionCount: 0,
        maxSeverity: 'none',
        maxRequiredSeverity: 'none',
        recommendedNextCommand: null,
        recommendedRequiredCommand: null,
        requiredActionCount: 0,
        severityCounts: { error: 0, info: 0, warn: 0 },
      },
      cacheHitRate: null,
      remoteCache: {},
      remoteCacheHealth: null,
      totalGateResults: 0,
      totalRuns: 0,
    }, { policyExitCode: 0, profile: 'strict' });
    assertIncludes(markdown, '| Profile | `strict` |', 'empty summary should preserve profile');
    assertIncludes(markdown, '| Policy result | pass |', 'empty summary should include captured policy pass');
    assertIncludes(markdown, '| Cache hit rate | N/A |', 'empty summary should display missing cache hit rate clearly');
    assertIncludes(markdown, '| Recommended next command | `N/A` |', 'empty summary should display missing command clearly');
    assertIncludes(markdown, 'No current quality stats actions.', 'empty action plan should be explicit');
    assertNotIncludes(markdown, '### Operator runbook', 'passing empty summary should not show remediation runbook');
    assertNotIncludes(markdown, 'verify:quality:stats-policy:required', 'passing empty summary should not show required-only rerun guidance');
  }

  {
    const markdown = renderQualityStatsStepSummary({
      actionPlan: [{
        action: 'repair|remote',
        command: 'node scripts/quality-runner.mjs stats | tee stats.log',
        reason: 'line one|line two\nline three',
        severity: 'error',
      }],
      actionPlanSummary: {
        maxSeverity: 'error',
        recommendedNextCommand: 'node scripts/quality-runner.mjs stats | tee stats.log',
        severityCounts: { error: 1, info: 0, warn: 0 },
      },
      cacheHitRate: 0,
      remoteCache: { mode: 'read', status: 'failed|invalid' },
      totalGateResults: 1,
      totalRuns: 1,
    }, { profile: 'ci' });
    assertIncludes(markdown, 'repair\\|remote', 'action names should escape markdown table pipes');
    assertIncludes(markdown, 'line one\\|line two<br>line three', 'reasons should escape pipes and flatten newlines');
    assertIncludes(markdown, '`node scripts/quality-runner.mjs stats \\| tee stats.log`', 'commands should escape markdown table pipes inside code spans');
    assertIncludes(markdown, 'failed\\|invalid / read', 'remote cache status should escape markdown table pipes');
    assertIncludes(markdown, '### Operator runbook', 'error severity summary should include operator runbook');
  }

  {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-quality-stats-summary-'));
    try {
      const summaryPath = path.join(tempDir, 'summary.md');
      const result = writeQualityStatsStepSummary({
        env: {
          GITHUB_STEP_SUMMARY: summaryPath,
          QUALITY_STATS_POLICY_EXIT_CODE: '1',
          QUALITY_STATS_BUDGET_PROFILE: 'ci',
        },
        stats: warnStatsFixture(),
      });
      assertEqual(result.destination, summaryPath, 'writer should report GitHub summary destination');
      const summaryText = readFileSync(summaryPath, 'utf8');
      assertIncludes(summaryText, '| Policy result | fail (exit 1) |', 'writer should persist captured policy failure');
      assertIncludes(summaryText, '| Action severity | `warn` |', 'writer should persist rendered summary');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  }
}

runFixtures();
reportOk('warn/error/empty rendering, action section split, markdown escaping, and GitHub summary writing passed.');
