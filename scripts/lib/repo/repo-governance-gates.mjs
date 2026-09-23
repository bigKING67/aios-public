/**
 * Single source of truth for repository-level governance gates.
 *
 * These gates cover structure and naming rules that are broader than one
 * frontend surface. Keep the enforced path list intentionally small and expand
 * it only after a directory has been migrated to the canonical convention.
 */

export const REPO_NAMING_ENFORCED_PATHS = Object.freeze([
  'apps/web-vite/src/app/_components',
  'apps/web-vite/src/app/admin',
  'apps/web-vite/src/app/dashboard',
  'apps/web-vite/src/app/docs',
  'apps/web-vite/src/app/login',
  'apps/web-vite/src/app/marketing',
  'apps/web-vite/src/app/ops/dataops',
  'apps/web-vite/src/app/profile',
  'apps/web-vite/src/app/reports/monthly',
  'apps/web-vite/src/app/reports/weekly',
  'apps/web-vite/src/components',
  'apps/web-vite/src/context',
  'apps/web-vite/src/hooks',
  'apps/web-vite/src/styles/light-theme.css',
  'apps/web-vite/src/styles/light-theme',
  'scripts/checks/repo',
  'scripts/lib/repo/repo-governance-gates.mjs',
]);

export const REPO_NAMING_INPUT_PATTERNS = Object.freeze([
  'apps/web-vite/src/app/_components/**',
  'apps/web-vite/src/app/admin/**',
  'apps/web-vite/src/app/dashboard/**',
  'apps/web-vite/src/app/docs/**',
  'apps/web-vite/src/app/login/**',
  'apps/web-vite/src/app/marketing/**',
  'apps/web-vite/src/app/ops/dataops/**',
  'apps/web-vite/src/app/profile/**',
  'apps/web-vite/src/app/reports/monthly/**',
  'apps/web-vite/src/app/reports/weekly/**',
  'apps/web-vite/src/components/**',
  'apps/web-vite/src/context/**',
  'apps/web-vite/src/hooks/**',
  'apps/web-vite/src/styles/light-theme.css',
  'apps/web-vite/src/styles/light-theme/**',
  'scripts/checks/repo/**',
  'scripts/lib/repo/repo-governance-gates.mjs',
]);

export const TRELLIS_SPEC_COMPACT_INPUT_PATTERNS = Object.freeze([
  '.trellis/spec/**',
]);

export const SOURCE_SIZE_GOVERNANCE_GATE_NAMES = Object.freeze([
  'verify:repo:source-size-governance-behavior',
  'verify:repo:source-size-governance',
]);

export function isSourceSizeGovernedPath(file) {
  return (
    (file.startsWith('apps/web-vite/src/') && /(?:\.(?:ts|tsx)|\.module\.css)$/u.test(file))
    || (file.startsWith('backend-rust/src/') && file.endsWith('.rs'))
    || (file.startsWith('etl/groland_postgres/') && file.endsWith('.py'))
    || ((file.startsWith('scripts/checks/') || file.startsWith('scripts/lib/')) && file.endsWith('.mjs'))
  );
}

export function isRepoNamingEnforcedPath(file) {
  return REPO_NAMING_ENFORCED_PATHS.some((root) => (
    file === root || file.startsWith(`${root}/`)
  ));
}

export const REPO_GOVERNANCE_EXPECTED_GATES = Object.freeze([
  {
    name: 'verify:repo:naming-behavior',
    command: 'node scripts/checks/repo/naming.behavior.mjs',
    file: 'scripts/checks/repo/naming.behavior.mjs',
    label: '[verify:ci] repo naming behavior',
  },
  {
    name: 'verify:repo:naming',
    command: 'node scripts/checks/repo/naming.mjs',
    file: 'scripts/checks/repo/naming.mjs',
    label: '[verify:ci] repo naming contract',
  },
  {
    name: 'verify:repo:source-size-governance-behavior',
    command: 'node scripts/checks/repo/source-size-governance.behavior.mjs',
    file: 'scripts/checks/repo/source-size-governance.behavior.mjs',
    label: '[verify:ci] cross-language source-size governance behavior',
  },
  {
    name: 'verify:repo:source-size-governance',
    command: 'node scripts/checks/repo/source-size-governance.mjs',
    file: 'scripts/checks/repo/source-size-governance.mjs',
    label: '[verify:ci] cross-language source-size governance',
  },
  {
    name: 'verify:repo:trellis-spec-compact-behavior',
    command: 'node scripts/checks/repo/trellis-spec-compact.behavior.mjs',
    file: 'scripts/checks/repo/trellis-spec-compact.behavior.mjs',
    label: '[verify:ci] Trellis spec compactness behavior',
  },
  {
    name: 'verify:repo:trellis-spec-compact',
    command: 'node scripts/checks/repo/trellis-spec-compact.mjs',
    file: 'scripts/checks/repo/trellis-spec-compact.mjs',
    label: '[verify:ci] Trellis spec compactness',
  },
  {
    name: 'verify:repo:workspace-doctor-behavior',
    command: 'node scripts/checks/repo/workspace-doctor.behavior.mjs',
    file: 'scripts/checks/repo/workspace-doctor.behavior.mjs',
    label: '[verify:ci] workspace doctor behavior',
  },
  {
    name: 'verify:repo:workspace-doctor',
    command: 'node scripts/ops/workspace-doctor.mjs',
    file: 'scripts/ops/workspace-doctor.mjs',
    label: '[verify:ci] workspace doctor dry-run',
  },
  {
    name: 'verify:repo:backend-cargo-governance',
    command: 'node scripts/checks/repo/backend-cargo-governance.mjs',
    file: 'scripts/checks/repo/backend-cargo-governance.mjs',
    label: '[verify:ci] backend Cargo wrapper governance',
  },
  {
    name: 'verify:repo:agent-workflow',
    command: 'node scripts/checks/repo/agent-workflow.mjs',
    file: 'scripts/checks/repo/agent-workflow.mjs',
    label: '[verify:ci] agent workflow governance',
  },
  {
    name: 'verify:repo:trellis-runtime-hygiene-behavior',
    command: 'node scripts/checks/repo/trellis-runtime-hygiene.behavior.mjs',
    file: 'scripts/checks/repo/trellis-runtime-hygiene.behavior.mjs',
    label: '[verify:ci] Trellis runtime hygiene behavior',
  },
  {
    name: 'verify:repo:trellis-archive-export-behavior',
    command: 'node scripts/checks/repo/trellis-archive-export.behavior.mjs',
    file: 'scripts/checks/repo/trellis-archive-export.behavior.mjs',
    label: '[verify:ci] deterministic Trellis archive export behavior',
  },
  {
    name: 'verify:repo:trellis-finish-work-scope-behavior',
    command: 'node scripts/checks/repo/trellis-finish-work-scope.behavior.mjs',
    file: 'scripts/checks/repo/trellis-finish-work-scope.behavior.mjs',
    label: '[verify:ci] Trellis finish-work scope behavior',
  },
  {
    name: 'verify:repo:trellis-finish-work-scope',
    command: 'node scripts/checks/repo/trellis-finish-work-scope.mjs',
    file: 'scripts/checks/repo/trellis-finish-work-scope.mjs',
    label: '[verify:ci] Trellis finish-work scope',
  },
]);

export const REPO_NAMING_GATE_NAMES = Object.freeze([
  'verify:repo:naming-behavior',
  'verify:repo:naming',
]);
export const TRELLIS_SPEC_COMPACT_GATE_NAMES = Object.freeze([
  'verify:repo:trellis-spec-compact-behavior',
  'verify:repo:trellis-spec-compact',
]);
export const TRELLIS_RUNTIME_HYGIENE_GATE_NAMES = Object.freeze([
  'verify:repo:trellis-runtime-hygiene-behavior',
]);
export const TRELLIS_ARCHIVE_EXPORT_GATE_NAMES = Object.freeze([
  'verify:repo:trellis-archive-export-behavior',
]);
export const WORKSPACE_DOCTOR_GATE_NAMES = Object.freeze([
  'verify:repo:workspace-doctor-behavior',
  'verify:repo:workspace-doctor',
]);
export const BACKEND_CARGO_GOVERNANCE_GATE_NAMES = Object.freeze([
  'verify:repo:backend-cargo-governance',
]);
export const TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES = Object.freeze([
  'verify:repo:trellis-finish-work-scope-behavior',
  'verify:repo:trellis-finish-work-scope',
]);

export const REPO_GOVERNANCE_GATE_NAMES = Object.freeze(
  REPO_GOVERNANCE_EXPECTED_GATES.map((gate) => gate.name),
);
