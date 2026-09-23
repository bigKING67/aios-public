/**
 * Single source of truth for non-weekly frontend behavior guard quality gates.
 *
 * Weekly behavior guards have their own domain-specific quality audit. This
 * list covers the remaining frontend/design/CI behavior guards that should be
 * backed by temp-repo runtime execution or structural parsing. New check
 * commands may live under scripts/checks/<domain>/ and use *.behavior.mjs.
 */

export const FRONTEND_BEHAVIOR_QUALITY_FILE_PATTERN = /^scripts\/checks\/(?!weekly(?:\/|-tabs\/)).+\.behavior\.mjs$/;

export const FRONTEND_BEHAVIOR_QUALITY_META_GATE = Object.freeze({
  name: 'verify:frontend:behavior-guard-quality',
  command: 'node scripts/checks/frontend/behavior-guard-quality.mjs',
  file: 'scripts/checks/frontend/behavior-guard-quality.mjs',
  label: '[verify:ci] frontend behavior guard quality',
});

export const FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:frontend:behavior-guard-quality-behavior',
  command: 'node scripts/checks/frontend/behavior-guard-quality.behavior.mjs',
  file: 'scripts/checks/frontend/behavior-guard-quality.behavior.mjs',
  label: '[verify:ci] frontend behavior guard quality behavior',
});

export const FRONTEND_BEHAVIOR_QUALITY_EXPECTED_GATES = Object.freeze([
  FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE,
  FRONTEND_BEHAVIOR_QUALITY_META_GATE,
]);
