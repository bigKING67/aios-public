import {
  CI_META_GATES,
} from '../quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const INLINE_VISUAL_STYLE_AUDIT_HELPER_FILES = new Set([
  'scripts/lib/frontend/inline-visual-style-audit.mjs',
  'scripts/lib/frontend/inline-visual-style-audit-behavior.mjs',
  'scripts/lib/frontend/inline-visual-style-core.mjs',
  'scripts/lib/frontend/inline-visual-style-parser.mjs',
  'scripts/lib/frontend/inline-visual-style-runner.mjs',
]);

const FRONTEND_BEHAVIOR_GUARD_QUALITY_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-behavior-guard-quality-core.mjs',
]);

const FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-behavior-guard-quality-behavior-fixtures.mjs',
]);

const FRONTEND_DELIVERY_REGISTRY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-delivery-registry-behavior-fixtures.mjs',
]);

const FRONTEND_STRUCTURE_REGISTRY_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-structure-gate-registry-behavior-fixtures.mjs',
]);

const APP_PAGE_SIZE_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/app-page-size-behavior-fixtures.mjs',
]);

const APP_MODULE_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/frontend/app-module-boundaries-core.mjs',
]);

const APP_MODULE_BOUNDARIES_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/app-module-boundaries-behavior-fixtures.mjs',
]);

const RETIRED_FRONTEND_LEFTOVERS_HELPER_FILES = new Set([
  'scripts/lib/frontend/retired-frontend-leftovers-core.mjs',
]);

const RETIRED_FRONTEND_LEFTOVERS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/retired-frontend-leftovers-behavior-fixtures.mjs',
]);

const CSS_MODULE_SIZE_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/css-module-size-behavior-fixtures.mjs',
]);

const FRONTEND_COMPONENT_SIZE_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-component-size-core.mjs',
]);

const FRONTEND_COMPONENT_SIZE_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/frontend-component-size-behavior-fixtures.mjs',
]);

const COMPONENT_BOUNDARIES_HELPER_FILES = new Set([
  'scripts/lib/frontend/component-boundaries-core.mjs',
]);

const COMPONENT_BOUNDARIES_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/component-boundaries-behavior-fixtures.mjs',
]);

const COMPONENT_API_EXPORTS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/frontend/component-api-exports-behavior-fixtures.mjs',
]);

export const FRONTEND_SIZE_BOUNDARY_AFFECTED_RULES = Object.freeze([
  {
    files: APP_PAGE_SIZE_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:app:page-size', 'verify:app:page-size-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'app page size behavior fixture change',
  },
  {
    files: FRONTEND_COMPONENT_SIZE_HELPER_FILES,
    gates: ciScriptGates('verify:components:size', 'verify:components:size-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend component size helper change',
  },
  {
    files: FRONTEND_COMPONENT_SIZE_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:components:size', 'verify:components:size-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'frontend component size behavior fixture change',
  },
  {
    files: COMPONENT_BOUNDARIES_HELPER_FILES,
    gates: ciScriptGates('verify:components:boundaries', 'verify:components:boundaries-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'component boundaries helper change',
  },
  {
    files: COMPONENT_BOUNDARIES_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:components:boundaries', 'verify:components:boundaries-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'component boundaries behavior fixture change',
  },
  {
    files: COMPONENT_API_EXPORTS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:components:api-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'component API exports behavior fixture change',
  },
  {
    files: INLINE_VISUAL_STYLE_AUDIT_HELPER_FILES,
    gates: [
      ...CI_META_GATES,
      'verify:app:inline-styles',
      'verify:app:inline-styles-behavior',
      'verify:components:inline-styles',
      'verify:components:inline-styles-behavior',
      'verify:frontend:structure-gate-registry',
    ],
    reason: 'inline visual style audit helper change',
  },
]);

export const FRONTEND_MODULE_GOVERNANCE_AFFECTED_RULES = Object.freeze([
  {
    files: FRONTEND_BEHAVIOR_GUARD_QUALITY_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:behavior-guard-quality', 'verify:frontend:behavior-guard-quality-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend behavior guard quality helper change',
  },
  {
    files: FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:behavior-guard-quality-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'frontend behavior guard quality behavior fixture change',
  },
  {
    files: FRONTEND_DELIVERY_REGISTRY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:delivery-gate-registry', 'verify:frontend:delivery-gate-registry-behavior'),
    reason: 'frontend delivery registry behavior fixture change',
  },
  {
    files: FRONTEND_STRUCTURE_REGISTRY_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:structure-gate-registry', 'verify:frontend:structure-gate-registry-behavior'),
    reason: 'frontend structure registry behavior fixture change',
  },
  {
    files: APP_MODULE_BOUNDARIES_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:app:boundaries-behavior'),
    reason: 'app module boundaries behavior fixture change',
  },
  {
    files: RETIRED_FRONTEND_LEFTOVERS_HELPER_FILES,
    gates: ciScriptGates('verify:frontend:retired-leftovers', 'verify:frontend:retired-leftovers-behavior'),
    reason: 'retired frontend leftovers helper change',
  },
  {
    files: RETIRED_FRONTEND_LEFTOVERS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:frontend:retired-leftovers-behavior'),
    reason: 'retired frontend leftovers behavior fixture change',
  },
  {
    files: CSS_MODULE_SIZE_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:css-modules:size', 'verify:css-modules:size-behavior', 'verify:frontend:structure-gate-registry'),
    reason: 'CSS Module size behavior fixture change',
  },
  {
    files: APP_MODULE_BOUNDARIES_HELPER_FILES,
    gates: ciScriptGates('verify:app:boundaries', 'verify:app:boundaries-behavior'),
    reason: 'app module boundary helper change',
  },
]);
