import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertFrontendBuildAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const frontendCheck = selectAffectedGates(registry, ['scripts/checks/frontend/bundle-budget.mjs']);
  assertTrue(frontendCheck.names.includes('verify:frontend:bundle-budget'), 'frontend check command should select its paired gate');
  assertTrue(frontendCheck.names.includes('verify:frontend:delivery-gate-registry'), 'frontend check command should select delivery registry guard');
  assertTrue(frontendCheck.names.includes('verify:quality-runner:registry'), 'frontend check command should select quality runner layout guard slice');

  const coverageCheck = selectAffectedGates(registry, ['scripts/checks/frontend/coverage-ratchet.mjs']);
  assertTrue(coverageCheck.names.includes('verify:frontend:coverage-ratchet'), 'coverage check command should select its paired gate');
  assertTrue(coverageCheck.names.includes('verify:frontend:delivery-gate-registry'), 'coverage check command should select delivery registry guard');

  const coverageHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-coverage-ratchet-core.mjs']);
  assertTrue(coverageHelper.names.includes('verify:frontend:coverage-ratchet'), 'coverage helper should select the production ratchet gate');
  assertTrue(coverageHelper.names.includes('verify:frontend:coverage-ratchet-behavior'), 'coverage helper should select behavior coverage');
  assertTrue(coverageHelper.names.includes('verify:frontend:delivery-gate-registry'), 'coverage helper should keep delivery registry coverage');
  assertFalse(coverageHelper.names.includes('verify:backend:check'), 'coverage helper should not use backend safe fallback');

  const coverageBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-coverage-ratchet-behavior-fixtures.mjs']);
  assertTrue(coverageBehaviorFixture.names.includes('lint:scripts'), 'coverage behavior fixture should keep script lint coverage');
  assertTrue(coverageBehaviorFixture.names.includes('verify:frontend:coverage-ratchet-behavior'), 'coverage behavior fixture should select behavior coverage');
  assertTrue(coverageBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'coverage behavior fixture should keep delivery registry coverage');

  const bundleBudgetHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-bundle-budget-core.mjs']);
  assertTrue(bundleBudgetHelper.names.includes('verify:frontend:bundle-budget'), 'bundle budget helper should select production bundle budget gate');
  assertTrue(bundleBudgetHelper.names.includes('verify:frontend:bundle-budget-behavior'), 'bundle budget helper should select behavior coverage');
  assertTrue(bundleBudgetHelper.names.includes('verify:frontend:delivery-gate-registry'), 'bundle budget helper should keep delivery registry coverage');
  assertFalse(bundleBudgetHelper.names.includes('verify:backend:check'), 'bundle budget helper should not use backend safe fallback');

  const bundleBudgetBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-bundle-budget-behavior-fixtures.mjs']);
  assertTrue(bundleBudgetBehaviorFixture.names.includes('lint:scripts'), 'bundle budget behavior fixture should keep script lint coverage');
  assertTrue(bundleBudgetBehaviorFixture.names.includes('verify:frontend:bundle-budget'), 'bundle budget behavior fixture should keep production bundle budget coverage');
  assertTrue(bundleBudgetBehaviorFixture.names.includes('verify:frontend:bundle-budget-behavior'), 'bundle budget behavior fixture should select behavior coverage');
  assertTrue(bundleBudgetBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'bundle budget behavior fixture should keep delivery registry coverage');
  assertFalse(bundleBudgetBehaviorFixture.names.includes('verify:backend:check'), 'bundle budget behavior fixture should not use backend safe fallback');

  const buildFingerprintBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-build-fingerprint-behavior-fixtures.mjs']);
  assertTrue(buildFingerprintBehaviorFixture.names.includes('lint:scripts'), 'build fingerprint behavior fixture should keep script lint coverage');
  assertTrue(buildFingerprintBehaviorFixture.names.includes('verify:frontend:build-fingerprint-behavior'), 'build fingerprint behavior fixture should select behavior coverage');
  assertTrue(buildFingerprintBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'build fingerprint behavior fixture should keep delivery registry coverage');
  assertFalse(buildFingerprintBehaviorFixture.names.includes('verify:backend:check'), 'build fingerprint behavior fixture should not use backend safe fallback');

  const prodCssIntegrityCheck = selectAffectedGates(registry, ['scripts/checks/frontend/prod-css-integrity.mjs']);
  assertTrue(prodCssIntegrityCheck.names.includes('verify:frontend:prod-css-integrity'), 'production CSS integrity check command should select its paired gate');
  assertTrue(prodCssIntegrityCheck.names.includes('verify:frontend:delivery-gate-registry'), 'production CSS integrity check command should select delivery registry guard');
  assertTrue(prodCssIntegrityCheck.names.includes('verify:quality-runner:registry'), 'production CSS integrity check command should select quality runner layout guard slice');

  const prodCssIntegrityHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-prod-css-integrity-core.mjs']);
  assertTrue(prodCssIntegrityHelper.names.includes('verify:frontend:prod-css-integrity'), 'production CSS integrity helper should select production integrity gate');
  assertTrue(prodCssIntegrityHelper.names.includes('verify:frontend:prod-css-integrity-behavior'), 'production CSS integrity helper should select behavior coverage');
  assertTrue(prodCssIntegrityHelper.names.includes('verify:frontend:delivery-gate-registry'), 'production CSS integrity helper should keep delivery registry coverage');
  assertFalse(prodCssIntegrityHelper.names.includes('verify:backend:check'), 'production CSS integrity helper should not use backend safe fallback');
  assertFalse(prodCssIntegrityHelper.names.includes('type-check'), 'production CSS integrity helper should not pay TypeScript coverage');
  assertFalse(prodCssIntegrityHelper.names.includes('verify:frontend:structure-gate-registry'), 'production CSS integrity helper should not fan out to frontend structure registry');

  const previewContractCheck = selectAffectedGates(registry, ['scripts/checks/frontend/preview-contract.mjs']);
  assertTrue(previewContractCheck.names.includes('verify:frontend:preview-contract'), 'preview contract check command should select its paired gate');
  assertTrue(previewContractCheck.names.includes('verify:frontend:delivery-gate-registry'), 'preview contract check command should select delivery registry guard');
  assertTrue(previewContractCheck.names.includes('verify:quality-runner:registry'), 'preview contract check command should select quality runner layout guard slice');

  const previewContractHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-preview-contract-core.mjs']);
  assertTrue(previewContractHelper.names.includes('verify:frontend:preview-contract'), 'preview contract helper should select production preview contract gate');
  assertTrue(previewContractHelper.names.includes('verify:frontend:preview-contract-behavior'), 'preview contract helper should select behavior coverage');
  assertTrue(previewContractHelper.names.includes('verify:frontend:delivery-gate-registry'), 'preview contract helper should keep delivery registry coverage');
  assertFalse(previewContractHelper.names.includes('verify:backend:check'), 'preview contract helper should not use backend safe fallback');

  const previewContractBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-preview-contract-behavior-fixtures.mjs']);
  assertTrue(previewContractBehaviorFixture.names.includes('lint:scripts'), 'preview contract behavior fixture should keep script lint coverage');
  assertTrue(previewContractBehaviorFixture.names.includes('verify:frontend:preview-contract'), 'preview contract behavior fixture should keep production preview contract coverage');
  assertTrue(previewContractBehaviorFixture.names.includes('verify:frontend:preview-contract-behavior'), 'preview contract behavior fixture should select behavior coverage');
  assertTrue(previewContractBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'preview contract behavior fixture should keep delivery registry coverage');
  assertFalse(previewContractBehaviorFixture.names.includes('verify:backend:check'), 'preview contract behavior fixture should not use backend safe fallback');

  const tailwindConfig = selectAffectedGates(registry, ['tailwind.config.ts']);
  assertTrue(tailwindConfig.names.includes('verify:design:tailwind'), 'Tailwind config should select Tailwind token gate');
  assertTrue(tailwindConfig.names.includes('verify:design:tailwind-utilities'), 'Tailwind config should select Tailwind utility color gate');
  assertTrue(tailwindConfig.names.includes('build'), 'Tailwind config should select build because runtime CSS can change');
  assertFalse(tailwindConfig.names.includes('verify:backend:check'), 'Tailwind config should not use backend safe fallback');

  const publicAsset = selectAffectedGates(registry, ['public/home-brand-crop.png']);
  assertTrue(publicAsset.names.includes('build'), 'public assets should select build because Vite copies them into dist');
  assertTrue(publicAsset.names.includes('verify:frontend:bundle-budget'), 'public assets should verify the current build manifest through bundle budget');
  assertTrue(publicAsset.names.includes('verify:frontend:preview-contract'), 'public assets should verify the production preview shell contract');
  assertFalse(publicAsset.names.includes('verify:backend:check'), 'public assets should not fall back to backend safe checks');
  assertFalse(publicAsset.names.includes('type-check'), 'public assets should not pay TypeScript coverage when no source changed');

  const frontendBuildEnvFile = selectAffectedGates(registry, ['.env.production']);
  assertTrue(frontendBuildEnvFile.names.includes('build'), 'frontend build env files should select build because Vite output can change');
  assertTrue(
    frontendBuildEnvFile.names.includes('verify:frontend:bundle-budget'),
    'frontend build env files should verify the current build manifest through bundle budget',
  );
  assertTrue(
    frontendBuildEnvFile.names.includes('verify:frontend:prod-css-integrity'),
    'frontend build env files should protect production CSS output checks',
  );
  assertTrue(
    frontendBuildEnvFile.names.includes('verify:frontend:preview-contract'),
    'frontend build env files should protect production preview contract checks',
  );
  assertFalse(frontendBuildEnvFile.names.includes('verify:backend:check'), 'frontend build env files should not fall back to backend safe checks');
  assertFalse(frontendBuildEnvFile.names.includes('type-check'), 'frontend build env files should not pay TypeScript coverage when no source changed');

  const postcssConfig = selectAffectedGates(registry, ['postcss.config.js']);
  assertTrue(postcssConfig.names.includes('build'), 'PostCSS config should select build because emitted CSS can change');
  assertTrue(
    postcssConfig.names.includes('verify:frontend:bundle-budget'),
    'PostCSS config should verify bundle budget because CSS output size can change',
  );
  assertTrue(
    postcssConfig.names.includes('verify:frontend:prod-css-integrity'),
    'PostCSS config should protect production CSS integrity',
  );
  assertTrue(
    postcssConfig.names.includes('verify:frontend:preview-contract'),
    'PostCSS config should protect production preview contract checks',
  );
  assertFalse(postcssConfig.names.includes('verify:backend:check'), 'PostCSS config should not fall back to backend safe checks');
  assertFalse(postcssConfig.names.includes('type-check'), 'PostCSS config should not pay TypeScript coverage when no source changed');

  const viteConfig = selectAffectedGates(registry, ['apps/web-vite/vite.config.ts']);
  assertTrue(viteConfig.names.includes('type-check'), 'Vite TS config should keep TypeScript config validity coverage');
  assertTrue(viteConfig.names.includes('build'), 'Vite config should select build because production output can change');
  assertTrue(
    viteConfig.names.includes('verify:frontend:bundle-budget'),
    'Vite config should verify bundle budget because chunking/output can change',
  );
  assertTrue(
    viteConfig.names.includes('verify:frontend:prod-css-integrity'),
    'Vite config should protect production CSS integrity',
  );
  assertTrue(
    viteConfig.names.includes('verify:frontend:preview-contract'),
    'Vite config should protect production preview contract checks',
  );
  assertFalse(viteConfig.names.includes('verify:backend:check'), 'Vite config should not fall back to backend safe checks');
  assertFalse(viteConfig.names.includes('lint'), 'Vite config should not fan out to broad frontend source lint');
  assertFalse(
    viteConfig.names.includes('verify:frontend:structure-gate-registry'),
    'Vite config should not fan out to frontend source registry gates',
  );

  const viteHtmlEntry = selectAffectedGates(registry, ['apps/web-vite/index.html']);
  assertTrue(viteHtmlEntry.names.includes('build'), 'Vite HTML entry should select build because the app shell can change');
  assertTrue(
    viteHtmlEntry.names.includes('verify:frontend:bundle-budget'),
    'Vite HTML entry should verify the current build manifest through bundle budget',
  );
  assertTrue(
    viteHtmlEntry.names.includes('verify:frontend:prod-css-integrity'),
    'Vite HTML entry should protect production CSS output checks',
  );
  assertTrue(
    viteHtmlEntry.names.includes('verify:frontend:preview-contract'),
    'Vite HTML entry should protect production preview contract checks',
  );
  assertFalse(viteHtmlEntry.names.includes('type-check'), 'Vite HTML entry should not pay TypeScript coverage when no source changed');
  assertFalse(
    viteHtmlEntry.names.includes('verify:frontend:structure-gate-registry'),
    'Vite HTML entry should not fan out to frontend source registry gates',
  );

  const bundleBudgetConfig = selectAffectedGates(registry, ['scripts/config/frontend/bundle-budget.json']);
  assertTrue(bundleBudgetConfig.names.includes('build'), 'bundle budget config should select build before budget verification');
  assertTrue(
    bundleBudgetConfig.names.includes('verify:frontend:bundle-budget'),
    'bundle budget config should select the budget gate it configures',
  );
  assertTrue(
    bundleBudgetConfig.names.includes('verify:frontend:quality-docs-drift'),
    'bundle budget config should select docs drift guard because budget values are documented',
  );
  assertFalse(bundleBudgetConfig.names.includes('verify:backend:check'), 'bundle budget config should not use backend safe fallback');
  assertFalse(bundleBudgetConfig.names.includes('type-check'), 'bundle budget config should not pay TypeScript coverage when no source changed');

  const coverageConfig = selectAffectedGates(registry, ['scripts/config/frontend/coverage-ratchet.json']);
  assertTrue(coverageConfig.names.includes('verify:frontend:coverage-ratchet'), 'coverage config should select the ratchet gate it configures');
  assertTrue(coverageConfig.names.includes('verify:frontend:coverage-ratchet-behavior'), 'coverage config should select behavior coverage');
  assertTrue(coverageConfig.names.includes('verify:frontend:quality-docs-drift'), 'coverage config should select docs drift because thresholds are documented');
  assertTrue(coverageConfig.names.includes('verify:frontend:delivery-gate-registry'), 'coverage config should keep delivery registry coverage');
  assertFalse(coverageConfig.names.includes('verify:backend:check'), 'coverage config should not use backend safe fallback');
}
