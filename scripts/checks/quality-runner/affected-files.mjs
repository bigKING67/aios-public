#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  changedFilesEnvValue,
  isIgnoredAffectedFile,
  listChangedFileEntries,
  packageJsonChangeKind,
  packageJsonChangeRequiresFullCiWithReader,
  packageLockChangeKind,
  packageLockChangeRequiresFullCiWithReader,
} from '../../lib/quality/quality-affected-files.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-affected-files-behavior');

function fixturePackageJson(scriptValue) {
  return `${JSON.stringify({
    private: true,
    scripts: {
      lint: 'eslint .',
      'verify:ci:wiring': scriptValue,
    },
  }, null, 2)}\n`;
}

export function runQualityRunnerAffectedFilesBehaviorCheck() {
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'fixture-base',
      currentPackageJson: () => JSON.parse(fixturePackageJson(
        'node scripts/checks/ci/package-wiring.mjs --fixture-drift',
      )),
      previousPackageJson: () => JSON.parse(fixturePackageJson(
        'node scripts/checks/ci/package-wiring.mjs',
      )),
      repoRoot: 'fixture-repo',
    }),
    'reader-backed script-only package changes should avoid full static CI',
  );
  assertTrue(isIgnoredAffectedFile('.tmp-backend-rust.pid'), 'tmp pid files should be ignored');
  assertTrue(isIgnoredAffectedFile('.cache/foo.json'), 'cache files should be ignored');
  assertFalse(isIgnoredAffectedFile('apps/web-vite/src/app/page.tsx'), 'normal source files should not be ignored');
  assertEqual(
    changedFilesEnvValue([
      { file: 'apps/web-vite/src/app/one.tsx', status: 'M' },
      { file: 'scripts/lib/frontend/app-route-paths.mjs', status: 'R097' },
      { file: 'apps/web-vite/src/app/two.tsx', status: 'A' },
    ]),
    'M:apps/web-vite/src/app/one.tsx\nA:apps/web-vite/src/app/two.tsx\nR097:scripts/lib/frontend/app-route-paths.mjs',
    'changed-files env should preserve normal and rename statuses while sorting deterministically',
  );
  const changedEntries = listChangedFileEntries('fixture-repo', {
    explicitFiles: ['M:apps/web-vite/src/app/one.tsx', 'A:apps/web-vite/src/app/two.tsx', 'R097:scripts/lib/frontend/app-route-paths.mjs'],
  });
  assertEqual(
    changedEntries.map((entry) => `${entry.status}:${entry.file}`).join(','),
    'M:apps/web-vite/src/app/one.tsx,A:apps/web-vite/src/app/two.tsx,R097:scripts/lib/frontend/app-route-paths.mjs',
    'explicit changed-file entries should preserve normal and rename statuses while sorting deterministically',
  );
  assertIncludes(
    JSON.stringify(changedEntries),
    'apps/web-vite/src/app/one.tsx',
    'changed file entries should include explicit file paths',
  );

  assertEqual(
    packageJsonChangeKind({
      base: 'fixture-base',
      currentPackageJson: () => JSON.parse(fixturePackageJson(
        'node scripts/checks/ci/package-wiring.mjs --fixture-drift',
      )),
      previousPackageJson: () => JSON.parse(fixturePackageJson(
        'node scripts/checks/ci/package-wiring.mjs',
      )),
      repoRoot: 'fixture-repo',
    }),
    'script-fast-path',
    'reader-backed script-only package changes should be classified separately from full CI and release metadata',
  );

  assertFalse(
    packageLockChangeRequiresFullCiWithReader({
      base: 'fixture-base',
      currentPackageLock: () => ({
        lockfileVersion: 3,
        name: 'aios',
        packages: {
          '': {
            name: 'aios',
            version: '1.0.1',
          },
          'node_modules/fixture': {
            version: '1.0.0',
          },
        },
        version: '1.0.1',
      }),
      previousPackageLock: () => ({
        lockfileVersion: 3,
        name: 'aios',
        packages: {
          '': {
            name: 'aios',
            version: '1.0.0',
          },
          'node_modules/fixture': {
            version: '1.0.0',
          },
        },
        version: '1.0.0',
      }),
      repoRoot: 'fixture-repo',
    }),
    'package-lock root version-only release bumps should avoid full static CI',
  );
  assertEqual(
    packageLockChangeKind({
      base: 'fixture-base',
      currentPackageLock: () => ({
        lockfileVersion: 3,
        name: 'aios',
        packages: {
          '': {
            name: 'aios',
            version: '1.0.1',
          },
          'node_modules/fixture': {
            version: '1.0.0',
          },
        },
        version: '1.0.1',
      }),
      previousPackageLock: () => ({
        lockfileVersion: 3,
        name: 'aios',
        packages: {
          '': {
            name: 'aios',
            version: '1.0.0',
          },
          'node_modules/fixture': {
            version: '1.0.0',
          },
        },
        version: '1.0.0',
      }),
      repoRoot: 'fixture-repo',
    }),
    'release-metadata-only',
    'package-lock root version-only release bumps should be classified separately from dependency lockfile changes',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerAffectedFilesBehaviorCheck();
  reportOk('affected-files helper behaviors passed.');
}
