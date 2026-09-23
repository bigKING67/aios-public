import {
  assertRegistryFrontendDashboardInputs,
} from './registry-frontend-dashboard-fixtures.mjs';
import {
  assertRegistryFrontendPermissionInputs,
} from './registry-frontend-permission-fixtures.mjs';
import { assertRegistryDeployInputs } from './registry-deploy-fixtures.mjs';

export function assertRegistryFrontendDeliveryInputs({
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  registry,
}) {
  assertRegistryFrontendPermissionInputs({
    assertFalse,
    assertIncludes,
    assertTrue,
    registry,
  });
  assertRegistryFrontendDashboardInputs({
    assertEqual,
    assertFalse,
    assertTrue,
    registry,
  });

  assertTrue(
    registry.byName.get('verify:frontend:preflight')?.inputs.includes('tools/vendor/frontend-preflight/**'),
    'preflight cache key should include vendored preflight toolchain',
  );
  for (const input of [
    'scripts/lib/frontend/frontend-preflight-cache.mjs',
    'scripts/lib/frontend/frontend-preflight-cache-command.mjs',
    'scripts/lib/frontend/frontend-preflight-cache-manifest.mjs',
    'scripts/lib/frontend/frontend-preflight-cache-store.mjs',
  ]) {
    assertIncludes(
      registry.byName.get('verify:frontend:preflight')?.inputs ?? [],
      input,
      `preflight cache key should include helper input ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:preflight')?.envKeys.includes('FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS'),
    'preflight gate should include prompt-sync mode env in cache identity metadata',
  );

  for (const input of [
    'scripts/checks/security/npm-dependency-audit.behavior.mjs',
    'scripts/lib/security/npm-dependency-audit-core.mjs',
    'scripts/lib/security/rust-dependency-audit-core.mjs',
  ]) {
    assertIncludes(
      registry.byName.get('verify:ci:dependency-audit-behavior')?.inputs ?? [],
      input,
      `dependency audit behavior cache key should include ${input}`,
    );
  }
  for (const input of [
    'backend-rust/Cargo.lock',
    'backend-rust/Cargo.toml',
    'scripts/checks/security/evaluate-rust-dependency-audit.mjs',
    'scripts/config/security/dependency-audit-exceptions.json',
    'scripts/lib/security/rust-dependency-audit-core.mjs',
    'scripts/security/audit-rust-dependencies.sh',
  ]) {
    assertIncludes(
      registry.byName.get('audit:dependencies:rust')?.inputs ?? [],
      input,
      `Rust dependency audit input contract should include ${input}`,
    );
  }

  assertRegistryDeployInputs({ assertTrue, registry });

  assertTrue(
    registry.byName.get('verify:components:api')?.inputs.includes('apps/web-vite/src/components/**'),
    'component gates should use component-specific named inputs',
  );
  assertFalse(
    registry.byName.get('verify:components:api')?.inputs.includes('apps/**'),
    'component gates should avoid broad app inputs when component named inputs are enough',
  );
  assertFalse(
    registry.byName.get('verify:components:api-behavior')?.inputs.includes('scripts/lib/**'),
    'component API exports behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:components:api-behavior')?.inputs.includes('scripts/checks/components/api-exports.mjs'),
    'component API exports behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:components:api-behavior')?.inputs.includes('scripts/lib/frontend/component-api-exports-behavior-fixtures.mjs'),
    'component API exports behavior cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:components:size-behavior')?.inputs.includes('scripts/lib/**'),
    'component size behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:components:size')?.inputs.includes('scripts/config/allowlists/frontend-component-size-allowlist.json'),
    'component size gate should hash component size allowlist config',
  );
  assertTrue(
    registry.byName.get('verify:components:size-behavior')?.inputs.includes('scripts/checks/components/size.mjs'),
    'component size behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:components:size-behavior')?.inputs.includes('scripts/lib/frontend/frontend-component-size-behavior-fixtures.mjs'),
    'component size behavior cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:components:size',
    'verify:components:size-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-component-size-core.mjs'),
      `${gateName} cache key should include split component size helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:components:boundaries-behavior')?.inputs.includes('scripts/lib/**'),
    'component boundary behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:components:boundaries-behavior')?.inputs.includes('scripts/checks/components/boundaries.mjs'),
    'component boundary behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:components:boundaries-behavior')?.inputs.includes('scripts/lib/frontend/component-boundaries-behavior-fixtures.mjs'),
    'component boundary behavior cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:components:boundaries',
    'verify:components:boundaries-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/component-boundaries-core.mjs'),
      `${gateName} cache key should include split component boundary helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:app:page-size')?.inputs.includes('apps/web-vite/src/app/**'),
    'app page size gate should hash app route source files',
  );
  assertTrue(
    registry.byName.get('verify:app:page-size')?.inputs.includes('scripts/config/allowlists/app-page-size-allowlist.json'),
    'app page size gate should hash page size allowlist config',
  );
  assertFalse(
    registry.byName.get('verify:app:page-size-behavior')?.inputs.includes('scripts/lib/**'),
    'app page size behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:app:page-size-behavior')?.inputs.includes('scripts/checks/app/page-size.mjs'),
    'app page size behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:app:page-size-behavior')?.inputs.includes('scripts/lib/frontend/app-page-size-behavior-fixtures.mjs'),
    'app page size behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:css-modules:size')?.inputs.includes('apps/web-vite/src/**/*.module.css'),
    'CSS module gate should hash CSS module inputs instead of all frontend source',
  );
  assertFalse(
    registry.byName.get('verify:css-modules:size-behavior')?.inputs.includes('scripts/lib/**'),
    'CSS module size behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:css-modules:size-behavior')?.inputs.includes('scripts/checks/css-modules/size.mjs'),
    'CSS module size behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:css-modules:size-behavior')?.inputs.includes('scripts/lib/frontend/css-module-size-behavior-fixtures.mjs'),
    'CSS module size behavior cache key should include split behavior fixtures',
  );
  for (const input of [
    'apps/web-vite/src/app/_components/**',
    'apps/web-vite/src/app/admin/**',
    'apps/web-vite/src/app/dashboard/**',
    'apps/web-vite/src/app/marketing/**',
    'apps/web-vite/src/app/ops/dataops/**',
    'apps/web-vite/src/app/profile/**',
    'apps/web-vite/src/app/reports/monthly/**',
    'apps/web-vite/src/app/reports/weekly/**',
    'apps/web-vite/src/components/**',
    'apps/web-vite/src/context/**',
    'apps/web-vite/src/hooks/**',
    'scripts/checks/repo/**',
  ]) {
    assertTrue(
      registry.byName.get('verify:repo:naming')?.inputs.includes(input),
      `repo naming gate should hash migrated boundary ${input}`,
    );
  }
  for (const gateName of [
    'verify:repo:naming',
    'verify:repo:naming-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/repo/repo-governance-gates.mjs'),
      `${gateName} cache key should include repo governance metadata`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/repo/repo-naming-core.mjs'),
      `${gateName} cache key should include split repo naming core`,
    );
  }
  assertFalse(
    registry.byName.get('verify:repo:naming-behavior')?.inputs.includes('scripts/lib/**'),
    'repo naming behavior fixture should hash exact split helpers instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:repo:naming-behavior')?.inputs.includes('scripts/checks/repo/naming.mjs'),
    'repo naming behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:repo:naming-behavior')?.inputs.includes('scripts/lib/repo/repo-naming-behavior-fixtures.mjs'),
    'repo naming behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:repo:trellis-spec-compact')?.inputs.includes('.trellis/spec/**'),
    'Trellis compactness gate should hash Trellis specs',
  );
  for (const gateName of [
    'verify:repo:trellis-spec-compact',
    'verify:repo:trellis-spec-compact-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/repo/trellis-spec-compact-core.mjs'),
      `${gateName} cache key should include split Trellis compactness core`,
    );
  }
  assertTrue(
    registry.byName.get('verify:repo:trellis-spec-compact-behavior')?.inputs.includes('scripts/checks/repo/trellis-spec-compact.mjs'),
    'Trellis compactness behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:repo:trellis-spec-compact-behavior')?.inputs.includes('scripts/lib/repo/trellis-spec-compact-behavior-fixtures.mjs'),
    'Trellis compactness behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:repo:trellis-runtime-hygiene-behavior')?.inputs.includes('scripts/lib/repo/trellis-runtime-hygiene-core.mjs'),
    'Trellis runtime hygiene behavior cache key should include its core',
  );
  assertTrue(
    registry.byName.get('verify:repo:trellis-runtime-hygiene-behavior')?.inputs.includes('scripts/ops/trellis-runtime-hygiene.mjs'),
    'Trellis runtime hygiene behavior cache key should include its CLI',
  );
  for (const input of ['AGENTS.md', 'PLANS.md', 'code_review.md', 'scripts/lib/repo/trellis-runtime-hygiene-core.mjs']) {
    assertTrue(
      registry.byName.get('verify:repo:agent-workflow')?.inputs.includes(input),
      `agent workflow cache key should include ${input}`,
    );
  }
  assertFalse(
    registry.byName.get('verify:repo:agent-workflow')?.cacheable,
    'agent workflow must stay non-cacheable because it inspects ignored runtime state and file age',
  );

  assertEqual(
    registry.byName.get('build')?.outputs.join(','),
    'apps/web-vite/dist/**',
    'build gate should declare the dist output boundary for artifact cache materialization',
  );
  assertTrue(
    registry.byName.get('build')?.inputs.includes('public/**'),
    'build gate cache identity should include public assets copied into Vite dist',
  );
  assertTrue(
    registry.byName.get('build')?.inputs.includes('.env.production'),
    'build gate cache identity should include Vite production env files used by the build fingerprint',
  );
  assertTrue(
    registry.byName.get('build')?.cacheable,
    'build gate should be cacheable now that output artifact materialization is fail-closed',
  );
  assertTrue(
    registry.byName.get('build')?.envKeys.includes('VITE_API_URL'),
    'build gate should include frontend build env in cache identity metadata',
  );
  assertFalse(
    registry.byName.get('verify:frontend:build-fingerprint-behavior')?.inputs.includes('scripts/lib/**'),
    'build fingerprint behavior fixture should hash exact split helpers instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:build-fingerprint-behavior')?.inputs.includes('scripts/lib/frontend/frontend-build-fingerprint.mjs'),
    'build fingerprint behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:build-fingerprint-behavior')?.inputs.includes('scripts/lib/frontend/frontend-build-fingerprint-behavior-fixtures.mjs'),
    'build fingerprint behavior fixture should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget')?.envKeys.includes('VITE_API_URL'),
    'bundle budget gate should include frontend build env in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget')?.inputs.includes('public/**'),
    'bundle budget gate should hash the same public asset boundary as the build manifest fingerprint',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget')?.inputs.includes('.env.production'),
    'bundle budget gate should hash build env files that can stale the production manifest',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget')?.inputs.includes('apps/web-vite/dist/**'),
    'bundle budget gate should hash the production dist artifact boundary it verifies',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget')?.inputs.includes('scripts/lib/frontend/frontend-bundle-budget-core.mjs'),
    'bundle budget gate should include split core helper in cache identity',
  );
  assertFalse(
    registry.byName.get('verify:frontend:bundle-budget-behavior')?.inputs.includes('scripts/lib/**'),
    'bundle budget behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget-behavior')?.inputs.includes('scripts/checks/frontend/bundle-budget.mjs'),
    'bundle budget behavior fixture should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget-behavior')?.inputs.includes('scripts/lib/frontend/frontend-bundle-budget-core.mjs'),
    'bundle budget behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:bundle-budget-behavior')?.inputs.includes('scripts/lib/frontend/frontend-bundle-budget-behavior-fixtures.mjs'),
    'bundle budget behavior fixture should include split behavior fixtures',
  );
  assertEqual(
    registry.byName.get('verify:frontend:bundle-budget')?.outputs.length,
    0,
    'bundle budget should stay result-only until dist artifact materialization is explicitly implemented',
  );
  for (const gateName of [
    'verify:frontend:coverage-ratchet',
    'verify:frontend:coverage-ratchet-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/config/frontend/coverage-ratchet.json'),
      `${gateName} cache key should include the coverage ratchet manifest`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-coverage-ratchet-core.mjs'),
      `${gateName} cache key should include the coverage ratchet core`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:coverage-ratchet')?.inputs.includes('apps/web-vite/vitest.coverage.config.ts'),
    'coverage ratchet gate should include the Vitest coverage config',
  );
  assertTrue(
    registry.byName.get('verify:frontend:coverage-ratchet')?.inputs.includes('apps/web-vite/src/**'),
    'coverage ratchet gate should hash frontend source and tests',
  );
  for (const gateName of [
    'test:frontend:unit',
    'verify:frontend:coverage-ratchet',
  ]) {
    assertFalse(
      registry.byName.get(gateName)?.parallel,
      `${gateName} should run scheduler-exclusive to prevent nested Vitest worker oversubscription`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:coverage-ratchet-behavior')?.inputs.includes('scripts/checks/frontend/coverage-ratchet.mjs'),
    'coverage ratchet behavior gate should include the paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:coverage-ratchet-behavior')?.inputs.includes('scripts/lib/frontend/frontend-coverage-ratchet-behavior-fixtures.mjs'),
    'coverage ratchet behavior gate should include split behavior fixtures',
  );
  assertEqual(
    (registry.byName.get('verify:frontend:coverage-ratchet')?.deps ?? []).join(','),
    'verify:frontend:coverage-ratchet-behavior',
    'coverage ratchet gate should depend on its behavior fixture',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity')?.deps.includes('build'),
    'production CSS integrity gate should depend on fresh production build output',
  );
  assertFalse(
    registry.byName.get('verify:frontend:prod-css-integrity')?.cacheable,
    'production CSS integrity gate should inspect live dist output instead of cached stale assets',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity')?.envKeys.includes('VITE_API_URL'),
    'production CSS integrity gate should include frontend build env in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity')?.inputs.includes('apps/web-vite/dist/**'),
    'production CSS integrity gate should hash the production dist CSS artifact boundary',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity')?.inputs.includes('scripts/lib/frontend/frontend-prod-css-integrity-core.mjs'),
    'production CSS integrity gate should include split core helper in cache identity',
  );
  assertFalse(
    registry.byName.get('verify:frontend:prod-css-integrity-behavior')?.inputs.includes('scripts/lib/**'),
    'production CSS integrity behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity-behavior')?.inputs.includes('scripts/checks/frontend/prod-css-integrity.mjs'),
    'production CSS integrity behavior fixture should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity-behavior')?.inputs.includes('scripts/lib/frontend/frontend-prod-css-integrity-core.mjs'),
    'production CSS integrity behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:prod-css-integrity-behavior')?.inputs.includes('scripts/lib/shared/gate-fixture-utils.mjs'),
    'production CSS integrity behavior fixture should include fixture workspace helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract')?.deps.includes('build'),
    'preview contract gate should depend on fresh production build output',
  );
  assertFalse(
    registry.byName.get('verify:frontend:preview-contract')?.cacheable,
    'preview contract gate should inspect live dist output instead of cached stale assets',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract')?.envKeys.includes('VITE_API_URL'),
    'preview contract gate should include frontend build env in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract')?.inputs.includes('apps/web-vite/dist/**'),
    'preview contract gate should hash the production dist artifact boundary',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract')?.inputs.includes('scripts/lib/frontend/frontend-preview-contract-core.mjs'),
    'preview contract gate should include split core helper in cache identity',
  );
  assertFalse(
    registry.byName.get('verify:frontend:preview-contract-behavior')?.inputs.includes('scripts/lib/**'),
    'preview contract behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract-behavior')?.inputs.includes('scripts/checks/frontend/preview-contract.mjs'),
    'preview contract behavior fixture should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract-behavior')?.inputs.includes('scripts/lib/frontend/frontend-preview-contract-core.mjs'),
    'preview contract behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:preview-contract-behavior')?.inputs.includes('scripts/lib/frontend/frontend-preview-contract-behavior-fixtures.mjs'),
    'preview contract behavior fixture should include split behavior fixtures',
  );

  assertTrue(
    registry.byName.get('verify:frontend:smoke-behavior')?.inputs.includes('scripts/config/frontend/smoke-routes.json'),
    'smoke behavior gate should hash route expectation config',
  );
  assertTrue(
    registry.byName.get('verify:frontend:smoke-behavior')?.inputs.includes('scripts/frontend/smoke-frontend-routes.mjs'),
    'smoke behavior gate should hash the runtime smoke CLI facade',
  );
  assertTrue(
    registry.byName.get('verify:frontend:smoke-behavior')?.inputs.includes('scripts/lib/frontend/smoke/**'),
    'smoke behavior gate should hash frontend smoke helper modules',
  );
  assertTrue(
    registry.byName.get('test:frontend:smoke:public')?.inputs.includes('scripts/config/frontend/smoke-routes.json'),
    'runtime smoke public gate should hash route expectation config',
  );
  assertTrue(
    registry.byName.get('test:frontend:smoke:preview')?.inputs.includes('scripts/config/frontend/smoke-routes.json'),
    'runtime smoke preview gate should hash route expectation config',
  );
  assertTrue(
    registry.byName.get('test:frontend:smoke:preview:performance')?.inputs.includes('scripts/config/frontend/smoke-routes.json'),
    'runtime smoke performance preview gate should hash route expectation config',
  );
  assertTrue(
    registry.byName.get('test:frontend:smoke:preview:authenticated:performance')?.inputs.includes('scripts/config/frontend/smoke-routes.json'),
    'authenticated runtime smoke performance preview gate should hash route expectation config',
  );

  assertFalse(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('apps/web-vite/src/**'),
    'design evolution gate should avoid broad frontend source inputs because changed files are passed through env',
  );
  assertFalse(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('apps/**'),
    'design evolution gate should avoid broad app inputs because changed files are passed through env',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('DESIGN.md'),
    'design evolution gate should hash the primary style authority',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('DESIGN_TOKENS.json'),
    'design evolution gate should hash supporting design token authority',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('apps/web-vite/src/styles/design-tokens.css'),
    'design evolution gate should hash supporting runtime token authority files',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.inputs.includes('scripts/lib/frontend/frontend-design-evolution-core.mjs'),
    'design evolution gate should include split core helper in cache identity',
  );
  assertFalse(
    registry.byName.get('verify:frontend:design-evolution-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'design evolution behavior fixture should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:frontend:design-evolution-behavior')?.inputs.includes('scripts/lib/**'),
    'design evolution behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution-behavior')?.inputs.includes('scripts/lib/frontend/frontend-design-evolution-behavior-fixtures.mjs'),
    'design evolution behavior fixture should include split fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution-behavior')?.inputs.includes('scripts/lib/frontend/frontend-design-evolution-core.mjs'),
    'design evolution behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.envKeys.includes('FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES'),
    'design evolution gate should include the affected changed-file manifest in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.envKeys.includes('FRONTEND_DESIGN_EVOLUTION_REQUIRED'),
    'design evolution gate should include explicit evolution-required mode env in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:frontend:design-evolution')?.envKeys.includes('FRONTEND_STYLE_AUTHORITY_MODE'),
    'design evolution gate should include style authority mode env in cache identity metadata',
  );

  assertFalse(
    registry.byName.get('verify:frontend:quality-docs-drift')?.inputs.includes('apps/**'),
    'frontend quality docs gate should avoid broad app source inputs',
  );
  for (const gateName of [
    'verify:frontend:quality-docs-drift',
    'verify:frontend:quality-docs-drift-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-quality-docs-drift-core.mjs'),
      `${gateName} cache key should include split quality docs drift helper`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/config/frontend/coverage-ratchet.json'),
      `${gateName} cache key should include the coverage ratchet manifest documented by the quality manual`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-coverage-ratchet-core.mjs'),
      `${gateName} cache key should include coverage manifest validation`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:quality-docs-drift-behavior')?.inputs.includes('scripts/checks/frontend/quality-docs-drift.mjs'),
    'frontend quality docs behavior gate should include the paired production checker facade',
  );
  assertTrue(
    registry.byName.get('verify:frontend:quality-docs-drift-behavior')?.inputs.includes('scripts/lib/frontend/frontend-quality-docs-drift-behavior-fixtures.mjs'),
    'frontend quality docs behavior cache key should include split behavior fixture helper',
  );
  for (const gateName of [
    'verify:frontend:report-api-contract',
    'verify:frontend:report-api-contract-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-report-api-contract-core.mjs'),
      `${gateName} cache key should include split report API contract helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:report-api-contract-behavior')?.inputs.includes('scripts/lib/**'),
    'report API contract behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:report-api-contract-behavior')?.inputs.includes('scripts/checks/frontend-structure/report-api-contract.mjs'),
    'report API contract behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:report-api-contract-behavior')?.inputs.includes('scripts/lib/frontend/frontend-report-api-contract-behavior-fixtures.mjs'),
    'report API contract behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:frontend:report-api-contract')?.inputs.includes('apps/web-vite/src/lib/report-api/**'),
    'report API contract production gate should hash split report API source modules',
  );
  for (const gateName of [
    'verify:frontend:module-names',
    'verify:frontend:module-names-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-module-names-core.mjs'),
      `${gateName} cache key should include split frontend module names helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:module-names-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend module names behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:module-names-behavior')?.inputs.includes('scripts/checks/frontend-structure/module-names.mjs'),
    'frontend module names behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:module-names-behavior')?.inputs.includes('scripts/lib/frontend/frontend-module-names-behavior-fixtures.mjs'),
    'frontend module names behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:frontend:module-names')?.inputs.includes('apps/web-vite/src/**/*'),
    'frontend module names production gate should hash production src modules',
  );
  assertTrue(
    registry.byName.get('verify:frontend:module-names')?.inputs.includes('apps/web-vite/**/*'),
    'frontend module names production gate should hash production Vite app modules',
  );
  for (const gateName of [
    'verify:frontend:same-dir-alias-imports',
    'verify:frontend:same-dir-alias-imports-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-same-dir-alias-imports-core.mjs'),
      `${gateName} cache key should include split same-directory alias import helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:same-dir-alias-imports-behavior')?.inputs.includes('scripts/lib/**'),
    'same-directory alias imports behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:same-dir-alias-imports-behavior')?.inputs.includes('scripts/checks/frontend-structure/same-dir-alias-imports.mjs'),
    'same-directory alias imports behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:same-dir-alias-imports-behavior')?.inputs.includes('scripts/lib/frontend/frontend-same-dir-alias-imports-behavior-fixtures.mjs'),
    'same-directory alias imports behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:frontend:same-dir-alias-imports')?.inputs.includes('apps/web-vite/src/**/*'),
    'same-directory alias imports production gate should hash production src modules',
  );
  assertTrue(
    registry.byName.get('verify:frontend:same-dir-alias-imports')?.inputs.includes('apps/web-vite/**/*'),
    'same-directory alias imports production gate should hash production Vite app modules',
  );
  for (const gateName of [
    'verify:frontend:barrel-imports',
    'verify:frontend:barrel-imports-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-barrel-imports-core.mjs'),
      `${gateName} cache key should include split frontend barrel imports helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:barrel-imports-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend barrel imports behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:barrel-imports-behavior')?.inputs.includes('scripts/checks/frontend-structure/barrel-imports.mjs'),
    'frontend barrel imports behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:barrel-imports-behavior')?.inputs.includes('scripts/lib/frontend/frontend-barrel-imports-behavior-fixtures.mjs'),
    'frontend barrel imports behavior cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:frontend:barrel-imports')?.inputs.includes('apps/web-vite/src/**/*'),
    'frontend barrel imports production gate should hash production src modules',
  );
  assertTrue(
    registry.byName.get('verify:frontend:barrel-imports')?.inputs.includes('apps/web-vite/**/*'),
    'frontend barrel imports production gate should hash production Vite app modules',
  );
  for (const gateName of [
    'verify:frontend:layer-boundaries',
    'verify:frontend:layer-boundaries-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-layer-boundaries-core.mjs'),
      `${gateName} cache key should include split frontend layer boundary helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:layer-boundaries-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend layer boundary behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:layer-boundaries-behavior')?.inputs.includes('scripts/checks/frontend-structure/layer-boundaries.mjs'),
    'frontend layer boundary behavior cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:layer-boundaries-behavior')?.inputs.includes('scripts/lib/frontend/frontend-layer-boundaries-behavior-fixtures.mjs'),
    'frontend layer boundary behavior cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:frontend:delivery-gate-registry-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend delivery registry behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:delivery-gate-registry-behavior')?.inputs.includes('scripts/checks/frontend/delivery-registry.mjs'),
    'frontend delivery registry behavior gate should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:delivery-gate-registry-behavior')?.inputs.includes('scripts/lib/frontend/frontend-delivery-registry-behavior-fixtures.mjs'),
    'frontend delivery registry behavior cache key should include split behavior fixture helper',
  );
  for (const input of [
    'scripts/lib/frontend/frontend-gate-registry-audit.mjs',
    'scripts/lib/frontend/frontend-structure-gates.mjs',
    'scripts/lib/frontend/frontend-behavior-quality-gates.mjs',
    'scripts/checks/frontend-structure/gate-registry.mjs',
  ]) {
    assertTrue(
      registry.byName.get('verify:frontend:structure-gate-registry')?.inputs.includes(input),
      `frontend structure registry cache key should include ${input}`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:structure-gate-registry-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend structure registry behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:structure-gate-registry-behavior')?.inputs.includes('scripts/checks/frontend-structure/gate-registry.behavior.mjs'),
    'frontend structure registry behavior gate should include thin behavior checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:structure-gate-registry-behavior')?.inputs.includes('scripts/lib/frontend/frontend-structure-gate-registry-behavior-fixtures.mjs'),
    'frontend structure registry behavior cache key should include split behavior fixture helper',
  );
  assertFalse(
    registry.byName.get('verify:frontend:route-access-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'frontend behavior fixtures should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:frontend:route-access-behavior')?.inputs.includes('scripts/lib/**'),
    'route access behavior fixture should hash its split core helper instead of every script helper',
  );
  for (const gateName of [
    'verify:frontend:route-access',
    'verify:frontend:route-access-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/route-access-coverage-core.mjs'),
      `${gateName} cache key should include split route access coverage helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:route-access-behavior')?.inputs.includes('scripts/checks/frontend-structure/route-access.mjs'),
    'route access behavior fixture should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:route-access-behavior')?.inputs.includes('scripts/lib/frontend/route-access-coverage-behavior-fixtures.mjs'),
    'route access behavior fixture should include its split behavior fixture helper',
  );
  assertFalse(
    registry.byName.get('verify:frontend:vite-routes-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'Vite route registry behavior fixture should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:frontend:vite-routes-behavior')?.inputs.includes('scripts/lib/**'),
    'Vite route registry behavior fixture should hash its split core helper instead of every script helper',
  );
  for (const gateName of [
    'verify:frontend:vite-routes',
    'verify:frontend:vite-routes-behavior',
  ]) {
    for (const input of [
      'scripts/lib/frontend/app-route-paths.mjs',
      'scripts/lib/frontend/vite-route-paths.mjs',
      'scripts/lib/frontend/vite-route-registry-core.mjs',
    ]) {
      assertTrue(
        registry.byName.get(gateName)?.inputs.includes(input),
        `${gateName} cache key should include ${input}`,
      );
    }
  }
  assertTrue(
    registry.byName.get('verify:frontend:vite-routes-behavior')?.inputs.includes('scripts/checks/frontend-structure/vite-routes.mjs'),
    'Vite route registry behavior should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:vite-routes-behavior')?.inputs.includes('scripts/lib/frontend/vite-route-registry-behavior-fixtures.mjs'),
    'Vite route registry behavior should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:frontend:vite-route-paths-behavior')?.inputs.includes('scripts/lib/**'),
    'Vite route path behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:vite-route-paths-behavior')?.inputs.includes('scripts/checks/frontend-structure/vite-route-paths.behavior.mjs'),
    'Vite route path behavior should include thin behavior checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:vite-route-paths-behavior')?.inputs.includes('scripts/lib/frontend/vite-route-paths.mjs'),
    'Vite route path behavior should include route path helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:vite-route-paths-behavior')?.inputs.includes('scripts/lib/frontend/vite-route-paths-behavior-fixtures.mjs'),
    'Vite route path behavior should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:frontend:behavior-guard-quality-behavior')?.inputs.includes('scripts/lib/**'),
    'frontend behavior guard quality behavior fixture should hash its split fixture helper instead of every script helper',
  );
  for (const gateName of [
    'verify:frontend:behavior-guard-quality',
    'verify:frontend:behavior-guard-quality-behavior',
  ]) {
    for (const input of [
      'scripts/lib/frontend/frontend-behavior-guard-quality-core.mjs',
      'scripts/lib/frontend/frontend-behavior-quality-gates.mjs',
      'scripts/lib/shared/behavior-guard-quality.mjs',
    ]) {
      assertTrue(
        registry.byName.get(gateName)?.inputs.includes(input),
        `${gateName} cache key should include ${input}`,
      );
    }
  }
  assertTrue(
    registry.byName.get('verify:frontend:behavior-guard-quality-behavior')?.inputs.includes('scripts/checks/frontend/behavior-guard-quality.behavior.mjs'),
    'frontend behavior guard quality behavior should include thin behavior checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:behavior-guard-quality-behavior')?.inputs.includes('scripts/checks/frontend/behavior-guard-quality.mjs'),
    'frontend behavior guard quality behavior should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:behavior-guard-quality-behavior')?.inputs.includes('scripts/lib/frontend/frontend-behavior-guard-quality-behavior-fixtures.mjs'),
    'frontend behavior guard quality behavior should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:frontend:route-policy-registry-structure-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'route policy registry structure behavior fixture should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:frontend:route-policy-registry-structure-behavior')?.inputs.includes('scripts/lib/**'),
    'route policy registry structure behavior fixture should hash its split fixture helper instead of every script helper',
  );
  for (const input of [
    'scripts/lib/frontend/app-route-paths.mjs',
    'scripts/lib/frontend/vite-route-paths.mjs',
    'scripts/lib/frontend/route-policy-registry-structure-core.mjs',
    'scripts/checks/frontend-structure/route-policy-registry-structure.mjs',
  ]) {
    assertTrue(
      registry.byName.get('verify:frontend:route-policy-registry-structure')?.inputs.includes(input),
      `route policy registry structure cache key should include ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:route-policy-registry-structure-behavior')?.inputs.includes('scripts/checks/frontend-structure/route-policy-registry-structure.mjs'),
    'route policy registry structure behavior should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:route-policy-registry-structure-behavior')?.inputs.includes('scripts/lib/frontend/route-policy-registry-structure-core.mjs'),
    'route policy registry structure behavior should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:route-policy-registry-structure-behavior')?.inputs.includes('scripts/lib/frontend/route-policy-registry-structure-behavior-fixtures.mjs'),
    'route policy registry structure behavior should include split behavior fixtures',
  );
  for (const input of [
    'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-csv.ts',
    'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts',
    'backend-rust/src/marketing/types/constants.rs',
    'backend-rust/src/marketing/handlers/mod.rs',
    'backend-rust/src/marketing/handlers/import_export/import.rs',
    'backend-rust/src/marketing/handlers/import_export/xlsx.rs',
    'backend-rust/src/marketing/creator_library_xlsx/mod.rs',
    'backend-rust/src/marketing/creator_library_xlsx/parser.rs',
    'backend-rust/src/marketing/creator_library_xlsx/types.rs',
    'backend-rust/src/marketing/template_xlsx/constants.rs',
    'backend-rust/src/marketing/template_xlsx/help_sheet.rs',
    'backend-rust/src/marketing/template_xlsx/template_sheet.rs',
    'scripts/lib/frontend/creator-library-csv-contract-core.mjs',
  ]) {
    assertTrue(
      registry.byName.get('verify:frontend:creator-library-csv-contract')?.inputs.includes(input),
      `creator-library CSV contract cache key should include ${input}`,
    );
  }
  for (const input of [
    'backend-rust/src/marketing/repository_follow_logs/mutation/create.rs',
    'backend-rust/src/marketing/repository_follow_logs/mutation/update.rs',
    'backend-rust/src/marketing/repository_follow_logs/query.rs',
    'backend-rust/src/marketing/repository_follow_logs/snapshot.rs',
    'backend-rust/src/schema_compat/creator_library_follow_log/table.rs',
    'etl/groland_postgres/sql/migrations/20260512_1030__influencer_library_follow_log_minute_timestamp.sql',
    'etl/groland_postgres/tests/sql/influencer_library_check.sql',
    'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-follow-modal.tsx',
    'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-formatters.ts',
    'scripts/lib/frontend/creator-library-follow-log-contract-core.mjs',
  ]) {
    assertTrue(
      registry.byName.get('verify:frontend:creator-library-follow-log-contract')?.inputs.includes(input),
      `creator-library follow log contract cache key should include ${input}`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:creator-library-follow-log-contract')?.inputs.includes('backend-rust/src/marketing/repository_follow_logs/**'),
    'creator-library follow log contract cache key should use exact source inputs instead of broad repository glob',
  );
  assertFalse(
    registry.byName.get('verify:frontend:navigation-routes-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'navigation route behavior fixture should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:frontend:navigation-routes-behavior')?.inputs.includes('scripts/lib/**'),
    'navigation route behavior fixture should hash its split core helper instead of every script helper',
  );
  for (const gateName of [
    'verify:frontend:navigation-routes',
    'verify:frontend:navigation-routes-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/frontend-navigation-routes-core.mjs'),
      `${gateName} cache key should include split navigation route helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:navigation-routes-behavior')?.inputs.includes('scripts/checks/frontend-structure/navigation-routes.mjs'),
    'navigation route behavior fixture should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:frontend:navigation-routes-behavior')?.inputs.includes('scripts/lib/frontend/frontend-navigation-routes-behavior-fixtures.mjs'),
    'navigation route behavior fixture should include split behavior fixtures',
  );
}
