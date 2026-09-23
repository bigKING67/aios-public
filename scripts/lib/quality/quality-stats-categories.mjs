import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
} from './quality-runner-slices.mjs';
import {
  commandKind,
} from './quality-stats-target-signals.mjs';

export const CATEGORY_BUDGETS = Object.freeze({
  'behavior-fixture': {
    warnMaxMs: 8000,
    warnAvgMs: 5000,
    hint: 'batch behavior fixtures, reuse temp repos, and avoid one subprocess per assertion branch',
  },
  'build-artifact': {
    warnMaxMs: 25000,
    warnAvgMs: 18000,
    hint: 'inspect build cache, dist freshness checks, and bundle budget dependencies before changing coverage',
  },
  'type-system': {
    warnMaxMs: 20000,
    warnAvgMs: 12000,
    hint: 'inspect TypeScript project references, changed-file scope, and repeated compiler startup',
  },
  'backend-serial': {
    warnMaxMs: 20000,
    warnAvgMs: 12000,
    hint: 'keep cargo ordering correct, then look for shared target-dir and narrower affected backend gates',
  },
  'dependency-audit': {
    warnMaxMs: 60000,
    warnAvgMs: 30000,
    hint: 'separate advisory-service latency from dependency resolution; keep live vulnerability checks blocking',
  },
  'unit-suite': {
    warnMaxMs: 20000,
    warnAvgMs: 12000,
    hint: 'profile the full uncached test suite and its runtime startup without reducing test coverage',
  },
  'runtime-smoke': {
    warnMaxMs: 20000,
    warnAvgMs: 12000,
    hint: 'separate server startup cost from route assertions, then reuse preview sessions where safe',
  },
  'node-check': {
    warnMaxMs: 5000,
    warnAvgMs: 3000,
    hint: 'look for repeated repo scans, repeated JSON parsing, or repeated subprocess startup',
  },
  'shell-check': {
    warnMaxMs: 5000,
    warnAvgMs: 3000,
    hint: 'keep shell gates thin and push repeated work into shared Node helpers',
  },
  'compatibility-slice': {
    warnMaxMs: Number.POSITIVE_INFINITY,
    warnAvgMs: Number.POSITIVE_INFINITY,
    hint: 'compatibility aggregate entrypoint is kept for manual debugging; optimize primary slices instead',
  },
  other: {
    warnMaxMs: 8000,
    warnAvgMs: 5000,
    hint: 'inspect command startup and shared input scans before reducing coverage',
  },
});

export function budgetForCategory(category, {
  env = process.env,
  platform = process.platform,
} = {}) {
  const budget = CATEGORY_BUDGETS[category] ?? CATEGORY_BUDGETS.other;
  if (category === 'unit-suite' && platform === 'linux'
    && env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux') {
    return { ...budget, warnAvgMs: 45000, warnMaxMs: 60000, profile: 'github-linux' };
  }
  return { ...budget, profile: 'default' };
}

export function categoryForGate(gate, targetFiles = []) {
  const command = gate?.command ?? '';
  const kind = commandKind(command);
  if (!gate || gate.name === QUALITY_RUNNER_AGGREGATE_GATE_NAME) {
    return 'compatibility-slice';
  }
  if (gate.name === 'verify:ci') {
    return 'compatibility-slice';
  }
  if (
    gate?.name?.endsWith('-behavior')
    || targetFiles.some((file) => file.endsWith('.behavior.mjs') || file.endsWith('/behavior.mjs'))
  ) {
    return 'behavior-fixture';
  }
  if (gate?.name === 'build' || command.includes('vite build')) {
    return 'build-artifact';
  }
  if (gate?.name === 'type-check' || kind === 'tsc' || command.includes('tsc ')) {
    return 'type-system';
  }
  if (['audit:dependencies:npm', 'audit:dependencies:python', 'audit:dependencies:rust'].includes(gate.name)) {
    return 'dependency-audit';
  }
  if (gate?.group === 'backend' || kind === 'cargo') {
    return 'backend-serial';
  }
  if (gate.name === 'test:frontend:unit' || gate.name === 'test:etl:unit') {
    return 'unit-suite';
  }
  if (gate?.name?.includes(':smoke') || command.includes('vite preview')) {
    return 'runtime-smoke';
  }
  if (kind === 'node') {
    return 'node-check';
  }
  if (kind === 'shell') {
    return 'shell-check';
  }
  return 'other';
}

export function budgetStatus(item, budget) {
  if (!budget) {
    return 'unknown';
  }
  return item.coldMaxMs > budget.warnMaxMs || item.coldAvgMs > budget.warnAvgMs ? 'warn' : 'ok';
}

export function recommendationFor(category, signals) {
  const budget = CATEGORY_BUDGETS[category] ?? CATEGORY_BUDGETS.other;
  if (category === 'compatibility-slice') {
    return budget.hint;
  }
  if (signals.gateName === 'verify:ci:release-version-bump') {
    return 'release governance compares pushed base/head and changed files; keep correctness before cache tuning unless this cheap guard becomes materially slower';
  }
  if ((signals.cacheHitRate ?? 0) >= 0.8 && (signals.coldCount ?? 0) <= Math.max(1, Math.ceil((signals.count ?? 0) * 0.2))) {
    return 'mostly cache hits in recent runs; prioritize cold-path gates before reworking this cached gate';
  }
  if (signals.gateName === 'verify:frontend:design-evolution' && signals.inputHealth === 'ok') {
    return 'changed-file manifest driven; cold path batches HEAD lookups, so prefer fresh samples before treating historical max as current slowness';
  }
  if (category === 'build-artifact' && signals.hasOutputs && signals.cacheable) {
    return 'artifact cache is enabled for declared outputs; inspect cold build only when fresh samples miss artifact cache';
  }
  if (category === 'behavior-fixture') {
    if ((signals.withTempRepoCount ?? 0) > 6 || (signals.spawnSyncCount ?? 0) > 3) {
      return 'fixture fragmentation detected; batch same-kind pass/fail cases into fewer temp repos and subprocesses';
    }
    return budget.hint;
  }
  return budget.hint;
}
