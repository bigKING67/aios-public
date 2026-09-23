const QUALITY_RUNNER_PREFLIGHT_INPUT_CONTRACT_SOURCE = 'scripts/lib/quality/quality-runner-preflight-slice-inputs.mjs';

export const FRONTEND_PREFLIGHT_CACHE_HELPER_INPUTS = Object.freeze([
  'scripts/lib/frontend/frontend-preflight-cache.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-command.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-manifest.mjs',
  'scripts/lib/frontend/frontend-preflight-cache-store.mjs',
]);

const QUALITY_RUNNER_PREFLIGHT_CACHE_INPUTS = Object.freeze([
  QUALITY_RUNNER_PREFLIGHT_INPUT_CONTRACT_SOURCE,
  'scripts/verify-frontend-preflight.sh',
  ...FRONTEND_PREFLIGHT_CACHE_HELPER_INPUTS,
  'tools/vendor/frontend-preflight/**',
]);

export const QUALITY_RUNNER_PREFLIGHT_CACHE_KEY_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/preflight-cache-key.mjs',
  ...QUALITY_RUNNER_PREFLIGHT_CACHE_INPUTS,
]);

export const QUALITY_RUNNER_PREFLIGHT_CACHE_WRAPPER_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/preflight-cache-wrapper.mjs',
  ...QUALITY_RUNNER_PREFLIGHT_CACHE_INPUTS,
]);
