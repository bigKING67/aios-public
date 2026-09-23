function styleBoundariesInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@weeklySource',
    'scripts/checks/weekly-tabs/style-boundaries.mjs',
    'scripts/lib/weekly/weekly-tabs-style-boundaries-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function contractLayersInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts',
    'scripts/checks/weekly-tabs/contract-layers.mjs',
    'scripts/lib/weekly/weekly-tabs-contract-layers-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function contractImportHygieneInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts',
    'scripts/checks/weekly-tabs/contract-import-hygiene.mjs',
    'scripts/lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function contractBoundariesInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-adapter.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts',
    'scripts/checks/weekly-tabs/contract-boundaries.mjs',
    'scripts/lib/weekly/weekly-tabs-contract-boundaries-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function exportedPropsBoundariesInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx',
    'scripts/checks/weekly-tabs/exported-props-boundaries.mjs',
    'scripts/lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function adapterLayersInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx',
    'scripts/checks/weekly-tabs/adapter-layers.mjs',
    'scripts/lib/weekly/weekly-tabs-adapter-layers-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function renderBoundariesInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx',
    'scripts/checks/weekly-tabs/render-boundaries.mjs',
    'scripts/lib/weekly/weekly-tabs-render-boundaries-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function behaviorGuardQualityInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/weekly/behavior-guard-quality.behavior.mjs',
    'scripts/checks/weekly/behavior-guard-quality.mjs',
    'scripts/fixtures/weekly/behavior-guard-quality.behavior-fixtures.mjs',
    'scripts/lib/shared/behavior-guard-quality.mjs',
    'scripts/lib/weekly/weekly-behavior-gates.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function behaviorGateRegistryInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/weekly/behavior-gate-registry.behavior.mjs',
    'scripts/checks/weekly/behavior-gate-registry.mjs',
    'scripts/fixtures/weekly/behavior-gate-registry.behavior-fixtures.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    'scripts/lib/weekly/weekly-behavior-gates.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function boundaryGateRegistryInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/weekly-tabs/boundary-gate-registry.behavior.mjs',
    'scripts/checks/weekly-tabs/boundary-gate-registry.mjs',
    'scripts/fixtures/weekly/boundary-gate-registry.behavior-fixtures.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    'scripts/lib/weekly/weekly-boundary-gates.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function overviewTrendSectionAdapterInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-overview/trend-section-adapter.behavior.mjs',
    'scripts/fixtures/weekly/overview-trend-section-adapter.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'scripts/lib/weekly/tsx-guard-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-data.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-section-adapter.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-section-contracts.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-section.tsx',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function overviewKpiSectionAdapterInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-overview/kpi-section-adapter.behavior.mjs',
    'scripts/fixtures/weekly/overview-kpi-section-adapter.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'scripts/lib/weekly/tsx-guard-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-data.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-section-adapter.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-section-contracts.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-section.tsx',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function overviewPlatformBreakdownInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-overview/platform-breakdown.behavior.mjs',
    'scripts/fixtures/weekly/overview-platform-breakdown.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-platform-breakdown-data.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-period-delta-summary.ts',
    'apps/web-vite/src/lib/domain-taxonomy-colors.ts',
    'apps/web-vite/src/lib/platform-colors.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function overviewTrendInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-overview/trend.behavior.mjs',
    'scripts/fixtures/weekly/overview-trend.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-data.ts',
    'apps/web-vite/src/lib/chart-utils.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function overviewByWeekTrendInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-overview/by-week-trend.behavior.mjs',
    'scripts/fixtures/weekly/overview-by-week-trend.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-by-week-trend-data.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/overview-period-utils.ts',
    'apps/web-vite/src/lib/unknown-data.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function platformTabContentRoutingInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-platform-tab/content-routing.behavior.mjs',
    'scripts/fixtures/weekly/platform-tab-content-routing.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-content-props.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-content-routing.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-kpi-section-adapter.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-kpi-section-contracts.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/weekly-kpi-trend-data.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function platformTabKpiSectionAdapterInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly-platform-tab/kpi-section-adapter.behavior.mjs',
    'scripts/fixtures/weekly/platform-tab-kpi-section-adapter.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'scripts/lib/weekly/tsx-guard-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-kpi-section.tsx',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-kpi-section-adapter.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-kpi-section-contracts.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-metrics.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/weekly-kpi-trend-data.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function primaryMetricsInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/weekly/primary-metrics.behavior.mjs',
    'scripts/fixtures/weekly/primary-metrics.behavior-fixtures.mjs',
    'scripts/lib/weekly/behavior-assert-utils.mjs',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-formatters.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-metrics.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-metric-types.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-primary-base-metrics.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-primary-metric-types.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-primary-metrics.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-primary-roi-metric.ts',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-view-model-primary-metrics.ts',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

const WEEKLY_INPUT_BUILDERS = Object.freeze({
  'verify:weekly:style-boundaries': styleBoundariesInputs,
  'verify:weekly:contract-layers': contractLayersInputs,
  'verify:weekly:contract-import-hygiene': contractImportHygieneInputs,
  'verify:weekly:contract-boundaries': contractBoundariesInputs,
  'verify:weekly:exported-props-boundaries': exportedPropsBoundariesInputs,
  'verify:weekly:adapter-layers': adapterLayersInputs,
  'verify:weekly:render-boundaries': renderBoundariesInputs,
  'verify:weekly:behavior-guard-quality-behavior': behaviorGuardQualityInputs,
  'verify:weekly:behavior-gate-registry-behavior': behaviorGateRegistryInputs,
  'verify:weekly:boundary-gate-registry-behavior': boundaryGateRegistryInputs,
  'verify:weekly:overview-trend-section-adapter': overviewTrendSectionAdapterInputs,
  'verify:weekly:overview-kpi-section-adapter': overviewKpiSectionAdapterInputs,
  'verify:weekly:overview-platform-breakdown': overviewPlatformBreakdownInputs,
  'verify:weekly:overview-trend': overviewTrendInputs,
  'verify:weekly:overview-by-week-trend': overviewByWeekTrendInputs,
  'verify:weekly:platform-tab-content-routing': platformTabContentRoutingInputs,
  'verify:weekly:platform-tab-kpi-section-adapter': platformTabKpiSectionAdapterInputs,
  'verify:weekly:primary-metrics': primaryMetricsInputs,
});

export function weeklyGateInputPatterns(name, context) {
  const builder = WEEKLY_INPUT_BUILDERS[name];
  return builder ? builder(name, context) : null;
}
