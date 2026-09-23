import {
  CI_META_GATES,
  FRONTEND_SMOKE_SCRIPT_GATES,
  QUALITY_RUNNER_PREFLIGHT_CACHE_GATES,
} from './quality-affected-gates.mjs';

export {
  FRONTEND_DESIGN_HELPER_AFFECTED_RULES,
} from './affected/frontend-design-helper-rules.mjs';
export {
  FRONTEND_MODULE_GOVERNANCE_AFFECTED_RULES,
  FRONTEND_ROUTE_POLICY_AFFECTED_RULES,
  FRONTEND_SIZE_BOUNDARY_AFFECTED_RULES,
  FRONTEND_STRUCTURE_HELPER_AFFECTED_RULES,
} from './affected/frontend-structure-governance-rules.mjs';

function qualityInfrastructureGates(...names) {
  return ['lint:scripts', ...CI_META_GATES, 'verify:ci:release-version-bump', ...names];
}

function rule(gates, reason) {
  return Object.freeze({
    gates: Object.freeze(gates),
    reason,
  });
}

export const FRONTEND_PREFLIGHT_CACHE_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-preflight-cache.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-command.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-manifest.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-store.mjs',
  'scripts/verify-frontend-preflight.sh',
]);

const FRONTEND_SMOKE_RUNTIME_SCRIPT_FILES = new Set([
  'scripts/frontend/smoke-frontend-routes.mjs',
  'scripts/frontend/run-frontend-smoke-preview.mjs',
]);

const FRONTEND_GATE_REGISTRY_AUDIT_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-gate-registry-audit.mjs',
]);

export const FRONTEND_RUNTIME_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_SMOKE_RUNTIME_SCRIPT_FILES,
    gates: Object.freeze([...CI_META_GATES, ...FRONTEND_SMOKE_SCRIPT_GATES]),
    reason: 'frontend smoke runtime script change',
  },
  {
    files: FRONTEND_GATE_REGISTRY_AUDIT_HELPER_FILES,
    gates: Object.freeze([
      ...CI_META_GATES,
      'verify:frontend:structure-gate-registry',
      'verify:frontend:structure-gate-registry-behavior',
      'verify:frontend:delivery-gate-registry',
      'verify:frontend:delivery-gate-registry-behavior',
    ]),
    reason: 'frontend gate registry audit helper change',
  },
]);

export const FRONTEND_PREFLIGHT_CACHE_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_PREFLIGHT_CACHE_HELPER_FILES,
    gates: Object.freeze([
      ...qualityInfrastructureGates(),
      ...QUALITY_RUNNER_PREFLIGHT_CACHE_GATES,
      'verify:frontend:preflight',
    ]),
    reason: 'frontend preflight cache wrapper change',
  },
]);

export function frontendScriptRuleForFile(file) {
  if (file.startsWith('scripts/lib/frontend/smoke/')) {
    return rule(
      [...CI_META_GATES, ...FRONTEND_SMOKE_SCRIPT_GATES],
      `${file}: frontend smoke helper change`,
    );
  }

  return null;
}
