export function assertRegistryCiRuntimeInputs({
  assertFalse,
  assertIncludes,
  assertTrue,
  registry,
}) {
  assertTrue(
    registry.byName.get('verify:ci:release-version-bump')?.inputs.includes('scripts/checks/ci/release-version-bump.mjs'),
    'release bump production gate cache key should include its CLI facade',
  );
  assertTrue(
    registry.byName.get('verify:ci:release-version-bump')?.inputs.includes('scripts/lib/quality/quality-release-version-bump-core.mjs'),
    'release bump production gate cache key should include its shared core helper',
  );
  assertFalse(
    registry.byName.get('verify:ci:release-version-bump-behavior')?.inputs.includes('scripts/lib/**'),
    'release bump behavior fixture should hash its split fixture/core helpers instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:release-version-bump-behavior')?.inputs.includes('scripts/checks/ci/release-version-bump.mjs'),
    'release bump behavior gate cache key should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:ci:release-version-bump-behavior')?.inputs.includes('scripts/lib/quality/quality-release-version-bump-core.mjs'),
    'release bump behavior gate cache key should include its shared core helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:release-version-bump-behavior')?.inputs.includes('scripts/lib/quality/quality-release-version-bump-behavior-fixtures.mjs'),
    'release bump behavior gate cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:ci:wiring-behavior')?.inputs.includes('scripts/lib/**'),
    'package wiring behavior fixture should hash its split fixture/core helpers instead of every script helper',
  );
  for (const gateName of [
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/ci/package-wiring-core.mjs'),
      `${gateName} cache key should include split package wiring core`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/ci/quality-workflow-contract-core.mjs'),
      `${gateName} cache key should include split quality workflow contract core`,
    );
  }
  assertTrue(
    registry.byName.get('verify:ci:wiring-behavior')?.inputs.includes('scripts/checks/ci/package-wiring.mjs'),
    'package wiring behavior gate cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:ci:wiring-behavior')?.inputs.includes('scripts/lib/ci/package-wiring-behavior-fixtures.mjs'),
    'package wiring behavior gate cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('.github/workflows/quality-gate.yml'),
      `${gateName} cache key should include GitHub Actions quality cache contract`,
    );
  }
  assertFalse(
    registry.byName.get('verify:ci:manifest-order-behavior')?.inputs.includes('scripts/lib/**'),
    'manifest order behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:manifest-order-behavior')?.inputs.includes('scripts/checks/ci/manifest-order.mjs'),
    'manifest order behavior gate cache key should include its paired production checker',
  );
  for (const gateName of [
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/ci/verify-ci-manifest-order-core.mjs'),
      `${gateName} cache key should include split manifest order core`,
    );
  }
  assertTrue(
    registry.byName.get('verify:ci:manifest-order-behavior')?.inputs.includes('scripts/lib/ci/verify-ci-manifest-order-behavior-fixtures.mjs'),
    'manifest order behavior gate cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:ci:guard-utils-behavior')?.inputs.includes('scripts/lib/**'),
    'guard utils behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:guard-utils-behavior')?.inputs.includes('scripts/lib/shared/guard-utils-behavior-fixtures.mjs'),
    'guard utils behavior gate cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:ci:gate-fixture-utils-behavior')?.inputs.includes('scripts/lib/**'),
    'gate fixture utils behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:gate-fixture-utils-behavior')?.inputs.includes('scripts/lib/shared/gate-fixture-utils.mjs'),
    'gate fixture utils behavior gate cache key should include shared helper',
  );
  assertTrue(
    registry.byName.get('verify:ci:gate-fixture-utils-behavior')?.inputs.includes('scripts/lib/shared/gate-fixture-utils-behavior-fixtures.mjs'),
    'gate fixture utils behavior gate cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:app:boundaries-behavior')?.inputs.includes('scripts/lib/**'),
    'app module boundary behavior fixture should hash its split fixture helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:app:boundaries-behavior')?.inputs.includes('scripts/checks/app/module-boundaries.mjs'),
    'app module boundary behavior cache key should include paired production checker',
  );
  for (const gateName of [
    'verify:app:boundaries',
    'verify:app:boundaries-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/app-module-boundaries-core.mjs'),
      `${gateName} cache key should include split app module boundary core`,
    );
  }
  assertTrue(
    registry.byName.get('verify:app:boundaries-behavior')?.inputs.includes('scripts/lib/frontend/app-module-boundaries-behavior-fixtures.mjs'),
    'app module boundary behavior cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:frontend:retired-leftovers',
    'verify:frontend:retired-leftovers-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/frontend/retired-frontend-leftovers-core.mjs'),
      `${gateName} cache key should include split retired leftovers helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:retired-leftovers-behavior')?.inputs.includes('scripts/lib/**'),
    'retired leftovers behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:retired-leftovers-behavior')?.inputs.includes('scripts/lib/frontend/retired-frontend-leftovers-behavior-fixtures.mjs'),
    'retired leftovers behavior fixture should hash its split fixture helper',
  );

  for (const backendGate of ['verify:backend:fmt', 'verify:backend:check', 'verify:backend:test', 'verify:backend:clippy']) {
    assertTrue(
      registry.byName.get(backendGate)?.inputs.includes('rust-toolchain.toml'),
      `${backendGate} cache key should include Rust toolchain config`,
    );
  }
  for (const nonCargoGate of ['verify:dataops-config:sync', 'verify:backend:size']) {
    assertFalse(
      registry.byName.get(nonCargoGate)?.inputs.includes('rust-toolchain.toml'),
      `${nonCargoGate} should avoid hashing Rust toolchain config`,
    );
  }

  assertFalse(
    registry.byName.get('verify:shell:syntax')?.envKeys.includes('FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES'),
    'shell syntax gate should not hash the full frontend changed-file manifest after shell-scoped env split',
  );
  assertTrue(
    registry.byName.get('verify:shell:syntax')?.envKeys.includes('AIOS_SHELL_SYNTAX_CHANGED_FILES'),
    'shell syntax gate should include only shell-scoped changed files in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:shell:syntax')?.envKeys.includes('AIOS_SHELL_SYNTAX_CHANGED_SCOPE'),
    'shell syntax gate should include changed/full scope in cache identity metadata',
  );
  assertTrue(
    registry.byName.get('verify:shell:syntax')?.inputs.includes('scripts/checks/shell/syntax.mjs'),
    'shell syntax gate should track the canonical shell syntax checker command',
  );
  assertTrue(
    registry.byName.get('verify:shell:syntax')?.inputs.includes('scripts/lib/ci/shell-syntax-core.mjs'),
    'shell syntax gate should track its split core helper',
  );

  assertIncludes(
    registry.byName.get('lint')?.command,
    '--cache --cache-location .cache/eslint/full/ --cache-strategy content',
    'full lint gate should use an isolated ESLint content cache namespace',
  );
  assertIncludes(
    registry.byName.get('lint:scripts')?.command,
    '--cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
    'scripts lint surface should use an isolated ESLint content cache namespace',
  );
  assertFalse(
    registry.byName.get('lint:scripts')?.inputs.includes('apps/web-vite/src/**'),
    'scripts lint surface should avoid frontend source inputs',
  );
  assertTrue(
    registry.byName.get('lint:scripts')?.inputs.includes('backend-rust/scripts/**'),
    'scripts lint surface should include backend operational JavaScript scripts',
  );
}
