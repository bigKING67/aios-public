import {
  BACKEND_CARGO_GOVERNANCE_GATE_NAMES,
  TRELLIS_ARCHIVE_EXPORT_GATE_NAMES,
  TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES,
  TRELLIS_RUNTIME_HYGIENE_GATE_NAMES,
  TRELLIS_SPEC_COMPACT_GATE_NAMES,
  WORKSPACE_DOCTOR_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';
import {
  CI_META_GATES,
  QUALITY_RUNNER_CHECK_COMMAND_GATES,
  REPO_GOVERNANCE_GATES,
  REPO_NAMING_GATES,
} from './quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

function qualityInfrastructureGates(...names) {
  return ['lint:scripts', ...CI_META_GATES, 'verify:ci:release-version-bump', ...names];
}

export const REPO_SCRIPT_AFFECTED_RULES = Object.freeze([
  {
    files: new Set(['scripts/lib/repo/repo-governance-gates.mjs']),
    gates: Object.freeze([
      ...qualityInfrastructureGates(),
      ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
      ...REPO_GOVERNANCE_GATES,
    ]),
    reason: 'repository governance metadata change',
  },
  {
    files: new Set(['scripts/lib/repo/repo-naming-core.mjs']),
    gates: Object.freeze(ciScriptGates(...REPO_NAMING_GATES)),
    reason: 'repository naming core helper change',
  },
  {
    files: new Set(['scripts/lib/repo/repo-naming-behavior-fixtures.mjs']),
    gates: Object.freeze(ciScriptGates('verify:repo:naming-behavior')),
    reason: 'repository naming behavior fixture change',
  },
  {
    files: new Set(['scripts/lib/repo/trellis-spec-compact-core.mjs']),
    gates: Object.freeze(ciScriptGates(...TRELLIS_SPEC_COMPACT_GATE_NAMES)),
    reason: 'Trellis spec compactness core helper change',
  },
  {
    files: new Set(['scripts/lib/repo/trellis-spec-compact-behavior-fixtures.mjs']),
    gates: Object.freeze(ciScriptGates('verify:repo:trellis-spec-compact-behavior')),
    reason: 'Trellis spec compactness behavior fixture change',
  },
  {
    files: new Set([
      'scripts/lib/repo/trellis-runtime-hygiene-core.mjs',
      'scripts/ops/trellis-runtime-hygiene.mjs',
    ]),
    gates: Object.freeze(ciScriptGates(
      ...TRELLIS_RUNTIME_HYGIENE_GATE_NAMES,
      ...WORKSPACE_DOCTOR_GATE_NAMES,
      'verify:repo:agent-workflow',
    )),
    reason: 'Trellis runtime hygiene implementation change',
  },
  {
    files: new Set([
      'scripts/lib/repo/trellis-archive-export-core.mjs',
      'scripts/ops/trellis-archive-export.mjs',
    ]),
    gates: Object.freeze(ciScriptGates(...TRELLIS_ARCHIVE_EXPORT_GATE_NAMES)),
    reason: 'deterministic Trellis archive export implementation change',
  },
  {
    files: new Set([
      'scripts/lib/repo/workspace-doctor-core.mjs',
      'scripts/config/backend-cargo-cache.json',
      'scripts/ops/workspace-doctor.mjs',
    ]),
    gates: Object.freeze(ciScriptGates(
      ...WORKSPACE_DOCTOR_GATE_NAMES,
      ...BACKEND_CARGO_GOVERNANCE_GATE_NAMES,
    )),
    reason: 'workspace doctor implementation change',
  },
  {
    files: new Set([
      'scripts/backend-rust/cargo-with-cache.sh',
      'scripts/backend-rust/cache-maintenance.py',
      'scripts/checks/repo/backend-cargo-cache-behavior.py',
      'scripts/dev/start-backend.sh',
    ]),
    gates: Object.freeze(ciScriptGates(...BACKEND_CARGO_GOVERNANCE_GATE_NAMES)),
    reason: 'backend Cargo target governance change',
  },
  {
    files: new Set(['scripts/lib/repo/trellis-finish-work-scope-core.mjs']),
    gates: Object.freeze(ciScriptGates(...TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES)),
    reason: 'Trellis finish-work scope core helper change',
  },
]);
