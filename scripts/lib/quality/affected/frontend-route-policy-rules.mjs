import {
  CI_META_GATES,
} from '../quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const FRONTEND_AUTH_NAVIGATION_POLICY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/auth-navigation-policy-behavior-fixtures.mjs',
]);

const FRONTEND_AUTH_SESSION_RECOVERY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/auth-session-recovery-behavior-fixtures.mjs',
]);

const FRONTEND_PERMISSION_POLICY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-permission-policy-behavior-fixtures.mjs',
]);

const ROUTE_ACCESS_COVERAGE_HELPER_FILES = new Set([
  'scripts/lib/frontend/route-access-coverage-core.mjs',
]);

const ROUTE_ACCESS_COVERAGE_BEHAVIOR_HELPER_FILES = new Set([
  'scripts/lib/frontend/route-access-coverage-behavior-fixtures.mjs',
]);

const ROUTE_POLICY_REGISTRY_STRUCTURE_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/route-policy-registry-structure-behavior-fixtures.mjs',
]);

const ROUTE_POLICY_REGISTRY_STRUCTURE_HELPER_FILES = new Set([
  'scripts/lib/frontend/route-policy-registry-structure-core.mjs',
]);

const FRONTEND_VITE_ROUTE_PATHS_HELPER_FILES = new Set([
  'scripts/lib/frontend/vite-route-paths.mjs',
]);

const FRONTEND_VITE_ROUTE_PATHS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/vite-route-paths-behavior-fixtures.mjs',
]);

const PROTECTED_NAVIGATION_CONSISTENCY_HELPER_FILES = new Set([
  'scripts/lib/frontend/protected-navigation-consistency-check.mjs',
  'scripts/lib/frontend/protected-navigation-consistency-core.mjs',
]);

const FRONTEND_NAVIGATION_ROUTES_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-navigation-routes-core.mjs',
]);

const FRONTEND_NAVIGATION_ROUTES_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-navigation-routes-behavior-fixtures.mjs',
]);

export const FRONTEND_ROUTE_POLICY_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_AUTH_NAVIGATION_POLICY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:auth-navigation-policy', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend auth navigation policy behavior fixture change',
  },
  {
    files: FRONTEND_AUTH_SESSION_RECOVERY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:auth-session-recovery-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend auth session recovery behavior fixture change',
  },
  {
    files: FRONTEND_PERMISSION_POLICY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:permission-policy', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend permission policy behavior fixture change',
  },
  {
    files: ROUTE_ACCESS_COVERAGE_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:route-access', 'verify:frontend:route-access-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'route access coverage helper change',
  },
  {
    files: ROUTE_ACCESS_COVERAGE_BEHAVIOR_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:route-access-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'route access coverage behavior helper change',
  },
  {
    files: ROUTE_POLICY_REGISTRY_STRUCTURE_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:route-policy-registry-structure', 'verify:frontend:route-policy-registry-structure-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'route policy registry structure behavior fixture change',
  },
  {
    files: FRONTEND_VITE_ROUTE_PATHS_HELPER_FILES,
    gates: ciScriptGates(
      'verify:frontend:vite-route-paths-behavior',
      'verify:frontend:vite-routes',
      'verify:frontend:vite-routes-behavior',
      'verify:frontend:route-policy-registry-structure',
      'verify:frontend:route-policy-registry-structure-behavior',
      'verify:frontend:route-access',
      'verify:frontend:route-access-behavior',
      'verify:frontend:navigation-routes',
      'verify:frontend:navigation-routes-behavior',
      'verify:frontend:protected-navigation',
      'verify:frontend:structure-gate-registry',
    ),
    reason: 'Vite route path helper change',
  },
  {
    files: FRONTEND_VITE_ROUTE_PATHS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:vite-route-paths-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'Vite route path behavior fixture change',
  },
  {
    files: ROUTE_POLICY_REGISTRY_STRUCTURE_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:route-policy-registry-structure', 'verify:frontend:route-policy-registry-structure-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'route policy registry structure helper change',
  },
  {
    files: PROTECTED_NAVIGATION_CONSISTENCY_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:protected-navigation', 'verify:frontend:structure-gate-registry'),
    reason: 'protected navigation consistency helper change',
  },
  {
    files: FRONTEND_NAVIGATION_ROUTES_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:navigation-routes', 'verify:frontend:navigation-routes-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend navigation route helper change',
  },
  {
    files: FRONTEND_NAVIGATION_ROUTES_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:navigation-routes-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend navigation route behavior fixture change',
  },
]);
