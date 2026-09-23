import {
  CI_META_GATES,
  QUALITY_RUNNER_CHECK_COMMAND_GATES,
} from './quality-affected-gates.mjs';

function weeklyBoundaryScriptGates(...names) {
  return [
    ...CI_META_GATES,
    ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
    'lint:scripts',
    ...names,
    'verify:weekly:boundary-gate-registry',
  ];
}

function rule(gates, reason) {
  return Object.freeze({
    gates: Object.freeze(gates),
    reason,
  });
}

const WEEKLY_GATE_METADATA_FILES = new Set([
  'scripts/lib/weekly/weekly-behavior-gates.mjs',
  'scripts/lib/weekly/weekly-boundary-gates.mjs',
]);

const WEEKLY_TABS_STYLE_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-style-boundaries-core.mjs',
]);

const WEEKLY_TABS_CONTRACT_LAYERS_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-contract-layers-core.mjs',
]);

const WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs',
]);

const WEEKLY_TABS_CONTRACT_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-contract-boundaries-core.mjs',
]);

const WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs',
]);

const WEEKLY_TABS_ADAPTER_LAYERS_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-adapter-layers-core.mjs',
]);

const WEEKLY_TABS_RENDER_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/weekly/weekly-tabs-render-boundaries-core.mjs',
]);

export const WEEKLY_BEHAVIOR_FIXTURE_GATES_BY_FILE = new Map([
  ['scripts/fixtures/weekly/behavior-gate-registry.behavior-fixtures.mjs', ['verify:weekly:behavior-gate-registry-behavior']],
  ['scripts/fixtures/weekly/behavior-guard-quality.behavior-fixtures.mjs', ['verify:weekly:behavior-guard-quality-behavior']],
  ['scripts/fixtures/weekly/overview-by-week-trend.behavior-fixtures.mjs', ['verify:weekly:overview-by-week-trend']],
  ['scripts/fixtures/weekly/overview-kpi-section-adapter.behavior-fixtures.mjs', ['verify:weekly:overview-kpi-section-adapter']],
  ['scripts/fixtures/weekly/overview-platform-breakdown.behavior-fixtures.mjs', ['verify:weekly:overview-platform-breakdown']],
  ['scripts/fixtures/weekly/overview-trend.behavior-fixtures.mjs', ['verify:weekly:overview-trend']],
  ['scripts/fixtures/weekly/overview-trend-section-adapter.behavior-fixtures.mjs', ['verify:weekly:overview-trend-section-adapter']],
  ['scripts/fixtures/weekly/overview-by-week-trend-section-adapter.behavior-fixtures.mjs', ['verify:weekly:overview-by-week-trend-section-adapter']],
  ['scripts/fixtures/weekly/overview-platform-breakdown-section-adapter.behavior-fixtures.mjs', ['verify:weekly:overview-platform-breakdown-section-adapter']],
  ['scripts/fixtures/weekly/overview-tab-content-adapter.behavior-fixtures.mjs', ['verify:weekly:overview-tab-content-adapter']],
  ['scripts/fixtures/weekly/platform-tab-content-adapters.behavior-fixtures.mjs', ['verify:weekly:platform-tab-content-adapters']],
  ['scripts/fixtures/weekly/platform-tab-content-routing.behavior-fixtures.mjs', ['verify:weekly:platform-tab-content-routing']],
  ['scripts/fixtures/weekly/platform-tab-kpi-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-kpi-section-adapter']],
  ['scripts/fixtures/weekly/platform-tab-render-state.behavior-fixtures.mjs', ['verify:weekly:platform-tab-render-state']],
  ['scripts/fixtures/weekly/platform-tab-trend-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-trend-section-adapter']],
  ['scripts/fixtures/weekly/primary-metrics.behavior-fixtures.mjs', ['verify:weekly:primary-metrics']],
  ['scripts/fixtures/weekly/douyin-attribution-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-attribution-section-adapter']],
  ['scripts/fixtures/weekly/douyin-attribution-section-props-contract.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-attribution-section-props-contract']],
  ['scripts/fixtures/weekly/douyin-card-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-card-leaf-adapter']],
  ['scripts/fixtures/weekly/douyin-card-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-card-section-adapter']],
  ['scripts/fixtures/weekly/douyin-channel-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-channel-leaf-adapter']],
  ['scripts/fixtures/weekly/douyin-live-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-live-leaf-adapter']],
  ['scripts/fixtures/weekly/douyin-live-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-live-section-adapter']],
  ['scripts/fixtures/weekly/douyin-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-section-adapter']],
  ['scripts/fixtures/weekly/douyin-section-list-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-section-list-adapter']],
  ['scripts/fixtures/weekly/douyin-shortvideo-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-shortvideo-leaf-adapter']],
  ['scripts/fixtures/weekly/douyin-shortvideo-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-douyin-shortvideo-section-adapter']],
  ['scripts/fixtures/weekly/funnel.behavior-fixtures.mjs', ['verify:weekly:funnel']],
  ['scripts/fixtures/weekly/tmall-attribution-section-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-tmall-attribution-section-adapter']],
  ['scripts/fixtures/weekly/tmall-funnel-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-tmall-funnel-leaf-adapter']],
  ['scripts/fixtures/weekly/tmall-funnel-section-list-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-tmall-funnel-section-list-adapter']],
  ['scripts/fixtures/weekly/tmall-leaf-adapter.behavior-fixtures.mjs', ['verify:weekly:platform-tab-tmall-leaf-adapter']],
  ['scripts/fixtures/weekly/tsx-guard-utils.behavior-fixtures.mjs', ['verify:weekly:tsx-guard-utils']],
  ['scripts/fixtures/weekly/waterfall.behavior-fixtures.mjs', ['verify:weekly:waterfall']],
]);

export const WEEKLY_BOUNDARY_BEHAVIOR_FIXTURE_GATES_BY_FILE = new Map([
  ['scripts/fixtures/weekly/boundary-gate-registry.behavior-fixtures.mjs', ['verify:weekly:boundary-gate-registry-behavior']],
]);

export const WEEKLY_GATE_METADATA_AFFECTED_RULES = Object.freeze([
  {
    files: WEEKLY_GATE_METADATA_FILES,
    gates: [
      ...CI_META_GATES,
      ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
      'verify:weekly:behavior-gate-registry',
      'verify:weekly:behavior-guard-quality',
      'verify:weekly:boundary-gate-registry',
    ],
    reason: 'weekly gate metadata change',
  },
]);

export const WEEKLY_TABS_BOUNDARY_AFFECTED_RULES = Object.freeze([
  {
    files: WEEKLY_TABS_STYLE_BOUNDARIES_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:style-boundaries'),
    reason: 'weekly tabs style boundary helper change',
  },
  {
    files: WEEKLY_TABS_CONTRACT_LAYERS_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:contract-layers'),
    reason: 'weekly tabs contract layer helper change',
  },
  {
    files: WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:contract-import-hygiene'),
    reason: 'weekly tabs contract import hygiene helper change',
  },
  {
    files: WEEKLY_TABS_CONTRACT_BOUNDARIES_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:contract-boundaries'),
    reason: 'weekly tabs contract boundary helper change',
  },
  {
    files: WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:exported-props-boundaries'),
    reason: 'weekly tabs exported props boundary helper change',
  },
  {
    files: WEEKLY_TABS_ADAPTER_LAYERS_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:adapter-layers'),
    reason: 'weekly tabs adapter layer helper change',
  },
  {
    files: WEEKLY_TABS_RENDER_BOUNDARIES_HELPER_FILES,
    gates: weeklyBoundaryScriptGates('verify:weekly:render-boundaries'),
    reason: 'weekly tabs render boundary helper change',
  },
]);

export function weeklyScriptRuleForFile(file, weekly = []) {
  const weeklyBehaviorFixtureGates = WEEKLY_BEHAVIOR_FIXTURE_GATES_BY_FILE.get(file);
  if (weeklyBehaviorFixtureGates) {
    return rule(
      [
        'lint:scripts',
        ...CI_META_GATES,
        ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
        'verify:weekly:behavior-gate-registry',
        ...weeklyBehaviorFixtureGates,
      ],
      `${file}: weekly behavior fixture change`,
    );
  }

  const weeklyBoundaryBehaviorFixtureGates = WEEKLY_BOUNDARY_BEHAVIOR_FIXTURE_GATES_BY_FILE.get(file);
  if (weeklyBoundaryBehaviorFixtureGates) {
    return rule(
      [
        'lint:scripts',
        ...CI_META_GATES,
        ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
        'verify:weekly:boundary-gate-registry',
        ...weeklyBoundaryBehaviorFixtureGates,
      ],
      `${file}: weekly boundary behavior fixture change`,
    );
  }

  if (file.startsWith('scripts/weekly-')) {
    return rule(
      [
        ...CI_META_GATES,
        ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
        'verify:weekly:behavior-gate-registry',
        'verify:weekly:behavior-guard-quality',
        ...weekly,
      ],
      `${file}: weekly helper change`,
    );
  }

  if (file.startsWith('scripts/lib/weekly/')) {
    return rule(
      [
        'lint:scripts',
        ...CI_META_GATES,
        ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
        'verify:weekly:behavior-gate-registry',
        'verify:weekly:behavior-guard-quality',
        ...weekly,
      ],
      `${file}: weekly helper change`,
    );
  }

  if (file.startsWith('scripts/fixtures/weekly/')) {
    return rule(
      [
        ...CI_META_GATES,
        ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
        'verify:weekly:behavior-gate-registry',
        'verify:weekly:behavior-guard-quality',
        ...weekly,
      ],
      `${file}: weekly fixture helper change`,
    );
  }

  return null;
}
