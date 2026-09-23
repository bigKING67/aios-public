import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  packageLockChangeKind,
  packageLockChangeRequiresFullCiWithReader,
} from '../../lib/quality/quality-affected.mjs';

export function assertPackageLockDiffBehavior({
  assertEqual,
  assertFalse,
  assertTrue,
}) {
  const repoRoot = process.cwd();
  const baselinePackageLock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const versionOnlyPackageLock = structuredClone(baselinePackageLock);
  versionOnlyPackageLock.version = '999.999.999';
  if (versionOnlyPackageLock.packages?.['']) {
    versionOnlyPackageLock.packages[''].version = '999.999.999';
  }
  assertFalse(
    packageLockChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageLock: () => versionOnlyPackageLock,
      previousPackageLock: () => baselinePackageLock,
      repoRoot,
    }),
    'package-lock root-version-only release bump should avoid full static CI',
  );
  assertEqual(
    packageLockChangeKind({
      base: 'HEAD',
      currentPackageLock: () => versionOnlyPackageLock,
      previousPackageLock: () => baselinePackageLock,
      repoRoot,
    }),
    'release-metadata-only',
    'package-lock root-version-only release bump should be classified separately from dependency lockfile changes',
  );

  const runtimePackageLock = structuredClone(versionOnlyPackageLock);
  runtimePackageLock.packages['node_modules/fixture-runtime-dependency'] = { version: '0.0.0' };
  assertTrue(
    packageLockChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageLock: () => runtimePackageLock,
      previousPackageLock: () => baselinePackageLock,
      repoRoot,
    }),
    'package-lock dependency changes should still require full static CI',
  );
}
