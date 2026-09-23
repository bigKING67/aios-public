const QUALITY_RUNNER_CACHE_KEY_INPUT_CONTRACT_SOURCE = 'scripts/lib/quality/quality-runner-cache-key-slice-inputs.mjs';

const QUALITY_RUNNER_CACHE_KEY_CORE_INPUTS = Object.freeze([
  QUALITY_RUNNER_CACHE_KEY_INPUT_CONTRACT_SOURCE,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-repo-scan.mjs',
]);

export const QUALITY_RUNNER_CACHE_KEY_DIGEST_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-key-digest.mjs',
  ...QUALITY_RUNNER_CACHE_KEY_CORE_INPUTS,
]);

export const QUALITY_RUNNER_CACHE_KEY_ENV_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-key-env.mjs',
  ...QUALITY_RUNNER_CACHE_KEY_CORE_INPUTS,
]);

export const QUALITY_RUNNER_CACHE_KEY_TOOL_VERSION_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-key-tool-version.mjs',
  ...QUALITY_RUNNER_CACHE_KEY_CORE_INPUTS,
]);
