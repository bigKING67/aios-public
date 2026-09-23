export const FRONTEND_CHECK_GATE_BY_FILE = Object.freeze({
  'scripts/checks/frontend/build-fingerprint.behavior.mjs': 'verify:frontend:build-fingerprint-behavior',
  'scripts/checks/frontend/bundle-budget.behavior.mjs': 'verify:frontend:bundle-budget-behavior',
  'scripts/checks/frontend/bundle-budget.mjs': 'verify:frontend:bundle-budget',
  'scripts/checks/frontend/coverage-ratchet.behavior.mjs': 'verify:frontend:coverage-ratchet-behavior',
  'scripts/checks/frontend/coverage-ratchet.mjs': 'verify:frontend:coverage-ratchet',
  'scripts/checks/frontend/delivery-registry.behavior.mjs': 'verify:frontend:delivery-gate-registry-behavior',
  'scripts/checks/frontend/delivery-registry.mjs': 'verify:frontend:delivery-gate-registry',
  'scripts/checks/frontend/design-evolution.behavior.mjs': 'verify:frontend:design-evolution-behavior',
  'scripts/checks/frontend/design-evolution.mjs': 'verify:frontend:design-evolution',
  'scripts/checks/frontend/design-runtime-token-sync.behavior.mjs': 'verify:design:runtime-tokens-behavior',
  'scripts/checks/frontend/design-runtime-token-sync.mjs': 'verify:design:runtime-tokens',
  'scripts/checks/frontend/design-token-color-sync.mjs': 'verify:design:tokens',
  'scripts/checks/frontend/design-token-mirror-sync.mjs': 'verify:design:mirror',
  'scripts/checks/frontend/prod-css-integrity.behavior.mjs': 'verify:frontend:prod-css-integrity-behavior',
  'scripts/checks/frontend/prod-css-integrity.mjs': 'verify:frontend:prod-css-integrity',
  'scripts/checks/frontend/preview-contract.behavior.mjs': 'verify:frontend:preview-contract-behavior',
  'scripts/checks/frontend/preview-contract.mjs': 'verify:frontend:preview-contract',
  'scripts/checks/frontend/quality-docs-drift.behavior.mjs': 'verify:frontend:quality-docs-drift-behavior',
  'scripts/checks/frontend/quality-docs-drift.mjs': 'verify:frontend:quality-docs-drift',
  'scripts/checks/frontend/smoke.behavior.mjs': 'verify:frontend:smoke-behavior',
});

export const FRONTEND_CHECK_GATES_BY_HELPER_FILE = Object.freeze({
  'scripts/lib/frontend/frontend-build-fingerprint.mjs': [
    'verify:frontend:build-fingerprint-behavior',
    'verify:frontend:bundle-budget-behavior',
    'verify:frontend:bundle-budget',
    'verify:frontend:preview-contract-behavior',
    'verify:frontend:preview-contract',
  ],
});

export const DESIGN_CHECK_GATE_BY_FILE = Object.freeze({
  'scripts/checks/design/antd-table-selectors.behavior.mjs': 'verify:design:antd-table-selectors-behavior',
  'scripts/checks/design/antd-table-selectors.mjs': 'verify:design:antd-table-selectors',
  'scripts/checks/design/antd-theme-token-sync.behavior.mjs': 'verify:design:antd-theme-token-sync-behavior',
  'scripts/checks/design/antd-theme-token-sync.mjs': 'verify:design:antd-theme-token-sync',
  'scripts/checks/design/echarts-css-fallback-colors.mjs': 'verify:design:raw-colors',
  'scripts/checks/design/echarts-css-token-sync.behavior.mjs': 'verify:design:echarts-css-token-sync-behavior',
  'scripts/checks/design/echarts-css-token-sync.mjs': 'verify:design:echarts-css-token-sync',
  'scripts/checks/design/echarts-theme-token-sync.behavior.mjs': 'verify:design:echarts-theme-token-sync-behavior',
  'scripts/checks/design/echarts-theme-token-sync.mjs': 'verify:design:echarts-theme-token-sync',
  'scripts/checks/design/legacy-color-token-consumption.mjs': 'verify:design:legacy-colors',
  'scripts/checks/design/raw-color-allowlist-docs.mjs': 'verify:design:raw-colors',
  'scripts/checks/design/raw-color-source-allowlist.behavior.mjs': 'verify:design:raw-color-source-allowlist-behavior',
  'scripts/checks/design/raw-colors-css-modules.mjs': 'verify:design:raw-colors',
  'scripts/checks/design/raw-colors-non-modules.mjs': 'verify:design:raw-colors',
  'scripts/checks/design/raw-colors.behavior.mjs': 'verify:design:raw-colors-behavior',
  'scripts/checks/design/tailwind-non-color-token-aliases.behavior.mjs': 'verify:design:tailwind-non-color-aliases-behavior',
  'scripts/checks/design/tailwind-non-color-token-aliases.mjs': 'verify:design:tailwind-non-color-aliases',
  'scripts/checks/design/tailwind-token-aliases.behavior.mjs': 'verify:design:tailwind-behavior',
  'scripts/checks/design/tailwind-token-aliases.mjs': 'verify:design:tailwind',
  'scripts/checks/design/tailwind-utility-colors.behavior.mjs': 'verify:design:tailwind-utilities-behavior',
  'scripts/checks/design/tailwind-utility-colors.mjs': 'verify:design:tailwind-utilities',
  'scripts/checks/design/token-generator.behavior.mjs': 'verify:design:token-generator-behavior',
  'scripts/checks/design/token-generator.mjs': 'verify:design:token-generator',
  'scripts/checks/design/token-values-sync.behavior.mjs': 'verify:design:token-values-sync-behavior',
  'scripts/checks/design/token-values-sync.mjs': 'verify:design:token-values-sync',
});

export const FRONTEND_CORE_SOURCE_GATES = Object.freeze([
  'lint',
  'type-check',
  'build',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:bundle-budget',
  'verify:frontend:preview-contract',
]);

export const FRONTEND_EXECUTION_COVERAGE_GATES = Object.freeze([
  'verify:frontend:coverage-ratchet',
]);

export const FRONTEND_PUBLIC_ASSET_GATES = Object.freeze([
  'build',
  'verify:frontend:bundle-budget',
  'verify:frontend:preview-contract',
]);

export const FRONTEND_BUILD_ENV_FILE_GATES = Object.freeze([
  'build',
  'verify:frontend:bundle-budget',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:preview-contract',
]);

export const FRONTEND_BUILD_CONFIG_GATES = Object.freeze([
  'build',
  'verify:frontend:bundle-budget',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:preview-contract',
]);

export const FRONTEND_TYPED_BUILD_CONFIG_GATES = Object.freeze([
  'type-check',
  ...FRONTEND_BUILD_CONFIG_GATES,
]);

export const FRONTEND_BUNDLE_BUDGET_CONFIG_GATES = Object.freeze([
  'build',
  'verify:frontend:bundle-budget',
  'verify:frontend:quality-docs-drift',
]);

export const FRONTEND_COVERAGE_RATCHET_CONFIG_GATES = Object.freeze([
  'lint:scripts',
  'verify:frontend:coverage-ratchet-behavior',
  'verify:frontend:coverage-ratchet',
  'verify:frontend:quality-docs-drift',
  'verify:frontend:delivery-gate-registry',
]);

export const FRONTEND_SMOKE_CONFIG_GATES = Object.freeze([
  'verify:frontend:smoke-behavior',
  'verify:frontend:quality-docs-drift',
]);

export const FRONTEND_SMOKE_SCRIPT_GATES = Object.freeze([
  'lint:scripts',
  'verify:frontend:smoke-behavior',
  'verify:frontend:delivery-gate-registry',
]);

export const SPECIAL_REPORT_SMOKE_GATES = Object.freeze([
  'verify:reports:special-smoke',
]);

export const CREATOR_SHORT_VIDEO_DASHBOARD_GATES = Object.freeze([
  'verify:dashboard:creator-short-video-behavior',
]);

export const DASHBOARD_DATE_RANGE_GATES = Object.freeze([
  'verify:dashboard:date-range-bounds-behavior',
]);

export const FRONTEND_REGISTRY_GATES = Object.freeze([
  'verify:frontend:structure-gate-registry',
  'verify:frontend:delivery-gate-registry',
]);

export const REPORT_API_SOURCE_GATES = Object.freeze([
  'verify:frontend:report-api-contract-behavior',
  'verify:frontend:report-api-contract',
]);

export const CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GATES = Object.freeze([
  'verify:frontend:creator-library-follow-log-contract',
]);

export const CREATOR_LIBRARY_CSV_CONTRACT_GATES = Object.freeze([
  'verify:frontend:creator-library-csv-contract',
]);

export const FRONTEND_HYGIENE_GATES = Object.freeze([
  'verify:frontend:retired-leftovers',
  'verify:frontend:stale-phase-comments',
  'verify:frontend:unowned-debt-comments',
  'verify:frontend:design-evolution',
]);

export const APP_SOURCE_GATES = Object.freeze([
  'verify:app:boundaries',
  'verify:app:page-size',
  'verify:app:inline-styles',
  'verify:frontend:app-route-paths-behavior',
  'verify:frontend:vite-route-paths-behavior',
  'verify:frontend:vite-routes',
]);

export const ROUTE_POLICY_SOURCE_GATES = Object.freeze([
  'verify:frontend:navigation-routes',
  'verify:frontend:route-policy-registry-structure',
  'verify:frontend:route-access',
  'verify:frontend:protected-navigation',
]);

export const AUTH_POLICY_SOURCE_GATES = Object.freeze([
  'verify:frontend:auth-navigation-policy',
  'verify:frontend:auth-session-recovery-behavior',
  'verify:frontend:permission-policy',
  'verify:frontend:protected-navigation',
]);

export const COMPONENT_SOURCE_GATES = Object.freeze([
  'verify:components:api',
  'verify:components:boundaries',
  'verify:components:inline-styles',
  'verify:components:size',
]);

export const CSS_MODULE_SOURCE_GATES = Object.freeze([
  'verify:css-modules:size',
  'verify:frontend:prod-css-integrity',
  'verify:design:raw-colors',
  'verify:design:typography',
]);

export const STYLE_SOURCE_GATES = Object.freeze([
  'verify:frontend:prod-css-integrity',
  'verify:design:raw-colors',
  'verify:design:typography',
  'verify:design:legacy-colors',
]);

export const THEME_TOKEN_SOURCE_GATES = Object.freeze([
  'verify:design:mirror',
  'verify:design:tokens',
  'verify:design:runtime-tokens',
  'verify:design:token-values-sync',
  'verify:design:antd-theme-token-sync',
  'verify:design:echarts-theme-token-sync',
  'verify:design:echarts-css-token-sync',
]);

export const DESIGN_AUTHORITY_TOKEN_GATES = Object.freeze([
  'verify:design:mirror',
  'verify:design:tokens',
  'verify:design:runtime-tokens',
  'verify:design:token-values-sync',
  'verify:design:tailwind',
  'verify:design:tailwind-non-color-aliases',
  'verify:design:antd-theme-token-sync',
  'verify:design:echarts-theme-token-sync',
  'verify:design:echarts-css-token-sync',
  'verify:frontend:design-evolution',
  'verify:frontend:delivery-gate-registry',
]);

export const TAILWIND_CONFIG_GATES = Object.freeze([
  'lint',
  'type-check',
  'build',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:bundle-budget',
  'verify:frontend:preview-contract',
  'verify:design:tailwind',
  'verify:design:tailwind-non-color-aliases',
  'verify:design:tailwind-utilities',
]);

export const DESIGN_TOKEN_CONFIG_GATES = Object.freeze([
  'verify:design:tokens',
  'verify:design:token-values-sync',
  'verify:design:runtime-tokens',
  'verify:design:echarts-css-token-sync',
  'verify:design:behavior-gate-registry',
  'verify:frontend:delivery-gate-registry',
]);
