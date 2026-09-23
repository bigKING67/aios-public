/**
 * Single source of truth for non-weekly design behavior gates.
 *
 * Behavior guard registries and their behavior tests import this list so gate
 * metadata cannot silently drift between implementation and fixtures.
 */

export const DESIGN_BEHAVIOR_FILE_PATTERN = /^scripts\/checks\/design\/.+\.behavior\.mjs$/;

export const DESIGN_BEHAVIOR_GATES = Object.freeze([
  {
    name: 'verify:design:raw-colors-behavior',
    command: 'node scripts/checks/design/raw-colors.behavior.mjs',
    file: 'scripts/checks/design/raw-colors.behavior.mjs',
    label: '[verify:ci] design raw color audit behavior',
  },
  {
    name: 'verify:design:raw-color-source-allowlist-behavior',
    command: 'node scripts/checks/design/raw-color-source-allowlist.behavior.mjs',
    file: 'scripts/checks/design/raw-color-source-allowlist.behavior.mjs',
    label: '[verify:ci] raw color source allowlist behavior',
  },
  {
    name: 'verify:design:tailwind-behavior',
    command: 'node scripts/checks/design/tailwind-token-aliases.behavior.mjs',
    file: 'scripts/checks/design/tailwind-token-aliases.behavior.mjs',
    label: '[verify:ci] tailwind token aliases behavior',
  },
  {
    name: 'verify:design:tailwind-non-color-aliases-behavior',
    command: 'node scripts/checks/design/tailwind-non-color-token-aliases.behavior.mjs',
    file: 'scripts/checks/design/tailwind-non-color-token-aliases.behavior.mjs',
    label: '[verify:ci] tailwind non-color token aliases behavior',
  },
  {
    name: 'verify:design:tailwind-utilities-behavior',
    command: 'node scripts/checks/design/tailwind-utility-colors.behavior.mjs',
    file: 'scripts/checks/design/tailwind-utility-colors.behavior.mjs',
    label: '[verify:ci] tailwind utility colors behavior',
  },
  {
    name: 'verify:design:docs-behavior',
    command: 'node scripts/checks/design/docs-drift.behavior.mjs',
    file: 'scripts/checks/design/docs-drift.behavior.mjs',
    label: '[verify:ci] design docs drift behavior',
  },
  {
    name: 'verify:design:token-generator-behavior',
    command: 'node scripts/checks/design/token-generator.behavior.mjs',
    file: 'scripts/checks/design/token-generator.behavior.mjs',
    label: '[verify:ci] design token generator boundary behavior',
  },
  {
    name: 'verify:design:behavior-gate-registry-behavior',
    command: 'node scripts/checks/design/behavior-gate-registry.behavior.mjs',
    file: 'scripts/checks/design/behavior-gate-registry.behavior.mjs',
    label: '[verify:ci] design behavior gate registry behavior',
  },
  {
    name: 'verify:design:token-values-sync-behavior',
    command: 'node scripts/checks/design/token-values-sync.behavior.mjs',
    file: 'scripts/checks/design/token-values-sync.behavior.mjs',
    label: '[verify:ci] design token value helper sync behavior',
  },
  {
    name: 'verify:design:antd-table-selectors-behavior',
    command: 'node scripts/checks/design/antd-table-selectors.behavior.mjs',
    file: 'scripts/checks/design/antd-table-selectors.behavior.mjs',
    label: '[verify:ci] AntD table deep selector audit behavior',
  },
  {
    name: 'verify:design:antd-theme-token-sync-behavior',
    command: 'node scripts/checks/design/antd-theme-token-sync.behavior.mjs',
    file: 'scripts/checks/design/antd-theme-token-sync.behavior.mjs',
    label: '[verify:ci] AntD theme token sync behavior',
  },
  {
    name: 'verify:design:echarts-theme-token-sync-behavior',
    command: 'node scripts/checks/design/echarts-theme-token-sync.behavior.mjs',
    file: 'scripts/checks/design/echarts-theme-token-sync.behavior.mjs',
    label: '[verify:ci] ECharts theme token sync behavior',
  },
  {
    name: 'verify:design:echarts-css-token-sync-behavior',
    command: 'node scripts/checks/design/echarts-css-token-sync.behavior.mjs',
    file: 'scripts/checks/design/echarts-css-token-sync.behavior.mjs',
    label: '[verify:ci] ECharts CSS token sync behavior',
  },
  {
    name: 'verify:design:behavior-guard-quality-behavior',
    command: 'node scripts/checks/design/behavior-guard-quality.behavior.mjs',
    file: 'scripts/checks/design/behavior-guard-quality.behavior.mjs',
    label: '[verify:ci] design behavior guard quality behavior',
  },
]);

export const DESIGN_BEHAVIOR_REGISTRY_META_GATE = Object.freeze({
  name: 'verify:design:behavior-gate-registry',
  command: 'node scripts/checks/design/behavior-gate-registry.mjs',
  file: 'scripts/checks/design/behavior-gate-registry.mjs',
  label: '[verify:ci] design behavior gate registry',
});

export const DESIGN_BEHAVIOR_GUARD_QUALITY_META_GATE = Object.freeze({
  name: 'verify:design:behavior-guard-quality',
  command: 'node scripts/checks/design/behavior-guard-quality.mjs',
  file: 'scripts/checks/design/behavior-guard-quality.mjs',
  label: '[verify:ci] design behavior guard quality',
});

export const DESIGN_BEHAVIOR_EXPECTED_GATES = Object.freeze([
  ...DESIGN_BEHAVIOR_GATES,
  DESIGN_BEHAVIOR_GUARD_QUALITY_META_GATE,
  DESIGN_BEHAVIOR_REGISTRY_META_GATE,
]);
