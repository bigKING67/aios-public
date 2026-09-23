import {
  CI_META_GATES,
} from '../quality-affected-gates.mjs';
import {
  FRONTEND_DELIVERY_HELPER_AFFECTED_RULES,
} from './frontend-delivery-helper-rules.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const FRONTEND_DESIGN_TOKEN_COLOR_SYNC_HELPER_FILES = new Set([
  'scripts/lib/frontend/frontend-design-token-color-sync-core.mjs',
]);

const DESIGN_TOKEN_MIRROR_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/design-token-mirror-sync-core.mjs',
]);

const DESIGN_RUNTIME_TOKEN_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/design-runtime-token-sync-core.mjs',
]);

const DESIGN_RUNTIME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/design-runtime-token-sync-behavior-fixtures.mjs',
]);

const DESIGN_TOKEN_VALUES_SYNC_HELPER_FILES = new Set([
  'scripts/lib/design/design-token-values-sync-core.mjs',
]);

const DESIGN_TOKEN_VALUES_SYNC_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/design-token-values-sync-behavior-fixtures.mjs',
]);

const CSS_MODULE_TYPOGRAPHY_VALUE_HELPER_FILES = new Set([
  'scripts/lib/design/css-module-typography-values-core.mjs',
]);

const DESIGN_DOCS_DRIFT_HELPER_FILES = new Set([
  'scripts/lib/design/design-docs-drift-core.mjs',
]);

const DESIGN_DOCS_DRIFT_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/design/design-docs-drift-behavior-fixtures.mjs',
]);

export const FRONTEND_DESIGN_HELPER_AFFECTED_RULES = Object.freeze([
  ...FRONTEND_DELIVERY_HELPER_AFFECTED_RULES,
  {
    files: FRONTEND_DESIGN_TOKEN_COLOR_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:tokens', 'verify:design:behavior-gate-registry'),
    reason: 'frontend design token color sync helper change',
  },
  {
    files: DESIGN_TOKEN_MIRROR_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:mirror', 'verify:frontend:delivery-gate-registry'),
    reason: 'design token mirror sync helper change',
  },
  {
    files: DESIGN_RUNTIME_TOKEN_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:runtime-tokens', 'verify:design:runtime-tokens-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'design runtime token sync helper change',
  },
  {
    files: DESIGN_RUNTIME_TOKEN_SYNC_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:runtime-tokens-behavior', 'verify:frontend:delivery-gate-registry'),
    reason: 'design runtime token sync behavior fixture change',
  },
  {
    files: DESIGN_TOKEN_VALUES_SYNC_HELPER_FILES,
    gates: ciScriptGates('verify:design:token-values-sync', 'verify:design:token-values-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design token values sync helper change',
  },
  {
    files: CSS_MODULE_TYPOGRAPHY_VALUE_HELPER_FILES,
    gates: ciScriptGates('verify:design:typography', 'verify:design:behavior-gate-registry'),
    reason: 'CSS Module typography value helper change',
  },
  {
    files: DESIGN_TOKEN_VALUES_SYNC_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:token-values-sync-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design token values sync behavior fixture change',
  },
  {
    files: DESIGN_DOCS_DRIFT_HELPER_FILES,
    gates: ciScriptGates('verify:design:docs', 'verify:design:docs-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design docs drift helper change',
  },
  {
    files: DESIGN_DOCS_DRIFT_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:design:docs-behavior', 'verify:design:behavior-gate-registry'),
    reason: 'design docs drift behavior fixture change',
  },
]);
