import {
  FRONTEND_PREFLIGHT_CACHE_HELPER_INPUTS,
} from '../quality-runner-preflight-slice-inputs.mjs';

function buildFingerprintBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/build-fingerprint.behavior.mjs',
    'scripts/lib/frontend/frontend-build-fingerprint.mjs',
    'scripts/lib/frontend/frontend-build-fingerprint-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function bundleBudgetInputs({ scriptInputs, shared }) {
  return [
    '@frontendBuildSource',
    '@viteConfig',
    '@tsConfig',
    'apps/web-vite/dist/**',
    'scripts/config/frontend/bundle-budget.json',
    'scripts/lib/frontend/frontend-bundle-budget-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function bundleBudgetBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/bundle-budget.behavior.mjs',
    'scripts/checks/frontend/bundle-budget.mjs',
    'scripts/lib/frontend/frontend-bundle-budget-core.mjs',
    'scripts/lib/frontend/frontend-bundle-budget-behavior-fixtures.mjs',
    'scripts/lib/frontend/frontend-build-fingerprint.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function prodCssIntegrityInputs({ scriptInputs, shared }) {
  return [
    '@frontendSource',
    '@viteConfig',
    '@tsConfig',
    'apps/web-vite/dist/**',
    'scripts/lib/frontend/frontend-prod-css-integrity-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function prodCssIntegrityBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/prod-css-integrity.behavior.mjs',
    'scripts/checks/frontend/prod-css-integrity.mjs',
    'scripts/lib/frontend/frontend-prod-css-integrity-core.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function previewContractInputs({ scriptInputs, shared }) {
  return [
    '@frontendBuildSource',
    '@viteConfig',
    '@tsConfig',
    'apps/web-vite/dist/**',
    'scripts/lib/frontend/frontend-build-fingerprint.mjs',
    'scripts/lib/frontend/frontend-preview-contract-core.mjs',
    'scripts/lib/frontend/frontend-prod-css-integrity-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function previewContractBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/preview-contract.behavior.mjs',
    'scripts/checks/frontend/preview-contract.mjs',
    'scripts/lib/frontend/frontend-build-fingerprint.mjs',
    'scripts/lib/frontend/frontend-preview-contract-core.mjs',
    'scripts/lib/frontend/frontend-preview-contract-behavior-fixtures.mjs',
    'scripts/lib/frontend/frontend-prod-css-integrity-core.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function preflightInputs({ scriptInputs, shared }) {
  return [
    'tools/vendor/frontend-preflight/**',
    ...FRONTEND_PREFLIGHT_CACHE_HELPER_INPUTS,
    ...scriptInputs,
    ...shared,
  ];
}

function smokeBehaviorInputs({ scriptInputs, shared }) {
  return [
    'scripts/config/frontend/smoke-routes.json',
    'scripts/frontend/smoke-frontend-routes.mjs',
    'scripts/lib/frontend/smoke/**',
    ...scriptInputs,
    ...shared,
  ];
}

function coverageRatchetInputs({ scriptInputs, shared }) {
  return [
    '@frontendSource',
    'apps/web-vite/vitest.config.ts',
    'apps/web-vite/vitest.coverage.config.ts',
    'scripts/config/frontend/coverage-ratchet.json',
    'scripts/lib/frontend/frontend-coverage-ratchet-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function coverageRatchetBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/coverage-ratchet.behavior.mjs',
    'scripts/checks/frontend/coverage-ratchet.mjs',
    'scripts/config/frontend/coverage-ratchet.json',
    'scripts/lib/frontend/frontend-coverage-ratchet-core.mjs',
    'scripts/lib/frontend/frontend-coverage-ratchet-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function deliveryGateRegistryInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/verify-ci.sh',
    'scripts/lib/frontend/frontend-gate-registry-audit.mjs',
    'scripts/lib/frontend/frontend-delivery-gates.mjs',
    'scripts/checks/frontend/delivery-registry.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend/delivery-registry.behavior.mjs',
        'scripts/lib/frontend/frontend-delivery-registry-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function designEvolutionInputs({ scriptInputs, shared }) {
  return [
    '@designEvolutionAuthority',
    'scripts/lib/frontend/frontend-design-evolution-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function designEvolutionBehaviorInputs({ checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend/design-evolution.behavior.mjs',
    'scripts/lib/frontend/frontend-design-evolution-behavior-fixtures.mjs',
    'scripts/lib/frontend/frontend-design-evolution-core.mjs',
    'scripts/lib/shared/gate-fixture-utils.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

const FRONTEND_DELIVERY_INPUT_BUILDERS = Object.freeze({
  'verify:frontend:build-fingerprint-behavior': buildFingerprintBehaviorInputs,
  'verify:frontend:bundle-budget': bundleBudgetInputs,
  'verify:frontend:bundle-budget-behavior': bundleBudgetBehaviorInputs,
  'verify:frontend:prod-css-integrity': prodCssIntegrityInputs,
  'verify:frontend:prod-css-integrity-behavior': prodCssIntegrityBehaviorInputs,
  'verify:frontend:preview-contract': previewContractInputs,
  'verify:frontend:preview-contract-behavior': previewContractBehaviorInputs,
  'verify:frontend:preflight': preflightInputs,
  'verify:frontend:smoke-behavior': smokeBehaviorInputs,
  'verify:frontend:coverage-ratchet': coverageRatchetInputs,
  'verify:frontend:coverage-ratchet-behavior': coverageRatchetBehaviorInputs,
  'verify:frontend:delivery-gate-registry': deliveryGateRegistryInputs,
  'verify:frontend:delivery-gate-registry-behavior': deliveryGateRegistryInputs,
  'verify:frontend:design-evolution': designEvolutionInputs,
  'verify:frontend:design-evolution-behavior': designEvolutionBehaviorInputs,
});

export function frontendDeliveryGateInputPatterns(name, context) {
  const builder = FRONTEND_DELIVERY_INPUT_BUILDERS[name];
  if (!builder) {
    return null;
  }
  return name === 'verify:frontend:delivery-gate-registry'
    || name === 'verify:frontend:delivery-gate-registry-behavior'
    ? builder(name, context)
    : builder(context);
}
