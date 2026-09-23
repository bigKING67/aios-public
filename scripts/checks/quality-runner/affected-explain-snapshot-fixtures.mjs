import {
  explainAffected,
} from '../../quality-runner.mjs';

function captureStdout(callback) {
  const originalStdoutWrite = process.stdout.write;
  let output = '';
  try {
    process.stdout.write = (chunk, encoding, done) => {
      output += String(chunk);
      if (typeof done === 'function') {
        done();
      }
      return true;
    };
    callback();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return output;
}

function explainJson(changedFiles, options = {}) {
  const stdout = captureStdout(() => {
    explainAffected({
      base: undefined,
      changedFiles,
      json: true,
      packageJsonKind: options.packageJsonKind,
      packageLockKind: options.packageLockKind,
      summary: true,
      why: options.why ?? null,
    });
  });
  return JSON.parse(stdout);
}

function sortedNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right));
}

function assertExplainSnapshot(assertions, fixture) {
  const {
    assertDeepEqual,
    assertEqual,
  } = assertions;
  const payload = explainJson(fixture.changedFiles, {
    packageJsonKind: fixture.packageJsonKind,
    packageLockKind: fixture.packageLockKind,
    why: fixture.why,
  });
  const label = `affected explain snapshot ${fixture.label}`;

  assertDeepEqual(payload.changedFiles, fixture.changedFiles, `${label} should echo changed files`);
  assertEqual(payload.summary.changedCount, fixture.changedFiles.length, `${label} should count changed files`);
  assertEqual(payload.summary.ignoredCount, fixture.ignoredCount ?? 0, `${label} should keep ignored count stable`);
  assertEqual(payload.summary.selectedCount, fixture.expectedNames.length, `${label} should keep selected gate count stable`);
  assertDeepEqual(payload.summary.groups, fixture.groups, `${label} should keep group fan-out stable`);
  assertDeepEqual(payload.summary.topReasons, fixture.topReasons, `${label} should keep top reasons stable`);
  assertDeepEqual(sortedNames(payload.selection.names), sortedNames(fixture.expectedNames), `${label} should keep selected gate membership stable`);

  if (fixture.why) {
    assertDeepEqual(payload.why, fixture.expectedWhy, `${label} should keep why payload stable`);
  }
}

export function assertAffectedExplainSnapshotFixtures(assertions) {
  const packageMetadataGates = [
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
  ];

  const qualityCacheGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:quality-runner:cache-artifact',
    'verify:quality-runner:cache-key-digest',
    'verify:quality-runner:cache-key-env',
    'verify:quality-runner:cache-key-tool-version',
    'verify:quality-runner:cache-local',
    'verify:quality-runner:cache-remote-artifact',
    'verify:quality-runner:cache-remote-config',
    'verify:quality-runner:cache-remote-repair',
    'verify:quality-runner:cache-remote-result',
    'verify:quality-runner:cache-remote-stats',
    'verify:quality-runner:scheduler-cache-bypass',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const qualityAffectedSelectionGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:quality-runner:affected-explain',
    'verify:quality-runner:affected-files',
    'verify:quality-runner:affected-mapping',
    'verify:quality-runner:affected-mode',
    'verify:quality-runner:affected-runtime-env',
    'verify:quality-runner:affected-runtime-status',
    'verify:quality-runner:prepush',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const frontendRouteSourceGates = [
    'build',
    'lint',
    'type-check',
    'verify:components:api',
    'verify:components:boundaries',
    'verify:components:inline-styles',
    'verify:components:size',
    'verify:frontend:bundle-budget',
    'verify:frontend:coverage-ratchet',
    'verify:frontend:delivery-gate-registry',
    'verify:frontend:design-evolution',
    'verify:frontend:navigation-routes',
    'verify:frontend:preview-contract',
    'verify:frontend:prod-css-integrity',
    'verify:frontend:protected-navigation',
    'verify:frontend:retired-leftovers',
    'verify:frontend:route-access',
    'verify:frontend:route-policy-registry-structure',
    'verify:frontend:stale-phase-comments',
    'verify:frontend:structure-gate-registry',
    'verify:frontend:unowned-debt-comments',
    'verify:repo:naming',
    'verify:repo:naming-behavior',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const cssModuleAppRouteGates = [
    'build',
    'lint',
    'type-check',
    'verify:app:boundaries',
    'verify:app:inline-styles',
    'verify:app:page-size',
    'verify:css-modules:size',
    'verify:design:raw-colors',
    'verify:design:typography',
    'verify:frontend:app-route-paths-behavior',
    'verify:frontend:bundle-budget',
    'verify:frontend:delivery-gate-registry',
    'verify:frontend:design-evolution',
    'verify:frontend:preview-contract',
    'verify:frontend:prod-css-integrity',
    'verify:frontend:retired-leftovers',
    'verify:frontend:stale-phase-comments',
    'verify:frontend:structure-gate-registry',
    'verify:frontend:unowned-debt-comments',
    'verify:frontend:vite-route-paths-behavior',
    'verify:frontend:vite-routes',
    'verify:repo:naming',
    'verify:repo:naming-behavior',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const frontendSmokeRuntimeGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:frontend:delivery-gate-registry',
    'verify:frontend:smoke-behavior',
  ];

  const frontendSmokeHelperGates = [
    ...frontendSmokeRuntimeGates,
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const frontendGateRegistryAuditGates = [
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:frontend:delivery-gate-registry',
    'verify:frontend:delivery-gate-registry-behavior',
    'verify:frontend:structure-gate-registry',
    'verify:frontend:structure-gate-registry-behavior',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const frontendPreflightWrapperGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:frontend:preflight',
    'verify:quality-runner:preflight-cache-key',
    'verify:quality-runner:preflight-cache-wrapper',
  ];

  const weeklyBehaviorFixtureGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:quality-runner:registry',
    'verify:weekly:behavior-gate-registry',
    'verify:weekly:overview-trend',
  ];

  const repoGovernanceGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:quality-runner:registry',
    'verify:repo:agent-workflow',
    'verify:repo:backend-cargo-governance',
    'verify:repo:naming',
    'verify:repo:naming-behavior',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
    'verify:repo:trellis-archive-export-behavior',
    'verify:repo:trellis-finish-work-scope',
    'verify:repo:trellis-finish-work-scope-behavior',
    'verify:repo:trellis-runtime-hygiene-behavior',
    'verify:repo:trellis-spec-compact',
    'verify:repo:trellis-spec-compact-behavior',
    'verify:repo:workspace-doctor',
    'verify:repo:workspace-doctor-behavior',
  ];

  const repoNamingCoreGates = [
    'lint:scripts',
    'verify:ci:gate-fixture-utils-behavior',
    'verify:ci:generated',
    'verify:ci:generated-behavior',
    'verify:ci:guard-utils-behavior',
    'verify:ci:manifest-order',
    'verify:ci:manifest-order-behavior',
    'verify:ci:profiles',
    'verify:ci:profiles-behavior',
    'verify:ci:wiring',
    'verify:ci:wiring-behavior',
    'verify:repo:naming',
    'verify:repo:naming-behavior',
    'verify:repo:source-size-governance',
    'verify:repo:source-size-governance-behavior',
  ];

  const unknownFallbackGates = [
    'lint:scripts',
    'type-check',
    'verify:backend:check',
    'verify:backend:fmt',
    'verify:backend:size',
    'verify:ci:generated',
    'verify:ci:manifest-order',
    'verify:ci:profiles',
    'verify:ci:release-version-bump',
    'verify:ci:wiring',
    'verify:frontend:delivery-gate-registry',
    'verify:frontend:preflight',
    'verify:frontend:structure-gate-registry',
    'verify:repo:naming',
    'verify:shell:syntax',
  ];

  const fixtures = [
    {
      label: 'package metadata-only change',
      changedFiles: ['package.json'],
      packageJsonKind: () => 'release-metadata-only',
      why: 'verify:frontend:design-evolution',
      expectedNames: packageMetadataGates,
      groups: { 'ci-meta': 11 },
      topReasons: [
        { count: 11, reason: 'release metadata-only package change' },
      ],
      expectedWhy: {
        gate: 'verify:frontend:design-evolution',
        selected: false,
        reasons: [],
      },
    },
    {
      label: 'package lock metadata-only change',
      changedFiles: ['package-lock.json'],
      packageLockKind: () => 'release-metadata-only',
      expectedNames: packageMetadataGates,
      groups: { 'ci-meta': 11 },
      topReasons: [
        { count: 11, reason: 'package-lock root-version-only release metadata change' },
      ],
    },
    {
      label: 'package release metadata pair',
      changedFiles: ['package-lock.json', 'package.json'],
      packageJsonKind: () => 'release-metadata-only',
      packageLockKind: () => 'release-metadata-only',
      expectedNames: packageMetadataGates,
      groups: { 'ci-meta': 11 },
      topReasons: [
        { count: 11, reason: 'package-lock root-version-only release metadata change' },
        { count: 11, reason: 'release metadata-only package change' },
      ],
    },
    {
      label: 'tailwind token surface',
      changedFiles: ['tailwind.config.ts'],
      expectedNames: [
        'build',
        'lint',
        'type-check',
        'verify:design:tailwind',
        'verify:design:tailwind-non-color-aliases',
        'verify:design:tailwind-utilities',
        'verify:frontend:bundle-budget',
        'verify:frontend:preview-contract',
        'verify:frontend:prod-css-integrity',
      ],
      groups: { core: 3, design: 3, frontend: 3 },
      topReasons: [
        { count: 9, reason: 'Tailwind config token surface' },
      ],
    },
    {
      label: 'backend rust source',
      changedFiles: ['backend-rust/src/main.rs'],
      expectedNames: [
        'verify:backend:check',
        'verify:backend:clippy',
        'verify:backend:dashboard-api-latency-history-behavior',
        'verify:backend:dashboard-api-latency-history-report-behavior',
        'verify:backend:dashboard-api-latency-history-rollup-behavior',
        'verify:backend:dashboard-api-latency-observation-behavior',
        'verify:backend:dashboard-api-latency-smoke-behavior',
        'verify:backend:dashboard-typed-row-boundary',
        'verify:backend:dashboard-typed-row-boundary-behavior',
        'verify:backend:fmt',
        'verify:backend:size',
        'verify:backend:test',
        'verify:dataops-config:sync',
        'verify:repo:source-size-governance',
        'verify:repo:source-size-governance-behavior',
      ],
      groups: { backend: 13, repo: 2 },
      topReasons: [
        { count: 13, reason: 'backend source/config change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'frontend route source',
      changedFiles: ['apps/web-vite/src/components/protected-route.tsx'],
      expectedNames: frontendRouteSourceGates,
      groups: { components: 4, core: 3, frontend: 14, repo: 4 },
      topReasons: [
        { count: 6, reason: 'frontend source can affect lint/type/build' },
        { count: 4, reason: 'frontend hygiene source impact' },
        { count: 4, reason: 'route policy source impact' },
        { count: 4, reason: 'shared component source impact' },
        { count: 2, reason: 'cross-language source-size governance impact' },
        { count: 2, reason: 'frontend registry contract impact' },
        { count: 2, reason: 'migrated repository naming contract impact' },
        { count: 1, reason: 'frontend executable source can affect coverage ratchets' },
      ],
    },
    {
      label: 'css module app route source',
      changedFiles: ['apps/web-vite/src/app/marketing/creator-library/creator-library.module.css'],
      expectedNames: cssModuleAppRouteGates,
      groups: { app: 3, core: 3, 'css-modules': 1, design: 2, frontend: 12, repo: 4 },
      topReasons: [
        { count: 6, reason: 'app route source impact' },
        { count: 6, reason: 'frontend source can affect lint/type/build' },
        { count: 4, reason: 'CSS Module style/design token impact' },
        { count: 4, reason: 'frontend hygiene source impact' },
        { count: 2, reason: 'cross-language source-size governance impact' },
        { count: 2, reason: 'frontend registry contract impact' },
        { count: 2, reason: 'migrated repository naming contract impact' },
      ],
    },
    {
      label: 'frontend smoke runtime script',
      changedFiles: ['scripts/frontend/smoke-frontend-routes.mjs'],
      expectedNames: frontendSmokeRuntimeGates,
      groups: { 'ci-meta': 10, core: 1, frontend: 2 },
      topReasons: [
        { count: 13, reason: 'frontend smoke runtime script change' },
      ],
    },
    {
      label: 'frontend smoke helper',
      changedFiles: ['scripts/lib/frontend/smoke/config.mjs'],
      expectedNames: frontendSmokeHelperGates,
      groups: { 'ci-meta': 10, core: 1, frontend: 2, repo: 2 },
      topReasons: [
        { count: 13, reason: 'frontend smoke helper change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'frontend gate registry audit helper',
      changedFiles: ['scripts/lib/frontend/frontend-gate-registry-audit.mjs'],
      expectedNames: frontendGateRegistryAuditGates,
      groups: { 'ci-meta': 10, frontend: 4, repo: 2 },
      topReasons: [
        { count: 14, reason: 'frontend gate registry audit helper change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'frontend preflight wrapper',
      changedFiles: ['scripts/verify-frontend-preflight.sh'],
      expectedNames: frontendPreflightWrapperGates,
      groups: { 'ci-meta': 13, core: 1, frontend: 1 },
      topReasons: [
        { count: 15, reason: 'frontend preflight cache wrapper change' },
      ],
    },
    {
      label: 'weekly behavior fixture',
      changedFiles: ['scripts/fixtures/weekly/overview-trend.behavior-fixtures.mjs'],
      expectedNames: weeklyBehaviorFixtureGates,
      groups: { 'ci-meta': 11, core: 1, weekly: 2 },
      topReasons: [
        { count: 14, reason: 'weekly behavior fixture change' },
      ],
    },
    {
      label: 'quality cache core',
      changedFiles: ['scripts/lib/quality/quality-cache.mjs'],
      expectedNames: qualityCacheGates,
      groups: { 'ci-meta': 22, core: 1, repo: 2 },
      topReasons: [
        { count: 23, reason: 'quality cache execution change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'repository governance metadata',
      changedFiles: ['scripts/lib/repo/repo-governance-gates.mjs'],
      expectedNames: repoGovernanceGates,
      groups: { 'ci-meta': 12, core: 1, repo: 14 },
      topReasons: [
        { count: 27, reason: 'repository governance metadata change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'repository naming core',
      changedFiles: ['scripts/lib/repo/repo-naming-core.mjs'],
      expectedNames: repoNamingCoreGates,
      groups: { 'ci-meta': 10, core: 1, repo: 4 },
      topReasons: [
        { count: 13, reason: 'repository naming core helper change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
    },
    {
      label: 'split affected rule module',
      changedFiles: ['scripts/lib/quality/quality-affected-frontend-rules.mjs'],
      why: 'verify:quality-runner:affected-explain',
      expectedNames: qualityAffectedSelectionGates,
      groups: { 'ci-meta': 18, core: 1, repo: 2 },
      topReasons: [
        { count: 19, reason: 'quality affected selection change' },
        { count: 2, reason: 'cross-language source-size governance impact' },
      ],
      expectedWhy: {
        gate: 'verify:quality-runner:affected-explain',
        selected: true,
        reasons: ['scripts/lib/quality/quality-affected-frontend-rules.mjs: quality affected selection change'],
      },
    },
    {
      label: 'quality docs drift',
      changedFiles: ['docs/QUALITY_GATE_RUNNER.md'],
      expectedNames: [
        'verify:design:docs',
        'verify:design:docs-behavior',
        'verify:frontend:quality-docs-drift',
        'verify:frontend:quality-docs-drift-behavior',
      ],
      groups: { design: 2, frontend: 2 },
      topReasons: [
        { count: 4, reason: 'docs drift change' },
      ],
    },
    {
      label: 'deploy container config',
      changedFiles: ['Dockerfile.vite'],
      expectedNames: [
        'verify:deploy:config',
        'verify:deploy:config-behavior',
        'verify:deploy:dashboard-latency-systemd-behavior',
        'verify:deploy:vps-git-state:smoke',
      ],
      groups: { deploy: 4 },
      topReasons: [
        { count: 4, reason: 'deploy/container config' },
      ],
    },
    {
      label: 'unknown path fallback',
      changedFiles: ['unknown.txt'],
      expectedNames: unknownFallbackGates,
      groups: { backend: 3, 'ci-meta': 5, core: 2, frontend: 3, repo: 1, shell: 1 },
      topReasons: [
        { count: 15, reason: 'unknown path safe fallback' },
      ],
    },
  ];

  for (const fixture of fixtures) {
    assertExplainSnapshot(assertions, fixture);
  }
}
