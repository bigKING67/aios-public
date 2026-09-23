/**
 * Single source of truth for frontend structure gates.
 *
 * Keep package scripts, verify:ci labels, and registry behavior fixtures in
 * sync by importing this list instead of copying it across guard scripts.
 */

import {
  FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE,
  FRONTEND_BEHAVIOR_QUALITY_META_GATE,
} from './frontend-behavior-quality-gates.mjs';

function nodeGate(name, file, label) {
  return Object.freeze({
    name,
    command: `node ${file}`,
    file,
    label,
  });
}

export const FRONTEND_STRUCTURE_GATES = Object.freeze([
  nodeGate('verify:app:boundaries', 'scripts/checks/app/module-boundaries.mjs', '[verify:ci] app module boundaries'),
  nodeGate('verify:app:boundaries-behavior', 'scripts/checks/app/module-boundaries.behavior.mjs', '[verify:ci] app module boundaries behavior'),
  nodeGate('verify:app:page-size-behavior', 'scripts/checks/app/page-size.behavior.mjs', '[verify:ci] app page size behavior'),
  nodeGate('verify:app:page-size', 'scripts/checks/app/page-size.mjs', '[verify:ci] app page size'),

  nodeGate('verify:frontend:retired-leftovers-behavior', 'scripts/checks/frontend-hygiene/retired-leftovers.behavior.mjs', '[verify:ci] retired frontend leftovers behavior'),
  nodeGate('verify:frontend:retired-leftovers', 'scripts/checks/frontend-hygiene/retired-leftovers.mjs', '[verify:ci] retired frontend leftovers'),
  nodeGate('verify:frontend:app-route-paths-behavior', 'scripts/checks/frontend-structure/app-route-paths.behavior.mjs', '[verify:ci] app route path helper behavior'),
  nodeGate('verify:frontend:vite-route-paths-behavior', 'scripts/checks/frontend-structure/vite-route-paths.behavior.mjs', '[verify:ci] Vite route path helper behavior'),
  nodeGate('verify:frontend:module-names-behavior', 'scripts/checks/frontend-structure/module-names.behavior.mjs', '[verify:ci] frontend module names behavior'),
  nodeGate('verify:frontend:module-names', 'scripts/checks/frontend-structure/module-names.mjs', '[verify:ci] frontend module names'),
  nodeGate('verify:frontend:same-dir-alias-imports-behavior', 'scripts/checks/frontend-structure/same-dir-alias-imports.behavior.mjs', '[verify:ci] frontend same-dir alias imports behavior'),
  nodeGate('verify:frontend:same-dir-alias-imports', 'scripts/checks/frontend-structure/same-dir-alias-imports.mjs', '[verify:ci] frontend same-dir alias imports'),
  nodeGate('verify:frontend:barrel-imports-behavior', 'scripts/checks/frontend-structure/barrel-imports.behavior.mjs', '[verify:ci] frontend barrel imports behavior'),
  nodeGate('verify:frontend:barrel-imports', 'scripts/checks/frontend-structure/barrel-imports.mjs', '[verify:ci] frontend barrel imports'),
  nodeGate('verify:frontend:layer-boundaries-behavior', 'scripts/checks/frontend-structure/layer-boundaries.behavior.mjs', '[verify:ci] frontend layer boundaries behavior'),
  nodeGate('verify:frontend:layer-boundaries', 'scripts/checks/frontend-structure/layer-boundaries.mjs', '[verify:ci] frontend layer boundaries'),
  nodeGate('verify:frontend:index-barrels-behavior', 'scripts/checks/frontend-structure/index-barrels.behavior.mjs', '[verify:ci] frontend index barrels behavior'),
  nodeGate('verify:frontend:index-barrels', 'scripts/checks/frontend-structure/index-barrels.mjs', '[verify:ci] frontend index barrels'),
  nodeGate('verify:frontend:vite-routes-behavior', 'scripts/checks/frontend-structure/vite-routes.behavior.mjs', '[verify:ci] Vite route registry behavior'),
  nodeGate('verify:frontend:vite-routes', 'scripts/checks/frontend-structure/vite-routes.mjs', '[verify:ci] Vite route registry'),
  nodeGate('verify:frontend:navigation-routes-behavior', 'scripts/checks/frontend-structure/navigation-routes.behavior.mjs', '[verify:ci] navigation route registry behavior'),
  nodeGate('verify:frontend:navigation-routes', 'scripts/checks/frontend-structure/navigation-routes.mjs', '[verify:ci] navigation route registry'),
  nodeGate('verify:frontend:route-policy-registry-behavior', 'scripts/checks/frontend-structure/route-policy-registry.behavior.mjs', '[verify:ci] route policy registry behavior'),
  nodeGate('verify:frontend:route-policy-registry-structure-behavior', 'scripts/checks/frontend-structure/route-policy-registry-structure.behavior.mjs', '[verify:ci] route policy registry structure behavior'),
  nodeGate('verify:frontend:route-policy-registry-structure', 'scripts/checks/frontend-structure/route-policy-registry-structure.mjs', '[verify:ci] route policy registry structure'),
  nodeGate('verify:frontend:route-access-behavior', 'scripts/checks/frontend-structure/route-access.behavior.mjs', '[verify:ci] route access coverage behavior'),
  nodeGate('verify:frontend:route-access', 'scripts/checks/frontend-structure/route-access.mjs', '[verify:ci] route access coverage'),
  nodeGate('verify:frontend:auth-navigation-policy', 'scripts/checks/frontend-structure/auth-navigation-policy.behavior.mjs', '[verify:ci] auth navigation policy behavior'),
  nodeGate('verify:frontend:auth-session-recovery-behavior', 'scripts/checks/frontend-structure/auth-session-recovery.behavior.mjs', '[verify:ci] auth session recovery behavior'),
  nodeGate('verify:frontend:permission-policy', 'scripts/checks/frontend-structure/permission-policy.behavior.mjs', '[verify:ci] frontend permission policy behavior'),
  nodeGate('verify:frontend:creator-library-csv-contract', 'scripts/checks/frontend-structure/creator-library-csv-contract.mjs', '[verify:ci] creator library CSV contract'),
  nodeGate('verify:frontend:creator-library-follow-log-contract', 'scripts/checks/frontend-structure/creator-library-follow-log-contract.mjs', '[verify:ci] creator library follow log contract'),
  nodeGate('verify:frontend:report-api-contract-behavior', 'scripts/checks/frontend-structure/report-api-contract.behavior.mjs', '[verify:ci] report API facade contract behavior'),
  nodeGate('verify:frontend:report-api-contract', 'scripts/checks/frontend-structure/report-api-contract.mjs', '[verify:ci] report API facade contract'),
  nodeGate('verify:frontend:protected-navigation', 'scripts/checks/frontend-structure/protected-navigation.mjs', '[verify:ci] protected navigation consistency'),
  nodeGate('verify:frontend:stale-phase-comments-behavior', 'scripts/checks/frontend-hygiene/stale-phase-comments.behavior.mjs', '[verify:ci] frontend stale phase comments behavior'),
  nodeGate('verify:frontend:stale-phase-comments', 'scripts/checks/frontend-hygiene/stale-phase-comments.mjs', '[verify:ci] frontend stale phase comments'),
  nodeGate('verify:frontend:unowned-debt-comments-behavior', 'scripts/checks/frontend-hygiene/unowned-debt-comments.behavior.mjs', '[verify:ci] frontend unowned debt comments behavior'),
  nodeGate('verify:frontend:unowned-debt-comments', 'scripts/checks/frontend-hygiene/unowned-debt-comments.mjs', '[verify:ci] frontend unowned debt comments'),

  nodeGate('verify:app:inline-styles', 'scripts/checks/app/inline-visual-styles.mjs', '[verify:ci] app inline visual styles'),
  nodeGate('verify:app:inline-styles-behavior', 'scripts/checks/app/inline-visual-styles.behavior.mjs', '[verify:ci] app inline visual styles behavior'),

  nodeGate('verify:components:api', 'scripts/checks/components/api-exports.mjs', '[verify:ci] component API exports'),
  nodeGate('verify:components:api-behavior', 'scripts/checks/components/api-exports.behavior.mjs', '[verify:ci] component API exports behavior'),
  nodeGate('verify:components:boundaries', 'scripts/checks/components/boundaries.mjs', '[verify:ci] component boundaries'),
  nodeGate('verify:components:boundaries-behavior', 'scripts/checks/components/boundaries.behavior.mjs', '[verify:ci] component boundaries behavior'),
  nodeGate('verify:components:inline-styles', 'scripts/checks/components/inline-visual-styles.mjs', '[verify:ci] component inline visual styles'),
  nodeGate('verify:components:inline-styles-behavior', 'scripts/checks/components/inline-visual-styles.behavior.mjs', '[verify:ci] component inline visual styles behavior'),
  nodeGate('verify:components:size', 'scripts/checks/components/size.mjs', '[verify:ci] frontend component size'),
  nodeGate('verify:components:size-behavior', 'scripts/checks/components/size.behavior.mjs', '[verify:ci] frontend component size behavior'),

  nodeGate('verify:css-modules:size', 'scripts/checks/css-modules/size.mjs', '[verify:ci] CSS Module size'),
  nodeGate('verify:css-modules:size-behavior', 'scripts/checks/css-modules/size.behavior.mjs', '[verify:ci] CSS Module size behavior'),
]);

export const FRONTEND_STRUCTURE_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:frontend:structure-gate-registry-behavior',
  command: 'node scripts/checks/frontend-structure/gate-registry.behavior.mjs',
  file: 'scripts/checks/frontend-structure/gate-registry.behavior.mjs',
  label: '[verify:ci] frontend structure gate registry behavior',
});

export const FRONTEND_STRUCTURE_REGISTRY_META_GATE = Object.freeze({
  name: 'verify:frontend:structure-gate-registry',
  command: 'node scripts/checks/frontend-structure/gate-registry.mjs',
  file: 'scripts/checks/frontend-structure/gate-registry.mjs',
  label: '[verify:ci] frontend structure gate registry',
});

export const FRONTEND_STRUCTURE_EXPECTED_GATES = Object.freeze([
  ...FRONTEND_STRUCTURE_GATES,
  FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE,
  FRONTEND_BEHAVIOR_QUALITY_META_GATE,
  FRONTEND_STRUCTURE_BEHAVIOR_META_GATE,
  FRONTEND_STRUCTURE_REGISTRY_META_GATE,
]);
