import {
  CI_META_GATES,
} from './quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const TAILWIND_UTILITY_COLOR_HELPER_FILES = new Set([
  'scripts/lib/design/tailwind-utility-color-check.mjs',
  'scripts/lib/design/tailwind-utility-color-core.mjs',
]);

const TAILWIND_UTILITY_COLOR_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/tailwind-utility-colors-behavior-fixtures.mjs',
]);

const TAILWIND_TOKEN_ALIAS_HELPER_FILES = new Set([
  'scripts/lib/design/tailwind-token-aliases-core.mjs',
]);

const TAILWIND_TOKEN_ALIAS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/tailwind-token-aliases-behavior-fixtures.mjs',
]);

const TAILWIND_NON_COLOR_TOKEN_ALIAS_HELPER_FILES = new Set([
  'scripts/lib/design/tailwind-non-color-token-aliases-core.mjs',
]);

const TAILWIND_NON_COLOR_TOKEN_ALIAS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/tailwind-non-color-token-aliases-behavior-fixtures.mjs',
]);

const ANTD_THEME_TOKEN_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/antd-theme-token-sync-core.mjs',
]);

const ANTD_THEME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/fixtures/design/antd-theme-token-sync.behavior-fixtures.mjs',
]);

const ANTD_TABLE_SELECTOR_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/fixtures/design/antd-table-selectors.behavior-fixtures.mjs',
]);

const ECHARTS_CSS_TOKEN_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/echarts-css-token-sync-core.mjs',
]);

const ECHARTS_CSS_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/echarts-css-token-sync-behavior-fixtures.mjs',
]);

const ECHARTS_THEME_TOKEN_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/echarts-theme-token-sync-core.mjs',
]);

const ECHARTS_THEME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/echarts-theme-token-sync-behavior-fixtures.mjs',
]);

const ANTD_TABLE_SELECTOR_HELPER_FILES = new Set([
  'scripts/lib/design/antd-table-selectors-core.mjs',
]);

const DESIGN_BEHAVIOR_REGISTRY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/design-behavior-gate-registry-behavior-fixtures.mjs',
]);

const DESIGN_BEHAVIOR_GUARD_QUALITY_HELPER_FILES = new Set([
  'scripts/lib/design/design-behavior-guard-quality-core.mjs',
]);

const DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/design-behavior-guard-quality-behavior-fixtures.mjs',
]);

const RAW_COLORS_CSS_MODULES_HELPER_FILES = new Set([
  'scripts/lib/design/raw-colors-css-modules-core.mjs',
]);

const RAW_COLORS_NON_MODULES_HELPER_FILES = new Set([
  'scripts/lib/design/raw-colors-non-modules-core.mjs',
]);

const RAW_COLORS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/raw-colors-behavior-fixtures.mjs',
]);

const RAW_COLOR_SOURCE_ALLOWLIST_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/raw-color-source-allowlist-behavior-fixtures.mjs',
]);

export const DESIGN_TOKEN_PLATFORM_AFFECTED_RULES = Object.freeze([
  {
    files: TAILWIND_UTILITY_COLOR_HELPER_FILES,
    gates: ciScriptGates('verify:design:tailwind-utilities', 'verify:design:tailwind-utilities-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind utility color helper change',
  },
  {
    files: TAILWIND_UTILITY_COLOR_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:tailwind-utilities-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind utility color behavior fixture change',
  },
  {
    files: TAILWIND_TOKEN_ALIAS_HELPER_FILES,
    gates: ciScriptGates('verify:design:tailwind', 'verify:design:tailwind-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind token alias helper change',
  },
  {
    files: TAILWIND_TOKEN_ALIAS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:tailwind-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind token alias behavior fixture change',
  },
  {
    files: TAILWIND_NON_COLOR_TOKEN_ALIAS_HELPER_FILES,
    gates: ciScriptGates('verify:design:tailwind-non-color-aliases', 'verify:design:tailwind-non-color-aliases-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind non-color token alias helper change',
  },
  {
    files: TAILWIND_NON_COLOR_TOKEN_ALIAS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:tailwind-non-color-aliases-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Tailwind non-color token alias behavior fixture change',
  },
  {
    files: ANTD_THEME_TOKEN_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:antd-theme-token-sync', 'verify:design:antd-theme-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Ant Design theme token sync helper change',
  },
  {
    files: ANTD_THEME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:antd-theme-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Ant Design theme token sync behavior fixture change',
  },
  {
    files: ECHARTS_CSS_TOKEN_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:echarts-css-token-sync', 'verify:design:echarts-css-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'ECharts CSS token sync helper change',
  },
  {
    files: ECHARTS_CSS_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:echarts-css-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'ECharts CSS token sync behavior fixture change',
  },
  {
    files: ECHARTS_THEME_TOKEN_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:echarts-theme-token-sync', 'verify:design:echarts-theme-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'ECharts theme token sync helper change',
  },
  {
    files: ECHARTS_THEME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:echarts-theme-token-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'ECharts theme token sync behavior fixture change',
  },
  {
    files: ANTD_TABLE_SELECTOR_HELPER_FILES,
    gates: ciScriptGates('verify:design:antd-table-selectors', 'verify:design:antd-table-selectors-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Ant Design table selector helper change',
  },
  {
    files: ANTD_TABLE_SELECTOR_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:antd-table-selectors-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'Ant Design table selector behavior fixture change',
  },
]);

export const DESIGN_BEHAVIOR_AFFECTED_RULES = Object.freeze([
  {
    files: DESIGN_BEHAVIOR_REGISTRY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:behavior-gate-registry', 'verify:design:behavior-gate-registry-behavior'),
    reason: 'design behavior registry behavior fixture change',
  },
  {
    files: DESIGN_BEHAVIOR_GUARD_QUALITY_HELPER_FILES,
    gates: ciScriptGates('verify:design:behavior-guard-quality', 'verify:design:behavior-guard-quality-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design behavior guard quality helper change',
  },
  {
    files: DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:behavior-guard-quality-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design behavior guard quality behavior fixture change',
  },
  {
    files: RAW_COLORS_CSS_MODULES_HELPER_FILES,
    gates: ciScriptGates('verify:design:raw-colors', 'verify:design:raw-colors-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'CSS Module raw color helper change',
  },
  {
    files: RAW_COLORS_NON_MODULES_HELPER_FILES,
    gates: ciScriptGates('verify:design:raw-colors', 'verify:design:raw-colors-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'non-module raw color helper change',
  },
  {
    files: RAW_COLORS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:raw-colors', 'verify:design:raw-colors-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'raw color behavior fixture change',
  },
  {
    files: RAW_COLOR_SOURCE_ALLOWLIST_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:raw-color-source-allowlist-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'raw color source allowlist behavior fixture change',
  },
]);
