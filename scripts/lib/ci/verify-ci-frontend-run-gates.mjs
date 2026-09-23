import { FRONTEND_STRUCTURE_EXPECTED_GATES } from '../frontend/frontend-structure-gates.mjs';
import {
  FRONTEND_DELIVERY_EXPECTED_GATES,
} from '../frontend/frontend-delivery-gates.mjs';
import {
  makeGateFinder,
} from './verify-ci-run-gate-utils.mjs';

const frontendStructureGate = makeGateFinder(
  FRONTEND_STRUCTURE_EXPECTED_GATES,
  'FRONTEND_STRUCTURE_EXPECTED_GATES',
);
const frontendDeliveryGate = makeGateFinder(
  FRONTEND_DELIVERY_EXPECTED_GATES,
  'FRONTEND_DELIVERY_EXPECTED_GATES',
);

export const FRONTEND_EARLY_STRUCTURE_RUN_GATES = Object.freeze([
  frontendStructureGate('verify:app:boundaries'),
  frontendStructureGate('verify:app:boundaries-behavior'),
  frontendStructureGate('verify:app:page-size-behavior'),
  frontendStructureGate('verify:app:page-size'),
  frontendStructureGate('verify:frontend:retired-leftovers-behavior'),
  frontendStructureGate('verify:frontend:retired-leftovers'),
  frontendStructureGate('verify:frontend:app-route-paths-behavior'),
  frontendStructureGate('verify:frontend:vite-route-paths-behavior'),
  frontendStructureGate('verify:frontend:module-names-behavior'),
  frontendStructureGate('verify:frontend:module-names'),
  frontendStructureGate('verify:frontend:same-dir-alias-imports-behavior'),
  frontendStructureGate('verify:frontend:same-dir-alias-imports'),
  frontendStructureGate('verify:frontend:barrel-imports-behavior'),
  frontendStructureGate('verify:frontend:barrel-imports'),
  frontendStructureGate('verify:frontend:layer-boundaries-behavior'),
  frontendStructureGate('verify:frontend:layer-boundaries'),
  frontendStructureGate('verify:frontend:index-barrels-behavior'),
  frontendStructureGate('verify:frontend:index-barrels'),
  frontendStructureGate('verify:frontend:vite-routes-behavior'),
  frontendStructureGate('verify:frontend:vite-routes'),
  frontendStructureGate('verify:frontend:navigation-routes-behavior'),
  frontendStructureGate('verify:frontend:navigation-routes'),
  frontendStructureGate('verify:frontend:route-policy-registry-behavior'),
  frontendStructureGate('verify:frontend:route-policy-registry-structure-behavior'),
  frontendStructureGate('verify:frontend:route-policy-registry-structure'),
  frontendStructureGate('verify:frontend:route-access-behavior'),
  frontendStructureGate('verify:frontend:route-access'),
  frontendStructureGate('verify:frontend:auth-navigation-policy'),
  frontendStructureGate('verify:frontend:auth-session-recovery-behavior'),
  frontendStructureGate('verify:frontend:permission-policy'),
  frontendStructureGate('verify:frontend:creator-library-csv-contract'),
  frontendStructureGate('verify:frontend:creator-library-follow-log-contract'),
  frontendStructureGate('verify:frontend:report-api-contract-behavior'),
  frontendStructureGate('verify:frontend:report-api-contract'),
  frontendStructureGate('verify:frontend:protected-navigation'),
  frontendStructureGate('verify:frontend:stale-phase-comments-behavior'),
  frontendStructureGate('verify:frontend:stale-phase-comments'),
  frontendStructureGate('verify:frontend:unowned-debt-comments-behavior'),
  frontendStructureGate('verify:frontend:unowned-debt-comments'),
]);

export const FRONTEND_LATE_STRUCTURE_RUN_GATES = Object.freeze([
  frontendStructureGate('verify:app:inline-styles'),
  frontendStructureGate('verify:app:inline-styles-behavior'),
  frontendStructureGate('verify:components:api'),
  frontendStructureGate('verify:components:api-behavior'),
  frontendStructureGate('verify:components:boundaries'),
  frontendStructureGate('verify:components:boundaries-behavior'),
  frontendStructureGate('verify:components:inline-styles'),
  frontendStructureGate('verify:components:inline-styles-behavior'),
  frontendStructureGate('verify:components:size'),
  frontendStructureGate('verify:components:size-behavior'),
  frontendStructureGate('verify:css-modules:size'),
  frontendStructureGate('verify:css-modules:size-behavior'),
  frontendStructureGate('verify:frontend:behavior-guard-quality-behavior'),
  frontendStructureGate('verify:frontend:behavior-guard-quality'),
  frontendStructureGate('verify:frontend:structure-gate-registry-behavior'),
  frontendStructureGate('verify:frontend:structure-gate-registry'),
]);

export const FRONTEND_DELIVERY_RUN_GATES = Object.freeze([
  frontendDeliveryGate('verify:design:mirror'),
  frontendDeliveryGate('verify:design:tokens'),
  frontendDeliveryGate('verify:design:runtime-tokens-behavior'),
  frontendDeliveryGate('verify:design:runtime-tokens'),
  frontendDeliveryGate('verify:frontend:build-fingerprint-behavior'),
  frontendDeliveryGate('verify:frontend:bundle-budget-behavior'),
  frontendDeliveryGate('verify:frontend:smoke-behavior'),
  frontendDeliveryGate('verify:frontend:coverage-ratchet-behavior'),
  frontendDeliveryGate('verify:frontend:coverage-ratchet'),
  frontendDeliveryGate('verify:frontend:prod-css-integrity-behavior'),
  frontendDeliveryGate('verify:frontend:preview-contract-behavior'),
  frontendDeliveryGate('verify:frontend:quality-docs-drift-behavior'),
  frontendDeliveryGate('verify:frontend:quality-docs-drift'),
  frontendDeliveryGate('verify:frontend:design-evolution-behavior'),
  frontendDeliveryGate('verify:frontend:design-evolution'),
  frontendDeliveryGate('verify:frontend:delivery-gate-registry-behavior'),
  frontendDeliveryGate('verify:frontend:delivery-gate-registry'),
]);

export const FRONTEND_DELIVERY_TERMINAL_RUN_GATES = Object.freeze([
  frontendDeliveryGate('verify:frontend:bundle-budget'),
  frontendDeliveryGate('verify:frontend:prod-css-integrity'),
  frontendDeliveryGate('verify:frontend:preview-contract'),
]);

export const FRONTEND_POST_SHELL_RUN_GATES = Object.freeze([
  frontendDeliveryGate('verify:frontend:preflight'),
]);
