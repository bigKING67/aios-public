import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  assertPackageJsonDiffBehavior,
} from './affected-mapping-package-json-fixtures.mjs';
import {
  assertPackageLockDiffBehavior,
} from './affected-mapping-package-lock-fixtures.mjs';

export function assertPackageDiffAffectedMapping({
  assertEqual,
  assertFalse,
  assertTrue,
  registry,
}) {
  assertPackageJsonDiffBehavior({
    assertEqual,
    assertFalse,
    assertTrue,
  });
  assertPackageLockDiffBehavior({
    assertEqual,
    assertFalse,
    assertTrue,
  });

  const releaseMetadataSelection = selectAffectedGates(registry, ['package.json', 'package-lock.json'], {
    packageJsonKind: () => 'release-metadata-only',
    packageLockKind: () => 'release-metadata-only',
  });
  const releaseMetadataGroups = [...new Set(
    releaseMetadataSelection.names.map((name) => registry.byName.get(name)?.group ?? 'unknown'),
  )].sort();
  assertEqual(
    releaseMetadataGroups.join(','),
    'ci-meta',
    'release metadata-only package changes should select only CI metadata gates',
  );
  assertTrue(
    releaseMetadataSelection.names.includes('verify:ci:release-version-bump'),
    'release metadata-only package changes should keep release bump guard selected',
  );
  assertTrue(
    releaseMetadataSelection.names.includes('verify:ci:wiring'),
    'release metadata-only package changes should keep CI wiring selected',
  );
  assertFalse(
    releaseMetadataSelection.names.includes('type-check'),
    'release metadata-only package changes should not select type-check through generic quick baseline',
  );
  assertFalse(
    releaseMetadataSelection.names.includes('verify:frontend:preflight'),
    'release metadata-only package changes should not select frontend preflight through generic quick baseline',
  );
  assertFalse(
    releaseMetadataSelection.names.includes('verify:frontend:design-evolution'),
    'release metadata-only package changes should not select frontend design-evolution gate',
  );
  assertFalse(
    releaseMetadataSelection.names.includes('verify:weekly:platform-tab-tmall-goods-section'),
    'release metadata-only package changes should not select weekly Tmall platform tab gate',
  );

  const scriptFastPathSelection = selectAffectedGates(registry, ['package.json'], {
    packageJsonKind: () => 'script-fast-path',
  });
  const scriptFastPathGroups = [...new Set(
    scriptFastPathSelection.names.map((name) => registry.byName.get(name)?.group ?? 'unknown'),
  )].sort();
  assertEqual(
    scriptFastPathSelection.names.length,
    48,
    'package script fast path should keep the selected gate count stable',
  );
  assertEqual(
    scriptFastPathGroups.join(','),
    'ci-meta,core,frontend,repo,shell',
    'package script fast path should avoid full app/backend/design/weekly static CI fan-out',
  );
  assertTrue(
    scriptFastPathSelection.names.includes('type-check'),
    'package script fast path should retain quick baseline coverage',
  );
  assertTrue(
    scriptFastPathSelection.names.includes('verify:quality-runner:affected-files'),
    'package script fast path should retain quality-runner self-check slices',
  );
  assertFalse(
    scriptFastPathSelection.names.includes('build'),
    'package script fast path should not pay production frontend build coverage',
  );
  assertFalse(
    scriptFastPathSelection.names.includes('verify:weekly:platform-tab-tmall-goods-section'),
    'package script fast path should not fan out to weekly behavior gates',
  );

}
