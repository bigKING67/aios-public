export const CI_BEHAVIOR_FIXTURE_GATES_BY_FILE = new Map([
  ['scripts/lib/ci/package-wiring-core.mjs', {
    gates: ['verify:ci:wiring-behavior', 'verify:ci:wiring'],
    reason: 'CI package wiring core change',
  }],
  ['scripts/lib/ci/package-wiring-behavior-fixtures.mjs', {
    gates: ['verify:ci:wiring-behavior', 'verify:ci:wiring'],
    reason: 'CI package wiring behavior fixture change',
  }],
  ['scripts/lib/ci/quality-workflow-contract-core.mjs', {
    gates: ['verify:ci:wiring-behavior', 'verify:ci:wiring', 'verify:quality-runner:cache-remote-config'],
    reason: 'CI quality workflow contract core change',
  }],
  ['scripts/lib/ci/verify-ci-manifest-order-core.mjs', {
    gates: ['verify:ci:manifest-order-behavior', 'verify:ci:manifest-order'],
    reason: 'CI manifest order core change',
  }],
  ['scripts/lib/ci/verify-ci-manifest-order-behavior-fixtures.mjs', {
    gates: ['verify:ci:manifest-order-behavior', 'verify:ci:manifest-order'],
    reason: 'CI manifest order behavior fixture change',
  }],
]);
