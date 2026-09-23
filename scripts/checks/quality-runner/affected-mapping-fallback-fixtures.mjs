import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

const SAFE_FALLBACK_EXPECTED_GATES = [
  'lint:scripts',
  'type-check',
  'verify:backend:check',
  'verify:backend:fmt',
  'verify:backend:size',
  'verify:ci:generated',
  'verify:ci:manifest-order',
  'verify:ci:profiles',
  'verify:ci:release-version-bump',
  'verify:ci:wiring',
  'verify:frontend:delivery-gate-registry',
  'verify:frontend:preflight',
  'verify:frontend:structure-gate-registry',
  'verify:repo:naming',
  'verify:shell:syntax',
];

function assertSafeFallbackSelection({
  assertEqual,
  assertFalse,
  assertTrue,
  label,
  selection,
}) {
  assertEqual(selection.names.length, SAFE_FALLBACK_EXPECTED_GATES.length, `${label} should keep safe fallback gate count stable`);
  for (const name of SAFE_FALLBACK_EXPECTED_GATES) {
    assertTrue(selection.names.includes(name), `${label} should include ${name}`);
  }
  assertFalse(selection.names.includes('build'), `${label} should not run production frontend build`);
  assertFalse(selection.names.includes('verify:weekly:platform-tab-tmall-goods-section'), `${label} should not fan out to weekly behavior gates`);
}

export function assertFallbackAffectedMapping({
  assertEqual,
  assertFalse,
  assertTrue,
  registry,
}) {
  const noChangedFallback = selectAffectedGates(registry, []);
  assertSafeFallbackSelection({
    assertEqual,
    assertFalse,
    assertTrue,
    label: 'no changed files fallback',
    selection: noChangedFallback,
  });
  assertTrue(
    noChangedFallback.reasons['lint:scripts']?.includes('no changed files detected; running safe fallback') ?? false,
    'no changed files fallback should preserve explain reason',
  );

  const unknownPathFallback = selectAffectedGates(registry, ['unknown.txt']);
  assertSafeFallbackSelection({
    assertEqual,
    assertFalse,
    assertTrue,
    label: 'unknown path fallback',
    selection: unknownPathFallback,
  });
  assertTrue(
    unknownPathFallback.reasons['lint:scripts']?.includes('unknown.txt: unknown path safe fallback') ?? false,
    'unknown path fallback should preserve explain reason',
  );
}
