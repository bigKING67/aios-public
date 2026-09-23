import {
  pairedBehaviorTargetFiles,
} from '../quality-gate-command-targets.mjs';

function designMirrorInputs(_name, { scriptInputs, shared }) {
  return [
    'DESIGN_TOKENS.json',
    'apps/web-vite/src/lib/design-tokens.ts',
    'scripts/lib/design/design-token-mirror-sync-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function designTokensInputs(_name, { scriptInputs, shared }) {
  return [
    'DESIGN_TOKENS.json',
    'apps/web-vite/src/lib/design-tokens.ts',
    'apps/web-vite/src/styles/design-tokens.css',
    'apps/web-vite/src/lib/platform-colors.ts',
    'apps/web-vite/src/lib/domain-taxonomy-colors.ts',
    'scripts/config/design/token-color-sync.config.json',
    'scripts/lib/frontend/frontend-design-token-color-sync-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function runtimeTokensInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['DESIGN_TOKENS.json', 'apps/web-vite/src/styles/design-tokens.css']),
    'scripts/lib/design/design-runtime-token-sync-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/design-runtime-token-sync-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function tokenValuesSyncInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : [
      'DESIGN_TOKENS.json',
      'apps/web-vite/src/lib/design-token-values.ts',
      'apps/web-vite/src/lib/design-tokens.ts',
      'scripts/build/compile-tokens.js',
    ]),
    'scripts/lib/design/design-token-values-sync-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/design-token-values-sync-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function typographyInputs(_name, { allowlistConfigInputs, checkGuardHelperInputs, shared }) {
  return [
    ...allowlistConfigInputs,
    'apps/web-vite/src/**/*.module.css',
    'scripts/checks/design/css-module-font-family-tokens.mjs',
    'scripts/checks/design/css-module-typography-values.mjs',
    'scripts/lib/design/css-module-typography-values-core.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function rawColorsInputs(name, { allowlistConfigInputs, checkGuardHelperInputs, shared }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior') ? [] : ['@frontendSource', '@designAuthority']),
    'scripts/lib/design/raw-colors-css-modules-core.mjs',
    'scripts/lib/design/raw-colors-non-modules-core.mjs',
    'scripts/checks/design/raw-colors-css-modules.mjs',
    'scripts/checks/design/raw-colors-non-modules.mjs',
    'scripts/checks/design/raw-color-allowlist-docs.mjs',
    'scripts/checks/design/echarts-css-fallback-colors.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/design/raw-colors.behavior.mjs',
        'scripts/lib/design/raw-colors-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function rawColorSourceAllowlistInputs(_name, { allowlistConfigInputs, checkGuardHelperInputs, shared }) {
  return [
    ...allowlistConfigInputs,
    'scripts/checks/design/raw-color-source-allowlist.behavior.mjs',
    'scripts/lib/design/raw-color-source-allowlist.mjs',
    'scripts/lib/design/raw-color-source-allowlist-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function tailwindInputs(name, { allowlistConfigInputs, scriptInputs, shared, targetFiles }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior') ? [] : ['@designAuthority', 'tailwind.config.*']),
    'scripts/lib/design/tailwind-token-aliases-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/tailwind-token-aliases-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function tailwindNonColorAliasesInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['@designAuthority', 'tailwind.config.*']),
    'scripts/lib/design/tailwind-non-color-token-aliases-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/tailwind-non-color-token-aliases-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function tailwindUtilitiesInputs(name, { allowlistConfigInputs, scriptInputs, shared, targetFiles }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior') ? [] : ['@frontendSource', '@designAuthority']),
    'scripts/lib/design/tailwind-utility-color-check.mjs',
    'scripts/lib/design/tailwind-utility-color-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/tailwind-utility-colors-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function antdThemeTokenSyncInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : [
      'DESIGN_TOKENS.json',
      'apps/web-vite/src/theme/ant-theme.ts',
      'apps/web-vite/src/ViteProviders.tsx',
    ]),
    'scripts/lib/design/antd-theme-token-sync-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/fixtures/design/antd-theme-token-sync.behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function echartsCssTokenSyncInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : [
      'DESIGN_TOKENS.json',
      'scripts/config/design/token-color-sync.config.json',
      'apps/web-vite/src/lib/platform-colors.ts',
      'apps/web-vite/src/lib/domain-taxonomy-colors.ts',
      'apps/web-vite/src/styles/echarts.css',
    ]),
    'scripts/lib/design/echarts-css-token-sync-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/echarts-css-token-sync-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function echartsThemeTokenSyncInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : [
      'apps/web-vite/src/styles/echarts-theme.ts',
      'apps/web-vite/src/theme/echarts-theme.ts',
    ]),
    'scripts/lib/design/echarts-theme-token-sync-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/design/echarts-theme-token-sync-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function antdTableSelectorsInputs(name, { allowlistConfigInputs, scriptInputs, shared, targetFiles }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/**/*.css']),
    'scripts/lib/design/antd-table-selectors-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/fixtures/design/antd-table-selectors.behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function behaviorGateRegistryInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/design/behavior-gate-registry.behavior.mjs',
    'scripts/checks/design/behavior-gate-registry.mjs',
    'scripts/lib/design/design-behavior-gate-registry-behavior-fixtures.mjs',
    'scripts/lib/design/design-behavior-gates.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function behaviorGuardQualityInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/design/behavior-guard-quality.mjs',
    'scripts/lib/design/design-behavior-guard-quality-core.mjs',
    'scripts/lib/design/design-behavior-gates.mjs',
    'scripts/lib/shared/behavior-guard-quality.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/design/behavior-guard-quality.behavior.mjs',
        'scripts/lib/design/design-behavior-guard-quality-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function docsDriftInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    '@docsQuality',
    ...(name === 'verify:design:docs' || name === 'verify:design:docs-behavior'
      ? ['scripts/lib/design/design-docs-drift-core.mjs']
      : []),
    ...(name === 'verify:design:docs-behavior'
      ? ['scripts/lib/design/design-docs-drift-behavior-fixtures.mjs']
      : []),
    'scripts/lib/frontend/frontend-quality-docs-drift-core.mjs',
    'scripts/lib/frontend/frontend-coverage-ratchet-core.mjs',
    ...(name === 'verify:frontend:quality-docs-drift-behavior'
      ? ['scripts/lib/frontend/frontend-quality-docs-drift-behavior-fixtures.mjs']
      : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

const DESIGN_INPUT_BUILDERS = Object.freeze({
  'verify:design:mirror': designMirrorInputs,
  'verify:design:tokens': designTokensInputs,
  'verify:design:runtime-tokens': runtimeTokensInputs,
  'verify:design:runtime-tokens-behavior': runtimeTokensInputs,
  'verify:design:token-values-sync': tokenValuesSyncInputs,
  'verify:design:token-values-sync-behavior': tokenValuesSyncInputs,
  'verify:design:typography': typographyInputs,
  'verify:design:raw-colors': rawColorsInputs,
  'verify:design:raw-colors-behavior': rawColorsInputs,
  'verify:design:raw-color-source-allowlist-behavior': rawColorSourceAllowlistInputs,
  'verify:design:tailwind': tailwindInputs,
  'verify:design:tailwind-behavior': tailwindInputs,
  'verify:design:tailwind-non-color-aliases': tailwindNonColorAliasesInputs,
  'verify:design:tailwind-non-color-aliases-behavior': tailwindNonColorAliasesInputs,
  'verify:design:tailwind-utilities': tailwindUtilitiesInputs,
  'verify:design:tailwind-utilities-behavior': tailwindUtilitiesInputs,
  'verify:design:antd-theme-token-sync': antdThemeTokenSyncInputs,
  'verify:design:antd-theme-token-sync-behavior': antdThemeTokenSyncInputs,
  'verify:design:echarts-css-token-sync': echartsCssTokenSyncInputs,
  'verify:design:echarts-css-token-sync-behavior': echartsCssTokenSyncInputs,
  'verify:design:echarts-theme-token-sync': echartsThemeTokenSyncInputs,
  'verify:design:echarts-theme-token-sync-behavior': echartsThemeTokenSyncInputs,
  'verify:design:antd-table-selectors': antdTableSelectorsInputs,
  'verify:design:antd-table-selectors-behavior': antdTableSelectorsInputs,
  'verify:design:behavior-gate-registry-behavior': behaviorGateRegistryInputs,
  'verify:design:behavior-guard-quality': behaviorGuardQualityInputs,
  'verify:design:behavior-guard-quality-behavior': behaviorGuardQualityInputs,
  'verify:design:docs': docsDriftInputs,
  'verify:design:docs-behavior': docsDriftInputs,
  'verify:frontend:quality-docs-drift': docsDriftInputs,
  'verify:frontend:quality-docs-drift-behavior': docsDriftInputs,
});

export function designGateInputPatterns(name, context) {
  const builder = DESIGN_INPUT_BUILDERS[name];
  return builder ? builder(name, context) : null;
}
