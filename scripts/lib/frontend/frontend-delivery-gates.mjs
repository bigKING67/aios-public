/**
 * Single source of truth for frontend delivery/tooling gates.
 *
 * These gates are not page-structure rules, but they are part of the frontend
 * delivery contract: token mirrors, token sync, and vendored frontend preflight
 * must stay visible as frontend-owned quality gates.
 */

export const FRONTEND_DELIVERY_GATES = Object.freeze([
  {
    name: 'verify:design:mirror',
    command: 'node scripts/checks/frontend/design-token-mirror-sync.mjs',
    file: 'scripts/checks/frontend/design-token-mirror-sync.mjs',
    label: '[verify:ci] design token mirror sync',
  },
  {
    name: 'verify:design:tokens',
    command: 'node scripts/checks/frontend/design-token-color-sync.mjs',
    file: 'scripts/checks/frontend/design-token-color-sync.mjs',
    label: '[verify:ci] design token sync',
  },
  {
    name: 'verify:design:runtime-tokens',
    command: 'node scripts/checks/frontend/design-runtime-token-sync.mjs',
    file: 'scripts/checks/frontend/design-runtime-token-sync.mjs',
    label: '[verify:ci] design runtime token sync',
  },
  {
    name: 'verify:frontend:preflight',
    command: 'bash scripts/verify-frontend-preflight.sh',
    file: 'scripts/verify-frontend-preflight.sh',
    label: '[verify:ci] frontend preflight (vendor)',
  },
  {
    name: 'verify:frontend:coverage-ratchet',
    command: 'node scripts/checks/frontend/coverage-ratchet.mjs',
    file: 'scripts/checks/frontend/coverage-ratchet.mjs',
    label: '[verify:ci] frontend coverage ratchet',
  },
  {
    name: 'verify:frontend:bundle-budget',
    command: 'node scripts/checks/frontend/bundle-budget.mjs',
    file: 'scripts/checks/frontend/bundle-budget.mjs',
    label: '[verify:ci] frontend bundle budget',
  },
  {
    name: 'verify:frontend:quality-docs-drift',
    command: 'node scripts/checks/frontend/quality-docs-drift.mjs',
    file: 'scripts/checks/frontend/quality-docs-drift.mjs',
    label: '[verify:ci] frontend quality docs drift',
  },
]);

export const FRONTEND_DELIVERY_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:frontend:delivery-gate-registry-behavior',
  command: 'node scripts/checks/frontend/delivery-registry.behavior.mjs',
  file: 'scripts/checks/frontend/delivery-registry.behavior.mjs',
  label: '[verify:ci] frontend delivery gate registry behavior',
});

export const FRONTEND_DELIVERY_REGISTRY_META_GATE = Object.freeze({
  name: 'verify:frontend:delivery-gate-registry',
  command: 'node scripts/checks/frontend/delivery-registry.mjs',
  file: 'scripts/checks/frontend/delivery-registry.mjs',
  label: '[verify:ci] frontend delivery gate registry',
});

export const FRONTEND_DELIVERY_RUNTIME_TOKEN_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:design:runtime-tokens-behavior',
  command: 'node scripts/checks/frontend/design-runtime-token-sync.behavior.mjs',
  file: 'scripts/checks/frontend/design-runtime-token-sync.behavior.mjs',
  label: '[verify:ci] design runtime token sync behavior',
});

export const FRONTEND_DELIVERY_BUNDLE_BUDGET_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:bundle-budget-behavior',
  command: 'node scripts/checks/frontend/bundle-budget.behavior.mjs',
  file: 'scripts/checks/frontend/bundle-budget.behavior.mjs',
  label: '[verify:ci] frontend bundle budget behavior',
});

export const FRONTEND_DELIVERY_BUILD_FINGERPRINT_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:build-fingerprint-behavior',
  command: 'node scripts/checks/frontend/build-fingerprint.behavior.mjs',
  file: 'scripts/checks/frontend/build-fingerprint.behavior.mjs',
  label: '[verify:ci] frontend build fingerprint behavior',
});

export const FRONTEND_DELIVERY_SMOKE_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:smoke-behavior',
  command: 'node scripts/checks/frontend/smoke.behavior.mjs',
  file: 'scripts/checks/frontend/smoke.behavior.mjs',
  label: '[verify:ci] frontend smoke behavior',
});

export const FRONTEND_DELIVERY_COVERAGE_RATCHET_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:coverage-ratchet-behavior',
  command: 'node scripts/checks/frontend/coverage-ratchet.behavior.mjs',
  file: 'scripts/checks/frontend/coverage-ratchet.behavior.mjs',
  label: '[verify:ci] frontend coverage ratchet behavior',
});

export const FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:prod-css-integrity-behavior',
  command: 'node scripts/checks/frontend/prod-css-integrity.behavior.mjs',
  file: 'scripts/checks/frontend/prod-css-integrity.behavior.mjs',
  label: '[verify:ci] frontend production CSS integrity behavior',
});

export const FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_GATE = Object.freeze({
  name: 'verify:frontend:prod-css-integrity',
  command: 'node scripts/checks/frontend/prod-css-integrity.mjs',
  file: 'scripts/checks/frontend/prod-css-integrity.mjs',
  label: '[verify:ci] frontend production CSS integrity',
});

export const FRONTEND_DELIVERY_PREVIEW_CONTRACT_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:preview-contract-behavior',
  command: 'node scripts/checks/frontend/preview-contract.behavior.mjs',
  file: 'scripts/checks/frontend/preview-contract.behavior.mjs',
  label: '[verify:ci] frontend preview contract behavior',
});

export const FRONTEND_DELIVERY_PREVIEW_CONTRACT_GATE = Object.freeze({
  name: 'verify:frontend:preview-contract',
  command: 'node scripts/checks/frontend/preview-contract.mjs',
  file: 'scripts/checks/frontend/preview-contract.mjs',
  label: '[verify:ci] frontend preview contract',
});

export const FRONTEND_DELIVERY_QUALITY_DOCS_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:quality-docs-drift-behavior',
  command: 'node scripts/checks/frontend/quality-docs-drift.behavior.mjs',
  file: 'scripts/checks/frontend/quality-docs-drift.behavior.mjs',
  label: '[verify:ci] frontend quality docs drift behavior',
});

export const FRONTEND_DELIVERY_DESIGN_EVOLUTION_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:frontend:design-evolution-behavior',
  command: 'node scripts/checks/frontend/design-evolution.behavior.mjs',
  file: 'scripts/checks/frontend/design-evolution.behavior.mjs',
  label: '[verify:ci] frontend design evolution behavior',
});

export const FRONTEND_DELIVERY_DESIGN_EVOLUTION_GATE = Object.freeze({
  name: 'verify:frontend:design-evolution',
  command: 'node scripts/checks/frontend/design-evolution.mjs',
  file: 'scripts/checks/frontend/design-evolution.mjs',
  label: '[verify:ci] frontend design evolution',
});

function frontendDeliveryGate(name) {
  const gate = FRONTEND_DELIVERY_GATES.find((candidate) => candidate.name === name);
  if (!gate) {
    throw new Error(`FRONTEND_DELIVERY_GATES is missing required gate: ${name}`);
  }
  return gate;
}

export const FRONTEND_DELIVERY_EXPECTED_GATES = Object.freeze([
  frontendDeliveryGate('verify:design:mirror'),
  frontendDeliveryGate('verify:design:tokens'),
  FRONTEND_DELIVERY_RUNTIME_TOKEN_BEHAVIOR_GATE,
  frontendDeliveryGate('verify:design:runtime-tokens'),
  FRONTEND_DELIVERY_BUILD_FINGERPRINT_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_BUNDLE_BUDGET_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_SMOKE_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_COVERAGE_RATCHET_BEHAVIOR_GATE,
  frontendDeliveryGate('verify:frontend:coverage-ratchet'),
  FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_PREVIEW_CONTRACT_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_QUALITY_DOCS_BEHAVIOR_GATE,
  frontendDeliveryGate('verify:frontend:quality-docs-drift'),
  FRONTEND_DELIVERY_DESIGN_EVOLUTION_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_DESIGN_EVOLUTION_GATE,
  FRONTEND_DELIVERY_BEHAVIOR_META_GATE,
  FRONTEND_DELIVERY_REGISTRY_META_GATE,
  FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_GATE,
  FRONTEND_DELIVERY_PREVIEW_CONTRACT_GATE,
  frontendDeliveryGate('verify:frontend:bundle-budget'),
  frontendDeliveryGate('verify:frontend:preflight'),
]);
