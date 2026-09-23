import {
  CI_META_GATES,
} from '../quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const FRONTEND_BUILD_FINGERPRINT_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-build-fingerprint-behavior-fixtures.mjs',
]);

const FRONTEND_BUNDLE_BUDGET_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-bundle-budget-core.mjs',
]);

const FRONTEND_BUNDLE_BUDGET_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-bundle-budget-behavior-fixtures.mjs',
]);

const FRONTEND_PROD_CSS_INTEGRITY_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-prod-css-integrity-core.mjs',
]);

const FRONTEND_PREVIEW_CONTRACT_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-preview-contract-core.mjs',
]);

const FRONTEND_PREVIEW_CONTRACT_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-preview-contract-behavior-fixtures.mjs',
]);

const FRONTEND_DESIGN_EVOLUTION_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-design-evolution-core.mjs',
]);

const FRONTEND_DESIGN_EVOLUTION_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-design-evolution-behavior-fixtures.mjs',
]);

const FRONTEND_QUALITY_DOCS_DRIFT_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-quality-docs-drift-core.mjs',
]);

const FRONTEND_QUALITY_DOCS_DRIFT_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-quality-docs-drift-behavior-fixtures.mjs',
]);

const FRONTEND_COVERAGE_RATCHET_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-coverage-ratchet-core.mjs',
]);

const FRONTEND_COVERAGE_RATCHET_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-coverage-ratchet-behavior-fixtures.mjs',
]);

export const FRONTEND_DELIVERY_HELPER_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_COVERAGE_RATCHET_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:coverage-ratchet', 'verify:frontend:coverage-ratchet-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend coverage ratchet helper change',
  },
  {
    files: FRONTEND_COVERAGE_RATCHET_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:coverage-ratchet-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend coverage ratchet behavior fixture change',
  },
  {
    files: FRONTEND_BUILD_FINGERPRINT_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:build-fingerprint-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend build fingerprint behavior fixture change',
  },
  {
    files: FRONTEND_BUNDLE_BUDGET_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:bundle-budget', 'verify:frontend:bundle-budget-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend bundle budget helper change',
  },
  {
    files: FRONTEND_BUNDLE_BUDGET_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:bundle-budget', 'verify:frontend:bundle-budget-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend bundle budget behavior fixture change',
  },
  {
    files: FRONTEND_PROD_CSS_INTEGRITY_HELPER_FILES,
    gates: ciScriptGates(
      'verify:frontend:prod-css-integrity',
      'verify:frontend:prod-css-integrity-behavior',
      'verify:frontend:preview-contract',
      'verify:frontend:preview-contract-behavior',
      'verify:frontend:delivery-gate-registry',
    ),
    reason: 'frontend production CSS integrity helper change',
  },
  {
    files: FRONTEND_PREVIEW_CONTRACT_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:preview-contract', 'verify:frontend:preview-contract-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend preview contract helper change',
  },
  {
    files: FRONTEND_PREVIEW_CONTRACT_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:preview-contract', 'verify:frontend:preview-contract-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend preview contract behavior fixture change',
  },
  {
    files: FRONTEND_DESIGN_EVOLUTION_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:design-evolution', 'verify:frontend:design-evolution-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend design evolution helper change',
  },
  {
    files: FRONTEND_DESIGN_EVOLUTION_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:design-evolution-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend design evolution behavior fixture change',
  },
  {
    files: FRONTEND_QUALITY_DOCS_DRIFT_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:quality-docs-drift', 'verify:frontend:quality-docs-drift-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend quality docs drift helper change',
  },
  {
    files: FRONTEND_QUALITY_DOCS_DRIFT_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:quality-docs-drift-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend quality docs drift behavior fixture change',
  },
]);
