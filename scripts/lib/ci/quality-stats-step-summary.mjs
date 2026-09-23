import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const DEFAULT_PROFILE = 'ci';
const DEFAULT_POLICY_COMMAND = 'npm run verify:quality:stats-policy';
const DEFAULT_REQUIRED_POLICY_COMMAND = 'npm run verify:quality:stats-policy:required';
const DEFAULT_STATS_COMMAND = Object.freeze([
  'node',
  ['scripts/quality-runner.mjs', 'stats', '--json'],
]);
const ACTION_SECTION_LIMIT = 5;

function markdownCell(value) {
  return String(value ?? 'N/A')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function code(value) {
  if (value === undefined || value === null || value === '') {
    return '`N/A`';
  }
  return `\`${String(value).replaceAll('`', '\\`')}\``;
}

function codeCell(value) {
  return markdownCell(code(value));
}

function percent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${Math.round(value * 100)}%`;
}

function count(value) {
  return Number.isFinite(value) ? String(value) : '0';
}

function severityCountsText(summary = {}) {
  const counts = summary.severityCounts ?? {};
  return [
    `error=${count(counts.error)}`,
    `warn=${count(counts.warn)}`,
    `info=${count(counts.info)}`,
  ].join(', ');
}

function policyStatusText(exitCode) {
  if (exitCode === undefined || exitCode === null || exitCode === '') {
    return 'not captured';
  }
  const numericExitCode = Number(exitCode);
  if (!Number.isInteger(numericExitCode)) {
    return `unknown (${exitCode})`;
  }
  return numericExitCode === 0 ? 'pass' : `fail (exit ${numericExitCode})`;
}

function policyFailed(exitCode) {
  if (exitCode === undefined || exitCode === null || exitCode === '') {
    return false;
  }
  const numericExitCode = Number(exitCode);
  return Number.isInteger(numericExitCode) && numericExitCode !== 0;
}

function severityNeedsAction(severity) {
  return severity === 'warn' || severity === 'error';
}

function actionIsRequired(action = {}) {
  if (action.required === true || action.kind === 'required-action') {
    return true;
  }
  if (action.kind === 'operator-hint') {
    return false;
  }
  return severityNeedsAction(action.severity);
}

function actionKind(action = {}) {
  return action.kind ?? (actionIsRequired(action) ? 'required-action' : 'operator-hint');
}

function firstActionCommand(action = {}) {
  return action.commands?.[0] ?? action.command ?? action.setupCommand ?? action.doctorCommand ?? action.smokeCommand;
}

function pushActionSection(lines, heading, actions) {
  const visibleActions = actions.slice(0, ACTION_SECTION_LIMIT);
  lines.push(
    '',
    `### ${heading}`,
    '',
    '| Severity | Kind | Action | Reason | First command |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const action of visibleActions) {
    lines.push([
      markdownCell(action.severity ?? 'info'),
      markdownCell(actionKind(action)),
      markdownCell(action.action ?? action.type ?? 'unknown'),
      markdownCell(action.reason ?? 'N/A'),
      codeCell(firstActionCommand(action)),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
}

export function renderQualityStatsStepSummary(stats = {}, options = {}) {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const policyExitCode = options.policyExitCode;
  const actionPlanSummary = stats.actionPlanSummary ?? {};
  const remoteCache = stats.remoteCache ?? {};
  const remoteCacheHealth = stats.remoteCacheHealth ?? null;
  const actionPlan = Array.isArray(stats.actionPlan) ? stats.actionPlan : [];
  const requiredActions = actionPlan.filter(actionIsRequired);
  const hintActions = actionPlan.filter((action) => !actionIsRequired(action));

  const lines = [
    '## Quality stats policy',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Profile | ${code(profile)} |`,
    `| Policy result | ${markdownCell(policyStatusText(policyExitCode))} |`,
    `| Runs | ${markdownCell(stats.totalRuns ?? 0)} |`,
    `| Gate results | ${markdownCell(stats.totalGateResults ?? 0)} |`,
    `| Cache hit rate | ${markdownCell(percent(stats.cacheHitRate))} |`,
    `| Action severity | ${code(actionPlanSummary.maxSeverity ?? 'none')} |`,
    `| Required severity | ${code(actionPlanSummary.maxRequiredSeverity ?? 'none')} |`,
    `| Required actions | ${markdownCell(actionPlanSummary.requiredActionCount ?? 0)} |`,
    `| Operator hints | ${markdownCell(actionPlanSummary.hintActionCount ?? 0)} |`,
    `| Severity counts | ${markdownCell(severityCountsText(actionPlanSummary))} |`,
    `| Recommended next command | ${codeCell(actionPlanSummary.recommendedNextCommand)} |`,
    `| Recommended required command | ${codeCell(actionPlanSummary.recommendedRequiredCommand)} |`,
    `| Remote cache | ${markdownCell(`${remoteCache.status ?? 'unknown'} / ${remoteCache.mode ?? 'unknown'}`)} |`,
    `| Remote cache health | ${markdownCell(remoteCacheHealth ? `${remoteCacheHealth.status ?? 'unknown'} / ${remoteCacheHealth.freshness ?? 'unknown'} / matches=${remoteCacheHealth.matchesRemote === true ? 'yes' : 'no'}` : 'N/A')} |`,
  ];

  if (actionPlan.length > 0) {
    if (requiredActions.length > 0) {
      pushActionSection(lines, 'Required action plan', requiredActions);
    }
    if (hintActions.length > 0) {
      pushActionSection(lines, 'Operator hints', hintActions);
    }
  } else {
    lines.push('', 'No current quality stats actions.');
  }

  if (policyFailed(policyExitCode) || severityNeedsAction(actionPlanSummary.maxSeverity)) {
    lines.push(
      '',
      '### Operator runbook',
      '',
      '- Review `Policy result`, `Action severity`, and the action sections above.',
      `- Re-run required-only policy when you only want blocking actions: ${code(DEFAULT_REQUIRED_POLICY_COMMAND)}.`,
      `- Run the recommended required command if present: ${codeCell(actionPlanSummary.recommendedRequiredCommand)}.`,
      `- Run the recommended command if present: ${codeCell(actionPlanSummary.recommendedNextCommand ?? 'node scripts/quality-runner.mjs stats --action-plan')}.`,
      `- Re-run ${code(DEFAULT_POLICY_COMMAND)} after remediation.`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export function readQualityStatsJson(options = {}) {
  const {
    command = DEFAULT_STATS_COMMAND[0],
    args = DEFAULT_STATS_COMMAND[1],
    cwd = process.cwd(),
    env = process.env,
  } = options;
  const stdout = execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(stdout);
}

export function writeQualityStatsStepSummary(options = {}) {
  const env = options.env ?? process.env;
  const profile = env.QUALITY_STATS_BUDGET_PROFILE ?? DEFAULT_PROFILE;
  const policyExitCode = env.QUALITY_STATS_POLICY_EXIT_CODE;
  const stats = options.stats ?? readQualityStatsJson({
    cwd: options.cwd,
    env,
  });
  const markdown = renderQualityStatsStepSummary(stats, { policyExitCode, profile });
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
    return { destination: env.GITHUB_STEP_SUMMARY, markdown };
  }
  process.stdout.write(markdown);
  return { destination: 'stdout', markdown };
}
