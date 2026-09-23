import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_AGGREGATE_INPUTS,
  isQualityRunnerSliceGate,
  qualityRunnerSliceInputPatterns,
} from './quality-runner-slices.mjs';
import {
  ALLOWLIST_CONFIG_INPUT_GATE_GROUPS,
} from './quality-allowlist-affected-gates.mjs';
import {
  RUST_TOOLCHAIN_GATE_NAMES,
} from './quality-gate-named-inputs.mjs';
import {
  commandTargetFiles,
  pairedBehaviorTargetFiles,
} from './quality-gate-command-targets.mjs';
import {
  expandNamedInputPatterns,
} from './quality-gate-input-expansion.mjs';
import {
  designGateInputPatterns,
} from './gate-inputs/design-inputs.mjs';
import {
  frontendDeliveryGateInputPatterns,
} from './gate-inputs/frontend-delivery-inputs.mjs';
import {
  frontendStructureGateInputPatterns,
} from './gate-inputs/frontend-structure-inputs.mjs';
import {
  weeklyGateInputPatterns,
} from './gate-inputs/weekly-inputs.mjs';
import {
  specialReportSmokeGateInputPatterns,
} from '../reports/special-report-smoke-gate.mjs';
import {
  contractsMigrationsGateInputPatterns,
} from './gate-inputs/contracts-migrations-inputs.mjs';

export {
  FRONTEND_BUILD_ENV_FILES,
  QUALITY_NAMED_INPUTS,
  RUST_TOOLCHAIN_CONFIG_FILES,
} from './quality-gate-named-inputs.mjs';

export {
  commandTargetFiles,
} from './quality-gate-command-targets.mjs';

export {
  expandNamedInputPatterns,
} from './quality-gate-input-expansion.mjs';

export const CHECK_GUARD_HELPER_INPUTS = Object.freeze([
  'scripts/lib/shared/guard-utils.mjs',
  'scripts/lib/shared/guard-assertions.mjs',
  'scripts/lib/shared/guard-budgets.mjs',
  'scripts/lib/shared/guard-capped-counts.mjs',
  'scripts/lib/shared/guard-files.mjs',
  'scripts/lib/shared/guard-line-budgets.mjs',
  'scripts/lib/shared/guard-paths.mjs',
]);

function allowlistConfigInputPatternsForGate(name) {
  return Object.entries(ALLOWLIST_CONFIG_INPUT_GATE_GROUPS)
    .filter(([, gates]) => gates.includes(name))
    .map(([file]) => file);
}

function rustToolchainInputPatternsForGate(name) {
  return RUST_TOOLCHAIN_GATE_NAMES.has(name) ? [
    '@rustToolchainConfig',
    'scripts/backend-rust/cargo-with-cache.sh',
    'scripts/backend-rust/cache-maintenance.py',
    'scripts/config/backend-cargo-cache.json',
  ] : [];
}

export function inferGateInputPatterns(name, group, command) {
  const targetFiles = commandTargetFiles(command);
  const shared = ['@packageRuntime'];
  const scriptInputs = [...targetFiles, ...CHECK_GUARD_HELPER_INPUTS];
  const allowlistConfigInputs = allowlistConfigInputPatternsForGate(name);
  const rustToolchainInputs = rustToolchainInputPatternsForGate(name);

  if (name === QUALITY_RUNNER_AGGREGATE_GATE_NAME) {
    return [
      ...scriptInputs,
      'scripts/lib/quality/quality-runner-slices.mjs',
      'scripts/config/quality/quality-gates.mjs',
      'scripts/lib/quality/quality-runner-slice-definitions.mjs',
      'scripts/lib/quality/quality-runner-compat-slice-definitions.mjs',
      'scripts/lib/quality/quality-runner-slice-inputs.mjs',
      'scripts/lib/quality/quality-gate-registry.mjs',
      'scripts/lib/quality/quality-gate-inputs.mjs',
      ...QUALITY_RUNNER_AGGREGATE_INPUTS,
      ...shared,
    ];
  }

  if (isQualityRunnerSliceGate(name)) {
    return [
      ...scriptInputs,
      'scripts/lib/quality/quality-runner-slices.mjs',
      'scripts/config/quality/quality-gates.mjs',
      'scripts/lib/quality/quality-runner-slice-definitions.mjs',
      'scripts/lib/quality/quality-runner-slice-inputs.mjs',
      'scripts/lib/quality/quality-gate-registry.mjs',
      'scripts/lib/quality/quality-gate-inputs.mjs',
      ...qualityRunnerSliceInputPatterns(name),
      ...shared,
    ];
  }

  if (name === 'lint') {
    return ['@frontendSource', 'scripts/**', 'backend-rust/scripts/**', 'eslint.config.*', '@packageRuntime'];
  }
  if (name === 'lint:scripts') {
    return ['scripts/**', 'backend-rust/scripts/**', 'eslint.config.*', '@packageRuntime'];
  }
  if (name === 'type-check') {
    return ['@frontendSource', '@tsConfig', '@packageRuntime'];
  }
  if (name === 'build') {
    return ['@frontendBuildSource', '@viteConfig', '@tsConfig', '@packageRuntime'];
  }
  if (name === 'verify:ci:dependency-audit-behavior') {
    return [
      'scripts/checks/security/npm-dependency-audit.behavior.mjs',
      'scripts/checks/security/npm-dependency-audit.mjs',
      'scripts/lib/security/npm-dependency-audit-core.mjs',
      'scripts/lib/security/rust-dependency-audit-core.mjs',
      ...shared,
    ];
  }
  if (name === 'audit:dependencies:npm') {
    return [
      'package.json',
      'package-lock.json',
      'scripts/checks/security/npm-dependency-audit.mjs',
      'scripts/config/security/dependency-audit-exceptions.json',
      'scripts/lib/security/npm-dependency-audit-core.mjs',
    ];
  }
  if (name === 'audit:dependencies:rust') {
    return [
      'scripts/backend-rust/cache-maintenance.py',
      'scripts/config/backend-cargo-cache.json',
      'backend-rust/Cargo.toml',
      'backend-rust/Cargo.lock',
      'scripts/backend-rust/cargo-with-cache.sh',
      'scripts/checks/security/evaluate-rust-dependency-audit.mjs',
      'scripts/checks/security/list-rust-audit-exceptions.mjs',
      'scripts/config/security/dependency-audit-exceptions.json',
      'scripts/lib/security/rust-dependency-audit-core.mjs',
      'scripts/security/audit-rust-dependencies.sh',
      'rust-toolchain.toml',
    ];
  }

  const contractMigrationInputs = contractsMigrationsGateInputPatterns(name, {
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    scriptInputs,
    shared,
  });
  if (contractMigrationInputs) {
    return contractMigrationInputs;
  }

  const frontendDeliveryInputs = frontendDeliveryGateInputPatterns(name, {
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    scriptInputs,
    shared,
  });
  if (frontendDeliveryInputs) {
    return frontendDeliveryInputs;
  }

  const frontendStructureInputs = frontendStructureGateInputPatterns(name, {
    allowlistConfigInputs,
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    scriptInputs,
    shared,
    targetFiles,
  });
  if (frontendStructureInputs) {
    return frontendStructureInputs;
  }

  const designInputs = designGateInputPatterns(name, {
    allowlistConfigInputs,
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    scriptInputs,
    shared,
    targetFiles,
  });
  if (designInputs) {
    return designInputs;
  }

  const weeklyInputs = weeklyGateInputPatterns(name, {
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    shared,
  });
  if (weeklyInputs) {
    return weeklyInputs;
  }

  const specialReportSmokeInputs = specialReportSmokeGateInputPatterns(name, {
    checkGuardHelperInputs: CHECK_GUARD_HELPER_INPUTS,
    shared,
  });
  if (specialReportSmokeInputs) {
    return specialReportSmokeInputs;
  }

  if (name === 'verify:backend:dashboard-api-latency-observation-behavior') {
    return [
      'scripts/checks/backend-rust/dashboard-api-latency-observation.behavior.mjs',
      'scripts/checks/backend-rust/run-dashboard-api-latency-observation.sh',
      'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:dashboard:performance-completion-audit-behavior') {
    return [
      'scripts/checks/dashboard/performance-completion-audit.behavior.mjs',
      'scripts/checks/dashboard/performance-completion-audit.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:dashboard:date-range-bounds-behavior') {
    return [
      'scripts/checks/dashboard/date-range-bounds.behavior.mjs',
      'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-resolvers.ts',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:dashboard:creator-short-video-behavior') {
    return [
      'scripts/checks/dashboard/creator-short-video.behavior.mjs',
      'scripts/lib/frontend/creator-short-video-data-source-behavior-fixtures.mjs',
      'scripts/lib/frontend/creator-short-video-rendering-behavior-fixtures.mjs',
      'scripts/lib/frontend/creator-short-video-upload-link-behavior-fixtures.mjs',
      'apps/web-vite/src/app/dashboard/creator/short-video/page.tsx',
      'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-*',
      'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard.module.css',
      'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard.module.css',
      'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-metrics.module.css',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:backend:dashboard-api-latency-history-rollup-behavior') {
    return [
      'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.behavior.mjs',
      'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs',
      'scripts/checks/backend-rust/dashboard-api-latency-history.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:shell:syntax') {
    return [
      'scripts/lib/ci/shell-syntax-core.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:frontend:creator-library-follow-log-contract') {
    return [
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
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:frontend:creator-library-csv-contract') {
    return [
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
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:css-modules:size' || name === 'verify:css-modules:size-behavior') {
    return [
      ...allowlistConfigInputs,
      ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/**/*.module.css']),
      'scripts/checks/css-modules/size.mjs',
      ...(name.endsWith('-behavior')
        ? [
          'scripts/checks/css-modules/size.behavior.mjs',
          'scripts/lib/frontend/css-module-size-behavior-fixtures.mjs',
        ]
        : []),
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:repo:naming' || name === 'verify:repo:naming-behavior') {
    return [
      ...(name.endsWith('-behavior') ? [] : ['@repoNaming']),
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/repo-naming-core.mjs',
      ...(name.endsWith('-behavior') ? ['scripts/lib/repo/repo-naming-behavior-fixtures.mjs'] : []),
      ...scriptInputs,
      ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
      ...shared,
    ];
  }
  if (name === 'verify:repo:trellis-spec-compact' || name === 'verify:repo:trellis-spec-compact-behavior') {
    return [
      ...(name.endsWith('-behavior') ? [] : ['@trellisSpecs']),
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/trellis-spec-compact-core.mjs',
      ...(name.endsWith('-behavior') ? ['scripts/lib/repo/trellis-spec-compact-behavior-fixtures.mjs'] : []),
      ...scriptInputs,
      ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
      ...shared,
    ];
  }
  if (name === 'verify:repo:trellis-runtime-hygiene-behavior') {
    return [
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/trellis-runtime-hygiene-core.mjs',
      'scripts/ops/trellis-runtime-hygiene.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:repo:workspace-doctor' || name === 'verify:repo:workspace-doctor-behavior') {
    return [
      'scripts/config/backend-cargo-cache.json',
      ...(name.endsWith('-behavior') ? [] : ['@trellisSpecs', '.trellis/workspace/**']),
      'package.json',
      'scripts/backend-rust/cargo-with-cache.sh',
      'scripts/dev/start-backend.sh',
      'scripts/lib/deploy/aios-service-processes.sh',
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/trellis-runtime-hygiene-core.mjs',
      'scripts/lib/repo/trellis-spec-compact-core.mjs',
      'scripts/lib/repo/workspace-doctor-core.mjs',
      'scripts/ops/workspace-doctor.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:repo:backend-cargo-governance') {
    return [
      'scripts/config/backend-cargo-cache.json',
      'scripts/backend-rust/cache-maintenance.py',
      'scripts/checks/repo/backend-cargo-cache-behavior.py',
      'package.json',
      'scripts/backend-rust/cargo-with-cache.sh',
      'scripts/dev/start-backend.sh',
      'scripts/lib/deploy/aios-service-processes.sh',
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/workspace-doctor-core.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:repo:agent-workflow') {
    return [
      'AGENTS.md',
      'PLANS.md',
      'code_review.md',
      '.trellis/config.yaml',
      '.trellis/workflow.md',
      '.agents/skills/trellis-start/SKILL.md',
      '.agents/skills/trellis-continue/SKILL.md',
      '.agents/skills/trellis-finish-work/SKILL.md',
      '.pi/AGENTS.md',
      '.pi/rules/pi-aios.md',
      'package.json',
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/trellis-runtime-hygiene-core.mjs',
      'scripts/ops/trellis-runtime-hygiene.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:repo:trellis-finish-work-scope' || name === 'verify:repo:trellis-finish-work-scope-behavior') {
    return [
      '.trellis/config.yaml',
      '.trellis/workflow.md',
      '.agents/skills/trellis-finish-work/SKILL.md',
      '.pi/prompts/trellis-finish-work.md',
      'scripts/lib/repo/repo-governance-gates.mjs',
      'scripts/lib/repo/trellis-finish-work-scope-core.mjs',
      ...scriptInputs,
      ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
      ...shared,
    ];
  }
  if (name === 'verify:ci:release-version-bump') {
    return [
      '@packageRuntime',
      '@runnerCore',
      '@ciConfig',
      'scripts/checks/ci/release-version-bump.mjs',
      'scripts/lib/quality/quality-release-version-bump-core.mjs',
      'README.md',
      'CHANGELOG.md',
      'docs/RELEASE_VERSIONING.md',
    ];
  }
  if (name === 'verify:ci:wiring' || name === 'verify:ci:wiring-behavior') {
    return [
      '@packageRuntime',
      '@runnerCore',
      '@ciConfig',
      '.github/workflows/quality-gate.yml',
      'scripts/checks/ci/package-wiring.mjs',
      'scripts/lib/ci/package-wiring-core.mjs',
      'scripts/lib/ci/quality-workflow-contract-core.mjs',
      'scripts/lib/ci/verify-ci-meta-gates.mjs',
      'scripts/lib/quality/quality-gate-registry.mjs',
      ...(name.endsWith('-behavior')
        ? [
          'scripts/checks/ci/package-wiring.behavior.mjs',
          'scripts/lib/ci/package-wiring-behavior-fixtures.mjs',
        ]
        : []),
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:ci:manifest-order' || name === 'verify:ci:manifest-order-behavior') {
    return [
      '@packageRuntime',
      'scripts/checks/ci/manifest-order.mjs',
      'scripts/lib/ci/verify-ci-manifest-order-core.mjs',
      'scripts/lib/ci/verify-ci-gates.mjs',
      'scripts/lib/ci/verify-ci-meta-gates.mjs',
      'scripts/lib/quality/quality-runner-slices.mjs',
      ...(name.endsWith('-behavior')
        ? [
          'scripts/checks/ci/manifest-order.behavior.mjs',
          'scripts/lib/ci/verify-ci-manifest-order-behavior-fixtures.mjs',
          'scripts/lib/shared/gate-fixture-utils.mjs',
        ]
        : []),
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:ci:guard-utils-behavior') {
    return [
      '@packageRuntime',
      'scripts/checks/shared/guard-utils.behavior.mjs',
      'scripts/lib/shared/guard-utils-behavior-fixtures.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
    ];
  }
  if (name === 'verify:ci:gate-fixture-utils-behavior') {
    return [
      '@packageRuntime',
      'scripts/checks/shared/gate-fixture-utils.behavior.mjs',
      'scripts/lib/shared/gate-fixture-utils.mjs',
      'scripts/lib/shared/gate-fixture-utils-behavior-fixtures.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
    ];
  }
  if (name === 'verify:ci:release-version-bump-behavior') {
    return [
      '@packageRuntime',
      'scripts/checks/ci/release-version-bump.behavior.mjs',
      'scripts/checks/ci/release-version-bump.mjs',
      'scripts/lib/quality/quality-release-version-bump-core.mjs',
      'scripts/lib/quality/quality-release-version-bump-behavior-fixtures.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
    ];
  }
  if (name === 'verify:app:boundaries-behavior') {
    return [
      ...allowlistConfigInputs,
      'scripts/checks/app/module-boundaries.behavior.mjs',
      'scripts/checks/app/module-boundaries.mjs',
      'scripts/lib/frontend/app-module-boundaries-core.mjs',
      'scripts/lib/frontend/app-module-boundaries-behavior-fixtures.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:app:boundaries') {
    return [
      ...allowlistConfigInputs,
      '@frontendSource',
      'scripts/checks/app/module-boundaries.mjs',
      'scripts/lib/frontend/app-module-boundaries-core.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:frontend:retired-leftovers') {
    return [
      'apps/web-vite/src/**',
      'apps/**',
      'docs/**',
      'package.json',
      'tsconfig.json',
      'AGENTS.md',
      'README.md',
      'scripts/lib/frontend/retired-frontend-leftovers-core.mjs',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name === 'verify:frontend:retired-leftovers-behavior') {
    return [
      'scripts/checks/frontend-hygiene/retired-leftovers.behavior.mjs',
      'scripts/checks/frontend-hygiene/retired-leftovers.mjs',
      'scripts/lib/frontend/retired-frontend-leftovers-core.mjs',
      'scripts/lib/frontend/retired-frontend-leftovers-behavior-fixtures.mjs',
      ...CHECK_GUARD_HELPER_INPUTS,
      ...shared,
    ];
  }
  if (name === 'verify:deploy:config' || name === 'verify:deploy:config-behavior') {
    return [
      '@deployConfig',
      'scripts/lib/deploy/deploy-config-core.mjs',
      ...(name.endsWith('-behavior') ? [
        'scripts/lib/deploy/deploy-config-behavior-fixtures.mjs',
        'scripts/lib/deploy/api-deploy-proof-fixtures.mjs',
        'scripts/lib/deploy/api-deploy-proof.sh',
        'scripts/lib/deploy/sample-inventory-public-access-preflight-fixtures.mjs',
      ] : []),
      ...scriptInputs,
      ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
      ...shared,
    ];
  }
  if (name === 'verify:deploy:vps-git-state:smoke') {
    return [
      'scripts/checks/deploy/vps-git-state.smoke.mjs',
      'scripts/lib/deploy/vps-git-state-behavior-fixtures.mjs',
      'scripts/lib/deploy/vps-git-state.sh',
      'scripts/lib/deploy/vps-remote-git-sync.sh',
      'scripts/ops/vps-hotfix.sh',
      '.trellis/.gitignore',
      '.trellis/config.yaml',
      '.trellis/scripts/**',
      ...scriptInputs,
      ...shared,
    ];
  }
  if (name.endsWith('-behavior')) {
    return [
      ...allowlistConfigInputs,
      ...scriptInputs,
      ...pairedBehaviorTargetFiles(targetFiles),
      'scripts/lib/**',
      ...shared,
    ];
  }

  if (group === 'backend') {
    return ['@backendSource', '@etlSource', ...rustToolchainInputs, ...allowlistConfigInputs, ...scriptInputs, ...shared];
  }
  if (group === 'ci-meta') {
    return ['@packageRuntime', '@runnerCore', '@ciConfig', 'README.md', 'CHANGELOG.md', 'docs/RELEASE_VERSIONING.md'];
  }
  if (group === 'deploy') {
    return [
      '@deployConfig',
      ...scriptInputs,
      ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
      ...shared,
    ];
  }
  if (group === 'repo') {
    return ['@repoNaming', ...scriptInputs, ...shared];
  }
  if (group === 'design') {
    return ['@frontendSource', '@designAuthority', '@docs', 'scripts/design-*', ...allowlistConfigInputs, ...scriptInputs, ...shared];
  }
  if (group === 'weekly') {
    return ['@weeklySource', ...scriptInputs, ...shared];
  }
  if (group === 'app') {
    return ['@appSource', '@frontendApp', ...allowlistConfigInputs, ...scriptInputs, ...shared];
  }
  if (group === 'components') {
    return ['@componentSource', ...allowlistConfigInputs, ...scriptInputs, ...shared];
  }
  if (group === 'css-modules') {
    return ['apps/web-vite/src/**/*.module.css', ...allowlistConfigInputs, ...scriptInputs, ...shared];
  }
  if (group === 'frontend') {
    return ['@frontendSource', ...scriptInputs, ...shared];
  }
  if (group === 'shell') {
    return ['scripts/**/*.sh', '.githooks/**', ...scriptInputs, ...shared];
  }
  if (group === 'runtime') {
    return [
      '@frontendSource',
      'scripts/config/frontend/smoke-routes.json',
      'scripts/frontend/smoke-frontend-routes.mjs',
      'scripts/lib/frontend/smoke/**',
      ...scriptInputs,
      ...shared,
    ];
  }

  return [...scriptInputs, ...shared];
}

export function inferGateInputs(name, group, command) {
  return expandNamedInputPatterns(inferGateInputPatterns(name, group, command));
}
