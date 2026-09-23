import {
  CI_META_GATES,
} from '../quality-affected-gates.mjs';

export {
  FRONTEND_ROUTE_POLICY_AFFECTED_RULES,
} from './frontend-route-policy-rules.mjs';
export {
  FRONTEND_MODULE_GOVERNANCE_AFFECTED_RULES,
  FRONTEND_SIZE_BOUNDARY_AFFECTED_RULES,
} from './frontend-size-module-rules.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const FRONTEND_REPORT_API_CONTRACT_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-report-api-contract-core.mjs',
]);

const FRONTEND_REPORT_API_CONTRACT_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-report-api-contract-behavior-fixtures.mjs',
]);

const FRONTEND_MODULE_NAMES_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-module-names-core.mjs',
]);

const FRONTEND_MODULE_NAMES_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-module-names-behavior-fixtures.mjs',
]);

const FRONTEND_SAME_DIR_ALIAS_IMPORTS_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-same-dir-alias-imports-core.mjs',
]);

const FRONTEND_SAME_DIR_ALIAS_IMPORTS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-same-dir-alias-imports-behavior-fixtures.mjs',
]);

const FRONTEND_BARREL_IMPORTS_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-barrel-imports-core.mjs',
]);

const FRONTEND_BARREL_IMPORTS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-barrel-imports-behavior-fixtures.mjs',
]);

const CREATOR_LIBRARY_CSV_CONTRACT_HELPER_FILES = new Set([
  'scripts/lib/frontend/creator-library-csv-contract-core.mjs',
]);

const CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_HELPER_FILES = new Set([
  'scripts/lib/frontend/creator-library-follow-log-contract-core.mjs',
]);

const FRONTEND_LAYER_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-layer-boundaries-core.mjs',
]);

const FRONTEND_LAYER_BOUNDARIES_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-layer-boundaries-behavior-fixtures.mjs',
]);

const FRONTEND_VITE_ROUTE_REGISTRY_HELPER_FILES = new Set([
  'scripts/lib/frontend/vite-route-registry-core.mjs',
]);

const FRONTEND_VITE_ROUTE_REGISTRY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/vite-route-registry-behavior-fixtures.mjs',
]);

export const FRONTEND_STRUCTURE_HELPER_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_REPORT_API_CONTRACT_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:report-api-contract', 'verify:frontend:report-api-contract-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend report API contract helper change',
  },
  {
    files: FRONTEND_REPORT_API_CONTRACT_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:report-api-contract-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend report API contract behavior fixture change',
  },
  {
    files: FRONTEND_MODULE_NAMES_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:module-names', 'verify:frontend:module-names-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend module names helper change',
  },
  {
    files: FRONTEND_MODULE_NAMES_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:module-names-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend module names behavior fixture change',
  },
  {
    files: FRONTEND_SAME_DIR_ALIAS_IMPORTS_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:same-dir-alias-imports', 'verify:frontend:same-dir-alias-imports-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend same-directory alias imports helper change',
  },
  {
    files: FRONTEND_SAME_DIR_ALIAS_IMPORTS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:same-dir-alias-imports-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend same-directory alias imports behavior fixture change',
  },
  {
    files: FRONTEND_BARREL_IMPORTS_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:barrel-imports', 'verify:frontend:barrel-imports-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend barrel imports helper change',
  },
  {
    files: FRONTEND_BARREL_IMPORTS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:barrel-imports-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend barrel imports behavior fixture change',
  },
  {
    files: CREATOR_LIBRARY_CSV_CONTRACT_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:creator-library-csv-contract', 'verify:frontend:structure-gate-registry'),
    reason: 'creator-library CSV contract helper change',
  },
  {
    files: CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:creator-library-follow-log-contract', 'verify:frontend:structure-gate-registry'),
    reason: 'creator-library follow log contract helper change',
  },
  {
    files: FRONTEND_LAYER_BOUNDARIES_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:layer-boundaries', 'verify:frontend:layer-boundaries-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend layer boundaries helper change',
  },
  {
    files: FRONTEND_LAYER_BOUNDARIES_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:layer-boundaries-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend layer boundaries behavior fixture change',
  },
  {
    files: FRONTEND_VITE_ROUTE_REGISTRY_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:vite-routes', 'verify:frontend:vite-routes-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'Vite route registry helper change',
  },
  {
    files: FRONTEND_VITE_ROUTE_REGISTRY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:vite-routes-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'Vite route registry behavior fixture change',
  },
]);
