import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertReleaseAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const releaseVersionBumpCheck = selectAffectedGates(registry, ['scripts/checks/ci/release-version-bump.mjs']);
  assertTrue(releaseVersionBumpCheck.names.includes('verify:ci:release-version-bump'), 'release bump checker source should select its direct production gate');
  assertFalse(releaseVersionBumpCheck.names.includes('verify:frontend:preflight'), 'CI checker source should not select frontend preflight by generic quick baseline');

  const releaseVersionBumpBehaviorCheck = selectAffectedGates(registry, ['scripts/checks/ci/release-version-bump.behavior.mjs']);
  assertTrue(releaseVersionBumpBehaviorCheck.names.includes('verify:ci:release-version-bump-behavior'), 'release bump behavior source should select its direct behavior gate');
  assertFalse(releaseVersionBumpBehaviorCheck.names.includes('verify:frontend:preflight'), 'CI behavior checker source should not select frontend preflight by generic quick baseline');

  const releaseVersionBumpCore = selectAffectedGates(registry, ['scripts/lib/quality/quality-release-version-bump-core.mjs']);
  assertTrue(releaseVersionBumpCore.names.includes('verify:ci:release-version-bump'), 'release bump core helper should select release bump production gate');
  assertTrue(releaseVersionBumpCore.names.includes('verify:ci:release-version-bump-behavior'), 'release bump core helper should select release bump behavior gate');
  assertFalse(releaseVersionBumpCore.names.includes('verify:frontend:preflight'), 'release bump core helper should not select frontend preflight by generic quick baseline');

  const releaseVersionBumpBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/quality/quality-release-version-bump-behavior-fixtures.mjs']);
  assertTrue(
    releaseVersionBumpBehaviorFixture.names.includes('verify:ci:release-version-bump-behavior'),
    'release bump behavior fixture should select release bump behavior gate',
  );
  assertTrue(
    releaseVersionBumpBehaviorFixture.names.includes('verify:ci:release-version-bump'),
    'release bump behavior fixture should keep release bump production coverage',
  );
  assertFalse(
    releaseVersionBumpBehaviorFixture.names.includes('verify:frontend:preflight'),
    'release bump behavior fixture should not select frontend preflight by generic quick baseline',
  );
}
