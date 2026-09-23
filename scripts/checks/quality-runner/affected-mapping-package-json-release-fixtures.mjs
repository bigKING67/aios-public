import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  packageJsonChangeKind,
  packageJsonChangeRequiresFullCiWithReader,
} from '../../lib/quality/quality-affected.mjs';

export function assertPackageJsonReleaseAndDependencyBehavior({
  assertEqual,
  assertFalse,
  assertTrue,
}) {
  const repoRoot = process.cwd();
  const baselinePackageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const scriptOnlyPackageJson = structuredClone(baselinePackageJson);
  scriptOnlyPackageJson.scripts['verify:quality-runner:cache'] = 'node scripts/checks/quality-runner/cache.mjs --fixture-drift';
  scriptOnlyPackageJson.scripts['verify:ci:wiring'] = 'node scripts/checks/ci/package-wiring.mjs --fixture-drift';

  const dirtyPackageJson = structuredClone(scriptOnlyPackageJson);
  dirtyPackageJson.dependencies = {
    ...(dirtyPackageJson.dependencies ?? {}),
    'fixture-dirty-dependency': '0.0.0',
  };
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'remote-main',
      currentPackageJson: () => scriptOnlyPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'pre-push package fast path should evaluate the pushed tree instead of dirty worktree dependency edits',
  );

  const versionOnlyPackageJson = structuredClone(baselinePackageJson);
  versionOnlyPackageJson.version = '999.999.999';
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => versionOnlyPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'package version-only release bump should avoid full static CI when source files select their own gates',
  );
  assertEqual(
    packageJsonChangeKind({
      base: 'HEAD',
      currentPackageJson: () => versionOnlyPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'release-metadata-only',
    'package version-only release bump should be classified separately from script/tooling fast paths',
  );

  const lintCoveragePackageJson = structuredClone(baselinePackageJson);
  lintCoveragePackageJson.scripts.lint = 'eslint src';
  assertTrue(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => lintCoveragePackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'lint coverage changes should still require full static CI',
  );
  assertTrue(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => dirtyPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'package dependency changes should still require full static CI when they are in the evaluated tree',
  );

  const metadataPackageJson = structuredClone(scriptOnlyPackageJson);
  metadataPackageJson.description = `${metadataPackageJson.description ?? ''} fixture`;
  assertTrue(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => metadataPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'package metadata changes should conservatively select full static CI',
  );
}
