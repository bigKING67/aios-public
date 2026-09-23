export const DEFAULT_QUALITY_STATS_BUDGET_POLICY = Object.freeze({
  actionPlanSeverityScope: 'all',
  limit: 200,
  maxActionPlanSeverity: 'info',
  maxBudgetWarnings: 0,
  maxNextActions: 0,
  minCacheHitRate: 0.5,
  minGateResultsForCacheHitRate: 50,
  profile: 'local',
  requireEvents: false,
  requireRemoteCache: false,
  slowLimit: 10,
});

const QUALITY_STATS_BUDGET_PROFILE_PRESETS = Object.freeze({
  local: Object.freeze({
    maxActionPlanSeverity: 'info',
    minCacheHitRate: 0,
  }),
  ci: Object.freeze({
    maxActionPlanSeverity: 'info',
    minCacheHitRate: 0.5,
  }),
  'ci-required': Object.freeze({
    actionPlanSeverityScope: 'required',
    maxActionPlanSeverity: 'none',
  }),
  prepush: Object.freeze({
    maxActionPlanSeverity: 'warn',
    maxNextActions: 1,
  }),
  strict: Object.freeze({
    maxActionPlanSeverity: 'none',
    minGateResultsForCacheHitRate: 1,
    requireEvents: true,
  }),
  'strict-required': Object.freeze({
    actionPlanSeverityScope: 'required',
    maxActionPlanSeverity: 'none',
    minGateResultsForCacheHitRate: 1,
    requireEvents: true,
  }),
  relaxed: Object.freeze({
    maxActionPlanSeverity: 'warn',
    maxBudgetWarnings: 3,
    maxNextActions: 3,
  }),
});

const QUALITY_STATS_BUDGET_PROFILE_NAMES = Object.freeze(Object.keys(QUALITY_STATS_BUDGET_PROFILE_PRESETS));

const ACTION_PLAN_SEVERITY_RANK = Object.freeze({
  none: 0,
  info: 1,
  warn: 2,
  error: 3,
});

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue, name) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function parseRate(value, defaultValue, name) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return parsed;
}

function parseSeverity(value, defaultValue, name) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const severity = String(value).toLowerCase();
  if (!Object.hasOwn(ACTION_PLAN_SEVERITY_RANK, severity)) {
    throw new Error(`${name} must be none, info, warn, or error`);
  }
  return severity;
}

function parseActionPlanSeverityScope(value, defaultValue = 'all') {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const scope = String(value).trim().toLowerCase();
  if (!['all', 'required'].includes(scope)) {
    throw new Error('QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE must be all or required');
  }
  return scope;
}

function severityRank(severity) {
  return ACTION_PLAN_SEVERITY_RANK[severity] ?? ACTION_PLAN_SEVERITY_RANK.info;
}

function budgetProfileDefaults(env = process.env) {
  const profile = String(env.QUALITY_STATS_BUDGET_PROFILE ?? DEFAULT_QUALITY_STATS_BUDGET_POLICY.profile).trim().toLowerCase();
  if (!Object.hasOwn(QUALITY_STATS_BUDGET_PROFILE_PRESETS, profile)) {
    throw new Error(`QUALITY_STATS_BUDGET_PROFILE must be one of: ${QUALITY_STATS_BUDGET_PROFILE_NAMES.join(', ')}`);
  }
  return Object.freeze({
    ...DEFAULT_QUALITY_STATS_BUDGET_POLICY,
    ...QUALITY_STATS_BUDGET_PROFILE_PRESETS[profile],
    profile,
  });
}

export function qualityStatsBudgetPolicyFromEnv(env = process.env) {
  const defaults = budgetProfileDefaults(env);
  return Object.freeze({
    actionPlanSeverityScope: parseActionPlanSeverityScope(
      env.QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE,
      defaults.actionPlanSeverityScope,
    ),
    limit: parseInteger(env.QUALITY_STATS_BUDGET_LIMIT, defaults.limit, 'QUALITY_STATS_BUDGET_LIMIT'),
    maxActionPlanSeverity: parseSeverity(
      env.QUALITY_STATS_BUDGET_MAX_ACTION_SEVERITY,
      defaults.maxActionPlanSeverity,
      'QUALITY_STATS_BUDGET_MAX_ACTION_SEVERITY',
    ),
    maxBudgetWarnings: parseInteger(
      env.QUALITY_STATS_BUDGET_MAX_WARNINGS,
      defaults.maxBudgetWarnings,
      'QUALITY_STATS_BUDGET_MAX_WARNINGS',
    ),
    maxNextActions: parseInteger(
      env.QUALITY_STATS_BUDGET_MAX_NEXT_ACTIONS,
      defaults.maxNextActions,
      'QUALITY_STATS_BUDGET_MAX_NEXT_ACTIONS',
    ),
    minCacheHitRate: parseRate(
      env.QUALITY_STATS_BUDGET_MIN_CACHE_HIT_RATE,
      defaults.minCacheHitRate,
      'QUALITY_STATS_BUDGET_MIN_CACHE_HIT_RATE',
    ),
    minGateResultsForCacheHitRate: parseInteger(
      env.QUALITY_STATS_BUDGET_MIN_GATE_RESULTS,
      defaults.minGateResultsForCacheHitRate,
      'QUALITY_STATS_BUDGET_MIN_GATE_RESULTS',
    ),
    profile: defaults.profile,
    requireEvents: parseBoolean(
      env.QUALITY_STATS_BUDGET_REQUIRE_EVENTS,
      defaults.requireEvents,
    ),
    requireRemoteCache: parseBoolean(
      env.QUALITY_STATS_BUDGET_REQUIRE_REMOTE_CACHE,
      defaults.requireRemoteCache,
    ),
    slowLimit: parseInteger(env.QUALITY_STATS_BUDGET_SLOW_LIMIT, defaults.slowLimit, 'QUALITY_STATS_BUDGET_SLOW_LIMIT'),
  });
}

function percent(value) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function gateNames(items) {
  return items.map((item) => item.name ?? item.gate).filter(Boolean);
}

export function evaluateQualityStatsBudget(stats, policy = DEFAULT_QUALITY_STATS_BUDGET_POLICY) {
  const findings = [];
  const notes = [];
  const totalRuns = stats.totalRuns ?? 0;
  const totalGateResults = stats.totalGateResults ?? 0;
  const budgetWarnings = stats.budgetWarnings ?? [];
  const nextActions = stats.nextActions ?? [];
  const actionPlanSummary = stats.actionPlanSummary ?? {};
  const actionPlanMaxSeverity = actionPlanSummary.maxSeverity ?? 'none';
  const actionPlanMaxRequiredSeverity = actionPlanSummary.maxRequiredSeverity ?? 'none';
  const actionPlanSeverityScope = policy.actionPlanSeverityScope ?? 'all';
  const actionPlanBudgetSeverity = actionPlanSeverityScope === 'required'
    ? actionPlanMaxRequiredSeverity
    : actionPlanMaxSeverity;
  const actionPlanRecommendedCommand = actionPlanSeverityScope === 'required'
    ? actionPlanSummary.recommendedRequiredCommand
    : actionPlanSummary.recommendedNextCommand;
  const actionPlanSeverityLabel = actionPlanSeverityScope === 'required'
    ? 'required action plan severity'
    : 'action plan severity';

  if (totalRuns === 0 || totalGateResults === 0) {
    const message = 'quality stats budget has no event history to evaluate';
    if (policy.requireEvents) {
      findings.push(`${message}; run at least one quality-runner profile first or unset QUALITY_STATS_BUDGET_REQUIRE_EVENTS`);
    } else {
      notes.push(`${message}; treating empty history as neutral`);
    }
  }

  if (budgetWarnings.length > policy.maxBudgetWarnings) {
    findings.push(
      `budget warnings ${budgetWarnings.length} exceeded max ${policy.maxBudgetWarnings}: ${gateNames(budgetWarnings).join(', ')}`,
    );
  }

  if (nextActions.length > policy.maxNextActions) {
    findings.push(
      `actionable performance items ${nextActions.length} exceeded max ${policy.maxNextActions}: ${gateNames(nextActions).join(', ')}`,
    );
  }

  if (
    totalGateResults >= policy.minGateResultsForCacheHitRate
    && (stats.cacheHitRate ?? 0) < policy.minCacheHitRate
  ) {
    findings.push(
      `cache hit rate ${percent(stats.cacheHitRate)} is below minimum ${percent(policy.minCacheHitRate)} over ${totalGateResults} gate results`,
    );
  } else if (totalGateResults < policy.minGateResultsForCacheHitRate) {
    notes.push(
      `cache hit-rate budget skipped until at least ${policy.minGateResultsForCacheHitRate} gate results are available`,
    );
  }

  if (policy.requireRemoteCache && (stats.cacheSources?.remote ?? 0) === 0) {
    findings.push('remote cache is required but the stats window has zero remote cache hits');
  }

  if (severityRank(actionPlanBudgetSeverity) > severityRank(policy.maxActionPlanSeverity)) {
    const nextCommand = actionPlanRecommendedCommand
      ? `; next=${actionPlanRecommendedCommand}`
      : '';
    findings.push(
      `${actionPlanSeverityLabel} ${actionPlanBudgetSeverity} exceeded max ${policy.maxActionPlanSeverity}${nextCommand}`,
    );
  }

  return Object.freeze({
    findings: Object.freeze(findings),
    notes: Object.freeze(notes),
    policy,
    status: findings.length === 0 ? 'pass' : 'fail',
    summary: Object.freeze({
      budgetWarnings: budgetWarnings.length,
      cacheHitRate: stats.cacheHitRate ?? 0,
      actionPlanOverallSeverity: actionPlanMaxSeverity,
      actionPlanRequiredSeverity: actionPlanMaxRequiredSeverity,
      actionPlanSeverity: actionPlanBudgetSeverity,
      actionPlanSeverityScope,
      nextActions: nextActions.length,
      remoteCacheHits: stats.cacheSources?.remote ?? 0,
      totalGateResults,
      totalRuns,
    }),
  });
}

export function formatQualityStatsBudgetEvaluation(evaluation) {
  const lines = [
    `profile=${evaluation.policy.profile ?? 'custom'}`,
    `runs=${evaluation.summary.totalRuns}`,
    `gates=${evaluation.summary.totalGateResults}`,
    `cacheHitRate=${percent(evaluation.summary.cacheHitRate)}`,
    `actionPlanSeverity=${evaluation.summary.actionPlanSeverity}`,
    `actionPlanSeverityScope=${evaluation.summary.actionPlanSeverityScope}`,
    `overallActionPlanSeverity=${evaluation.summary.actionPlanOverallSeverity}`,
    `requiredActionPlanSeverity=${evaluation.summary.actionPlanRequiredSeverity}`,
    `budgetWarnings=${evaluation.summary.budgetWarnings}`,
    `nextActions=${evaluation.summary.nextActions}`,
    `remoteCacheHits=${evaluation.summary.remoteCacheHits}`,
  ];
  if (evaluation.notes.length > 0) {
    lines.push(`notes=${evaluation.notes.join(' | ')}`);
  }
  return lines.join(' ');
}
