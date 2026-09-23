import {
  changedFilesEnvValue,
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertSourceBoundaryAffectedMapping({
  assertEqual,
  assertFalse,
  assertTrue,
  registry,
}) {
  const backend = selectAffectedGates(registry, ['backend-rust/src/main.rs']);
  assertTrue(backend.names.includes('verify:backend:check'), 'backend source should select backend check');
  assertTrue(!backend.names.includes('verify:frontend:bundle-budget'), 'backend source should not select frontend bundle budget');

  const backendScript = selectAffectedGates(registry, ['backend-rust/scripts/k6_reports_time_filter.js']);
  assertTrue(backendScript.names.includes('lint:scripts'), 'backend JavaScript scripts should select scripts lint surface');
  assertTrue(backendScript.names.includes('verify:backend:check'), 'backend JavaScript scripts should keep backend coverage');

  const tsconfigBoundary = selectAffectedGates(registry, ['tsconfig.frontend.json']);
  assertTrue(tsconfigBoundary.names.includes('type-check'), 'frontend TypeScript project boundary should select type-check');
  assertTrue(tsconfigBoundary.names.includes('build'), 'frontend TypeScript project boundary should select build');
  assertTrue(tsconfigBoundary.names.includes('verify:frontend:prod-css-integrity'), 'frontend TypeScript project boundary should protect production CSS integrity');
  assertTrue(tsconfigBoundary.names.includes('verify:frontend:bundle-budget'), 'frontend TypeScript project boundary should protect build outputs');
  assertTrue(tsconfigBoundary.names.includes('verify:frontend:preview-contract'), 'frontend TypeScript project boundary should protect production preview contract');

  const eslintConfigBoundary = selectAffectedGates(registry, ['eslint.config.mjs']);
  assertTrue(eslintConfigBoundary.names.includes('lint'), 'ESLint config should select full lint surface');
  assertTrue(eslintConfigBoundary.names.includes('lint:scripts'), 'ESLint config should select scripts lint surface');
  assertTrue(eslintConfigBoundary.names.includes('verify:ci:wiring'), 'ESLint config should select CI wiring guard');
  assertTrue(eslintConfigBoundary.names.includes('verify:quality-runner:registry'), 'ESLint config should select quality-runner registry self-check');

  const reportApiSplit = selectAffectedGates(registry, ['apps/web-vite/src/lib/report-api/weekly.ts']);
  assertTrue(reportApiSplit.names.includes('lint'), 'report API client split should keep lint coverage');
  assertTrue(reportApiSplit.names.includes('type-check'), 'report API client split should keep type-check coverage');
  assertTrue(reportApiSplit.names.includes('build'), 'report API client split should keep build coverage');
  assertTrue(reportApiSplit.names.includes('verify:frontend:prod-css-integrity'), 'report API client split should protect production CSS integrity');
  assertTrue(reportApiSplit.names.includes('verify:frontend:bundle-budget'), 'report API client split should protect build outputs');
  assertTrue(reportApiSplit.names.includes('verify:frontend:preview-contract'), 'report API client split should protect production preview contract');
  assertTrue(reportApiSplit.names.includes('verify:frontend:coverage-ratchet'), 'frontend executable source should select coverage ratchets');
  assertTrue(reportApiSplit.names.includes('verify:frontend:report-api-contract'), 'report API client split should select facade contract gate');
  assertFalse(reportApiSplit.names.includes('verify:weekly:overview-kpi'), 'report API client split should not fan out to weekly UI behavior gates by filename');
  assertFalse(reportApiSplit.names.includes('verify:frontend:structure-gate-registry'), 'report API client split should not run unrelated frontend registry gates');

  const css = selectAffectedGates(registry, ['apps/web-vite/src/app/foo/Foo.module.css']);
  assertTrue(css.names.includes('lint'), 'frontend source should keep full lint coverage until TS-aware ESLint surface exists');
  assertFalse(css.names.includes('lint:scripts'), 'frontend source should not select scripts lint surface');
  assertTrue(css.names.includes('verify:css-modules:size'), 'CSS module should select CSS module size gate');
  assertTrue(css.names.includes('verify:design:raw-colors'), 'CSS module should select design color gate');
  assertTrue(css.names.includes('verify:frontend:design-evolution'), 'frontend source should select design evolution fast-path gate');
  assertFalse(css.names.includes('verify:frontend:coverage-ratchet'), 'CSS-only changes should not pay execution coverage');

  const retiredFrontendLeftoversHelper = selectAffectedGates(registry, ['scripts/lib/frontend/retired-frontend-leftovers-core.mjs']);
  assertTrue(
    retiredFrontendLeftoversHelper.names.includes('verify:frontend:retired-leftovers'),
    'retired frontend leftovers helper should select production retired leftovers gate',
  );
  assertTrue(
    retiredFrontendLeftoversHelper.names.includes('verify:frontend:retired-leftovers-behavior'),
    'retired frontend leftovers helper should select behavior coverage',
  );
  assertFalse(retiredFrontendLeftoversHelper.names.includes('verify:backend:check'), 'retired frontend leftovers helper should not use backend safe fallback');

  const retiredFrontendLeftoversBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/retired-frontend-leftovers-behavior-fixtures.mjs']);
  assertTrue(
    retiredFrontendLeftoversBehaviorFixture.names.includes('verify:frontend:retired-leftovers-behavior'),
    'retired frontend leftovers behavior fixture should select behavior coverage',
  );
  assertTrue(
    retiredFrontendLeftoversBehaviorFixture.names.includes('lint:scripts'),
    'retired frontend leftovers behavior fixture should keep script lint coverage',
  );
  assertFalse(retiredFrontendLeftoversBehaviorFixture.names.includes('verify:backend:check'), 'retired frontend leftovers behavior fixture should not use backend safe fallback');

  const appModuleBoundariesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/app-module-boundaries-behavior-fixtures.mjs']);
  assertTrue(
    appModuleBoundariesBehaviorFixture.names.includes('verify:app:boundaries-behavior'),
    'app module boundary behavior fixture should select app boundary behavior gate',
  );
  assertTrue(
    appModuleBoundariesBehaviorFixture.names.includes('lint:scripts'),
    'app module boundary behavior fixture should keep script lint coverage',
  );
  assertFalse(appModuleBoundariesBehaviorFixture.names.includes('verify:backend:check'), 'app module boundary behavior fixture should not use backend safe fallback');

  const appModuleBoundariesHelper = selectAffectedGates(registry, ['scripts/lib/frontend/app-module-boundaries-core.mjs']);
  assertTrue(
    appModuleBoundariesHelper.names.includes('verify:app:boundaries'),
    'app module boundary core helper should select app boundary production gate',
  );
  assertTrue(
    appModuleBoundariesHelper.names.includes('verify:app:boundaries-behavior'),
    'app module boundary core helper should select app boundary behavior gate',
  );
  assertTrue(
    appModuleBoundariesHelper.names.includes('lint:scripts'),
    'app module boundary core helper should keep script lint coverage',
  );
  assertFalse(appModuleBoundariesHelper.names.includes('verify:backend:check'), 'app module boundary core helper should not use backend safe fallback');

  const designEvolutionHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-design-evolution-core.mjs']);
  assertTrue(
    designEvolutionHelper.names.includes('verify:frontend:design-evolution'),
    'design evolution helper should select production design evolution gate',
  );
  assertTrue(
    designEvolutionHelper.names.includes('verify:frontend:design-evolution-behavior'),
    'design evolution helper should select behavior coverage',
  );
  assertTrue(
    designEvolutionHelper.names.includes('verify:frontend:delivery-gate-registry'),
    'design evolution helper should keep frontend delivery registry coverage',
  );
  assertFalse(designEvolutionHelper.names.includes('verify:backend:check'), 'design evolution helper should not use backend safe fallback');

  const designEvolutionBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-design-evolution-behavior-fixtures.mjs']);
  assertTrue(
    designEvolutionBehaviorFixture.names.includes('verify:frontend:design-evolution-behavior'),
    'design evolution behavior fixture should select behavior coverage',
  );
  assertTrue(
    designEvolutionBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'),
    'design evolution behavior fixture should keep frontend delivery registry coverage',
  );
  assertTrue(
    designEvolutionBehaviorFixture.names.includes('lint:scripts'),
    'design evolution behavior fixture should keep script lint coverage',
  );
  assertFalse(designEvolutionBehaviorFixture.names.includes('verify:backend:check'), 'design evolution behavior fixture should not use backend safe fallback');

  assertEqual(
    changedFilesEnvValue(['apps/web-vite/src/app/two.tsx', 'apps/web-vite/src/app/one.tsx', 'apps/web-vite/src/app/two.tsx']),
    'apps/web-vite/src/app/one.tsx\napps/web-vite/src/app/two.tsx',
    'changed-files env value should keep statusless explicit paths ambiguous while sorting and deduping',
  );
  assertEqual(
    changedFilesEnvValue([
      { file: 'apps/web-vite/src/app/two.tsx', status: 'M' },
      { file: 'apps/web-vite/src/app/one.tsx', status: 'A' },
    ]),
    'A:apps/web-vite/src/app/one.tsx\nM:apps/web-vite/src/app/two.tsx',
    'changed-files env value should preserve git status when available',
  );

  const componentSource = selectAffectedGates(registry, ['apps/web-vite/src/components/auth-session-bootstrap.tsx']);
  assertTrue(componentSource.names.includes('lint'), 'component source should keep full lint coverage until TS-aware ESLint surface exists');
  assertTrue(componentSource.names.includes('verify:components:api'), 'component source should select component API gate');
  assertTrue(componentSource.names.includes('verify:frontend:auth-navigation-policy'), 'auth component source should select auth navigation policy gate');
  assertTrue(componentSource.names.includes('verify:frontend:auth-session-recovery-behavior'), 'auth component source should select auth session recovery behavior gate');
  assertFalse(componentSource.names.includes('verify:weekly:waterfall'), 'component source should not select weekly gates by default');

  const repoNamingCore = selectAffectedGates(registry, ['scripts/lib/repo/repo-naming-core.mjs']);
  assertTrue(repoNamingCore.names.includes('lint:scripts'), 'repo naming core helper should keep script lint coverage');
  assertTrue(repoNamingCore.names.includes('verify:repo:naming'), 'repo naming core helper should select production naming gate');
  assertTrue(repoNamingCore.names.includes('verify:repo:naming-behavior'), 'repo naming core helper should select behavior naming gate');
  assertFalse(repoNamingCore.names.includes('verify:backend:check'), 'repo naming core helper should not use backend safe fallback');

  const repoNamingBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/repo/repo-naming-behavior-fixtures.mjs']);
  assertTrue(repoNamingBehaviorFixture.names.includes('lint:scripts'), 'repo naming behavior fixture should keep script lint coverage');
  assertTrue(repoNamingBehaviorFixture.names.includes('verify:repo:naming-behavior'), 'repo naming behavior fixture should select behavior naming gate');
  assertFalse(repoNamingBehaviorFixture.names.includes('verify:backend:check'), 'repo naming behavior fixture should not use backend safe fallback');

  const npmDependencyAuditCore = selectAffectedGates(registry, ['scripts/lib/security/npm-dependency-audit-core.mjs']);
  assertTrue(
    npmDependencyAuditCore.names.includes('verify:ci:dependency-audit-behavior'),
    'npm dependency audit core should select dependency audit behavior coverage',
  );
  assertTrue(
    npmDependencyAuditCore.names.includes('audit:dependencies:npm'),
    'npm dependency audit core should select the production npm audit gate',
  );
  assertFalse(
    npmDependencyAuditCore.names.includes('verify:backend:check'),
    'npm dependency audit core should not use backend safe fallback',
  );

  const rustDependencyAuditCore = selectAffectedGates(registry, ['scripts/lib/security/rust-dependency-audit-core.mjs']);
  assertTrue(
    rustDependencyAuditCore.names.includes('verify:ci:dependency-audit-behavior'),
    'Rust dependency audit core should select dependency audit behavior coverage',
  );
  assertTrue(
    rustDependencyAuditCore.names.includes('audit:dependencies:rust'),
    'Rust dependency audit core should select the production Rust audit gate',
  );
  assertFalse(
    rustDependencyAuditCore.names.includes('audit:dependencies:npm'),
    'Rust dependency audit core should not select the unrelated npm audit gate',
  );

  const rustDependencyAuditCheck = selectAffectedGates(registry, ['scripts/checks/security/evaluate-rust-dependency-audit.mjs']);
  assertTrue(
    rustDependencyAuditCheck.names.includes('audit:dependencies:rust'),
    'Rust dependency audit evaluator should select the production Rust audit gate',
  );
  assertTrue(
    rustDependencyAuditCheck.names.includes('verify:quality-runner:registry'),
    'Rust dependency audit evaluator should retain quality-runner registry coverage',
  );

  const rustDependencyAuditShell = selectAffectedGates(registry, ['scripts/security/audit-rust-dependencies.sh']);
  assertTrue(
    rustDependencyAuditShell.names.includes('audit:dependencies:rust'),
    'Rust dependency audit shell should select the production Rust audit gate',
  );
  assertTrue(
    rustDependencyAuditShell.names.includes('verify:shell:syntax'),
    'Rust dependency audit shell should select shell syntax coverage',
  );
  assertFalse(
    rustDependencyAuditShell.names.includes('verify:backend:check'),
    'Rust dependency audit shell should not fall through to unrelated backend checks',
  );

  const npmDependencyAuditCheck = selectAffectedGates(registry, ['scripts/checks/security/npm-dependency-audit.mjs']);
  assertTrue(
    npmDependencyAuditCheck.names.includes('audit:dependencies:npm'),
    'npm dependency audit check should select its direct production gate',
  );
  assertTrue(
    npmDependencyAuditCheck.names.includes('verify:quality-runner:registry'),
    'security check commands should retain quality-runner registry coverage',
  );

  const trellisSpecCompactCore = selectAffectedGates(registry, ['scripts/lib/repo/trellis-spec-compact-core.mjs']);
  assertTrue(trellisSpecCompactCore.names.includes('lint:scripts'), 'Trellis spec compact core helper should keep script lint coverage');
  assertTrue(
    trellisSpecCompactCore.names.includes('verify:repo:trellis-spec-compact'),
    'Trellis spec compact core helper should select production compactness gate',
  );
  assertTrue(
    trellisSpecCompactCore.names.includes('verify:repo:trellis-spec-compact-behavior'),
    'Trellis spec compact core helper should select behavior compactness gate',
  );
  assertFalse(trellisSpecCompactCore.names.includes('verify:backend:check'), 'Trellis spec compact core helper should not use backend safe fallback');

  const trellisSpecCompactBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/repo/trellis-spec-compact-behavior-fixtures.mjs']);
  assertTrue(trellisSpecCompactBehaviorFixture.names.includes('lint:scripts'), 'Trellis spec compact behavior fixture should keep script lint coverage');
  assertTrue(
    trellisSpecCompactBehaviorFixture.names.includes('verify:repo:trellis-spec-compact-behavior'),
    'Trellis spec compact behavior fixture should select behavior compactness gate',
  );
  assertFalse(trellisSpecCompactBehaviorFixture.names.includes('verify:backend:check'), 'Trellis spec compact behavior fixture should not use backend safe fallback');

  const trellisRuntimeCore = selectAffectedGates(registry, ['scripts/lib/repo/trellis-runtime-hygiene-core.mjs']);
  assertTrue(trellisRuntimeCore.names.includes('lint:scripts'), 'Trellis runtime hygiene core should keep script lint coverage');
  assertTrue(
    trellisRuntimeCore.names.includes('verify:repo:trellis-runtime-hygiene-behavior'),
    'Trellis runtime hygiene core should select its behavior gate',
  );
  assertTrue(
    trellisRuntimeCore.names.includes('verify:repo:agent-workflow'),
    'Trellis runtime hygiene core should select the workflow doctor',
  );
  assertTrue(
    trellisRuntimeCore.names.includes('verify:repo:workspace-doctor-behavior'),
    'Trellis runtime hygiene core should select workspace doctor behavior',
  );
  assertFalse(trellisRuntimeCore.names.includes('verify:backend:check'), 'Trellis runtime hygiene core should not use backend safe fallback');

  const trellisRuntimeCli = selectAffectedGates(registry, ['scripts/ops/trellis-runtime-hygiene.mjs']);
  assertTrue(
    trellisRuntimeCli.names.includes('verify:repo:trellis-runtime-hygiene-behavior'),
    'Trellis runtime hygiene CLI should select its behavior gate',
  );
  assertTrue(trellisRuntimeCli.names.includes('verify:repo:agent-workflow'), 'Trellis runtime hygiene CLI should select the workflow doctor');

  const workspaceDoctorCore = selectAffectedGates(registry, ['scripts/lib/repo/workspace-doctor-core.mjs']);
  assertTrue(workspaceDoctorCore.names.includes('verify:repo:workspace-doctor-behavior'), 'workspace doctor core should select behavior coverage');
  assertTrue(workspaceDoctorCore.names.includes('verify:repo:workspace-doctor'), 'workspace doctor core should select the dry-run gate');
  assertTrue(workspaceDoctorCore.names.includes('verify:repo:backend-cargo-governance'), 'workspace doctor core should select Cargo governance');
  assertFalse(workspaceDoctorCore.names.includes('verify:backend:check'), 'workspace doctor core should not use backend fallback');

  const cargoWrapper = selectAffectedGates(registry, ['scripts/backend-rust/cargo-with-cache.sh']);
  assertTrue(cargoWrapper.names.includes('verify:repo:backend-cargo-governance'), 'Cargo wrapper should select wrapper governance');
  assertFalse(cargoWrapper.names.includes('verify:backend:check'), 'Cargo wrapper governance should not trigger a backend build');

  const cargoEntrypoint = selectAffectedGates(registry, ['scripts/dev/start-backend.sh']);
  assertTrue(cargoEntrypoint.names.includes('verify:repo:backend-cargo-governance'), 'backend start should select Cargo governance');
  assertFalse(cargoEntrypoint.names.includes('verify:backend:check'), 'backend start governance should not trigger a backend build');

  const cargoProcessDiscovery = selectAffectedGates(registry, ['scripts/lib/deploy/aios-service-processes.sh']);
  assertTrue(cargoProcessDiscovery.names.includes('verify:repo:backend-cargo-governance'), 'backend process discovery should select Cargo governance');
  assertFalse(cargoProcessDiscovery.names.includes('verify:backend:check'), 'backend process governance should not trigger a backend build');

  const appCssModule = selectAffectedGates(registry, ['apps/web-vite/src/app/marketing/creator-library/creator-library.module.css']);
  assertTrue(appCssModule.names.includes('verify:css-modules:size'), 'CSS module source should select CSS Module size gate');
  assertTrue(appCssModule.names.includes('verify:frontend:prod-css-integrity'), 'CSS module source should select production CSS integrity gate');
  assertTrue(appCssModule.names.includes('verify:frontend:preview-contract'), 'CSS module source should select production preview contract gate');
  assertTrue(appCssModule.names.includes('verify:design:raw-colors'), 'CSS module source should select raw color gate');
  assertFalse(appCssModule.names.includes('verify:backend:check'), 'CSS module source should not use backend safe fallback');
}
