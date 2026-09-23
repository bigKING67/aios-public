/**
 * Single source of truth for verify:ci self-check meta gates.
 *
 * These gates protect the top-level package.json scripts, generated
 * verify-ci.sh, and manifest-order contracts before heavier product gates run.
 */

export const VERIFY_CI_PACKAGE_WIRING_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:wiring-behavior',
  command: 'node scripts/checks/ci/package-wiring.behavior.mjs',
  file: 'scripts/checks/ci/package-wiring.behavior.mjs',
  label: '[verify:ci] verify-ci package wiring behavior',
});

export const VERIFY_CI_PACKAGE_WIRING_META_GATE = Object.freeze({
  name: 'verify:ci:wiring',
  command: 'node scripts/checks/ci/package-wiring.mjs',
  file: 'scripts/checks/ci/package-wiring.mjs',
  label: '[verify:ci] verify-ci package wiring',
});

export const VERIFY_CI_QUALITY_STATS_STEP_SUMMARY_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:quality-stats-step-summary-behavior',
  command: 'node scripts/checks/ci/quality-stats-step-summary.behavior.mjs',
  file: 'scripts/checks/ci/quality-stats-step-summary.behavior.mjs',
  label: '[verify:ci] quality stats step summary behavior',
});

export const VERIFY_CI_GUARD_UTILS_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:guard-utils-behavior',
  command: 'node scripts/checks/shared/guard-utils.behavior.mjs',
  file: 'scripts/checks/shared/guard-utils.behavior.mjs',
  label: '[verify:ci] check guard utils behavior',
});

export const VERIFY_CI_GATE_FIXTURE_UTILS_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:gate-fixture-utils-behavior',
  command: 'node scripts/checks/shared/gate-fixture-utils.behavior.mjs',
  file: 'scripts/checks/shared/gate-fixture-utils.behavior.mjs',
  label: '[verify:ci] gate fixture utils behavior',
});

export const VERIFY_CI_GENERATED_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:generated-behavior',
  command: 'node scripts/checks/ci/generated-wrapper.behavior.mjs',
  file: 'scripts/checks/ci/generated-wrapper.behavior.mjs',
  label: '[verify:ci] verify-ci generated script behavior',
});

export const VERIFY_CI_GENERATED_META_GATE = Object.freeze({
  name: 'verify:ci:generated',
  command: 'node scripts/checks/ci/generated-wrapper.mjs',
  file: 'scripts/checks/ci/generated-wrapper.mjs',
  label: '[verify:ci] verify-ci generated script',
});

export const VERIFY_CI_MANIFEST_ORDER_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:manifest-order-behavior',
  command: 'node scripts/checks/ci/manifest-order.behavior.mjs',
  file: 'scripts/checks/ci/manifest-order.behavior.mjs',
  label: '[verify:ci] verify-ci manifest order behavior',
});

export const VERIFY_CI_MANIFEST_ORDER_META_GATE = Object.freeze({
  name: 'verify:ci:manifest-order',
  command: 'node scripts/checks/ci/manifest-order.mjs',
  file: 'scripts/checks/ci/manifest-order.mjs',
  label: '[verify:ci] verify-ci manifest order',
});

export const VERIFY_CI_PROFILE_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:profiles-behavior',
  command: 'node scripts/checks/quality-runner/profiles.behavior.mjs',
  file: 'scripts/checks/quality-runner/profiles.behavior.mjs',
  label: '[verify:ci] quality profile behavior',
});

export const VERIFY_CI_PROFILE_META_GATE = Object.freeze({
  name: 'verify:ci:profiles',
  command: 'node scripts/checks/quality-runner/profiles.mjs',
  file: 'scripts/checks/quality-runner/profiles.mjs',
  label: '[verify:ci] quality profiles',
});

export const VERIFY_CI_RELEASE_VERSION_BUMP_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:ci:release-version-bump-behavior',
  command: 'node scripts/checks/ci/release-version-bump.behavior.mjs',
  file: 'scripts/checks/ci/release-version-bump.behavior.mjs',
  label: '[verify:ci] release version bump behavior',
});

export const VERIFY_CI_RELEASE_VERSION_BUMP_META_GATE = Object.freeze({
  name: 'verify:ci:release-version-bump',
  command: 'node scripts/checks/ci/release-version-bump.mjs',
  file: 'scripts/checks/ci/release-version-bump.mjs',
  label: '[verify:ci] release version bump',
});

export const VERIFY_CI_META_GATES = Object.freeze([
  VERIFY_CI_PACKAGE_WIRING_BEHAVIOR_META_GATE,
  VERIFY_CI_PACKAGE_WIRING_META_GATE,
  VERIFY_CI_QUALITY_STATS_STEP_SUMMARY_BEHAVIOR_META_GATE,
  VERIFY_CI_GUARD_UTILS_BEHAVIOR_META_GATE,
  VERIFY_CI_GATE_FIXTURE_UTILS_BEHAVIOR_META_GATE,
  VERIFY_CI_GENERATED_BEHAVIOR_META_GATE,
  VERIFY_CI_GENERATED_META_GATE,
  VERIFY_CI_MANIFEST_ORDER_BEHAVIOR_META_GATE,
  VERIFY_CI_MANIFEST_ORDER_META_GATE,
  VERIFY_CI_RELEASE_VERSION_BUMP_BEHAVIOR_META_GATE,
  VERIFY_CI_RELEASE_VERSION_BUMP_META_GATE,
  VERIFY_CI_PROFILE_BEHAVIOR_META_GATE,
  VERIFY_CI_PROFILE_META_GATE,
]);
