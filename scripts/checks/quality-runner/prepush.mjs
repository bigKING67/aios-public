#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  changedFilesEnvValue,
  listChangedFileEntries,
  packageJsonChangeRequiresFullCiWithReader,
} from '../../lib/quality/quality-affected.mjs';
import {
  buildQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  formatFailedGateAffectedContext,
  modeGateNames,
} from '../../quality-runner.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-prepush-behavior');

const FIXTURE_REPO_ROOT = '/fixture/aios-quality-runner-prepush';
const REMOTE_SHA = 'fixture-remote';
const LOCAL_SHA = 'fixture-local';
const WORKTREE_REF = 'fixture-worktree';

function fixturePackageJson(extra = {}) {
  return {
    private: true,
    scripts: {
      'verify:quality-runner:affected-mode': 'node scripts/checks/quality-runner/affected-mode.mjs',
      ...(extra.scripts ?? {}),
    },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'scripts')),
  };
}

export function runQualityRunnerPrepushBehaviorCheck() {
  const baselinePackageJson = fixturePackageJson();
  const pushedPackageJson = fixturePackageJson({
    scripts: {
      'verify:quality-runner:fixture-prepush': 'node scripts/checks/quality-runner/fixture-prepush.mjs',
    },
  });

  const dirtyPackageJson = structuredClone(pushedPackageJson);
  dirtyPackageJson.dependencies = {
    ...(dirtyPackageJson.dependencies ?? {}),
    'fixture-dirty-dependency': '0.0.0',
  };

  const packageJsonByRef = new Map([
    [REMOTE_SHA, baselinePackageJson],
    [LOCAL_SHA, pushedPackageJson],
    [WORKTREE_REF, dirtyPackageJson],
  ]);
  const observedPackageRefs = [];
  const packageJsonRequiresFullCi = (repoRoot, base, head) => packageJsonChangeRequiresFullCiWithReader({
    base,
    currentPackageJson: () => {
      const ref = head ?? WORKTREE_REF;
      observedPackageRefs.push(ref);
      return packageJsonByRef.get(ref);
    },
    previousPackageJson: () => {
      observedPackageRefs.push(base);
      return packageJsonByRef.get(base);
    },
    repoRoot,
  });

  const explicitEntries = listChangedFileEntries(FIXTURE_REPO_ROOT, {
    base: REMOTE_SHA,
    explicitFiles: ['M:package.json'],
  });
  assertEqual(
    changedFilesEnvValue(explicitEntries),
    'M:package.json',
    'explicit pushed changed files should not be widened by dirty worktree files',
  );

  const registry = buildQualityGateRegistry({ packageJson: pushedPackageJson });
  const pushedContext = modeGateNames('prepush', registry, FIXTURE_REPO_ROOT, {
    base: REMOTE_SHA,
    changedFiles: ['M:package.json'],
    head: LOCAL_SHA,
    packageJsonRequiresFullCi,
  });
  assertEqual(
    pushedContext.changedFiles.join(','),
    'package.json',
    'prepush mode should keep the hook-provided pushed diff as the changed-file source of truth',
  );
  assertEqual(
    changedFilesEnvValue(pushedContext.changedFileEntries),
    'M:package.json',
    'prepush mode should preserve pushed changed-file status for downstream gates',
  );
  assertIncludes(
    pushedContext.names.join(','),
    'verify:ci:release-version-bump',
    'prepush mode should retain release bump as an always-on safety gate',
  );
  assertIncludes(
    pushedContext.names.join(','),
    'verify:frontend:preflight',
    'prepush mode should retain frontend preflight as an always-on safety gate',
  );
  assertIncludes(
    observedPackageRefs.join(','),
    LOCAL_SHA,
    'prepush mode should evaluate package diff against the pushed head tree when --head is provided',
  );
  assertFalse(
    pushedContext.names.includes('build'),
    'prepush package fast path should evaluate the pushed tree, not dirty package dependency edits',
  );
  assertFalse(
    pushedContext.names.includes('verify:backend:test'),
    'dirty package dependency edits should not inflate pushed script-only package changes into full backend tests',
  );
  assertFalse(
    pushedContext.names.includes('verify:frontend:design-evolution'),
    'dirty frontend files should not leak into prepush mode when the hook provided explicit pushed files',
  );
  const preflightContext = formatFailedGateAffectedContext({
    gate: registry.byName.get('verify:frontend:preflight'),
    status: 'fail',
  }, {
    ...pushedContext,
    mode: 'prepush',
  });
  assertIncludes(
    preflightContext,
    'changed files: package.json',
    'prepush failed-gate context should include pushed changed files',
  );
  assertIncludes(
    preflightContext,
    'no changed-file reason recorded; likely prepush baseline/dependency/profile selection',
    'prepush failed-gate context should explain always-on baseline gates without affected reasons',
  );
  assertIncludes(
    preflightContext,
    'reproduce: bash scripts/verify-frontend-preflight.sh',
    'prepush failed-gate context should include the direct reproduction command',
  );

  const dirtyControlContext = modeGateNames('prepush', registry, FIXTURE_REPO_ROOT, {
    base: REMOTE_SHA,
    changedFiles: ['M:package.json'],
    packageJsonRequiresFullCi,
  });
  assertIncludes(
    observedPackageRefs.join(','),
    WORKTREE_REF,
    'control path should evaluate the worktree package snapshot when --head is omitted',
  );
  assertTrue(
    dirtyControlContext.names.includes('build'),
    'control path should prove that omitting --head would evaluate the dirty worktree and expand to full static coverage',
  );
  assertTrue(
    dirtyControlContext.names.includes('verify:backend:test'),
    'control path should prove dirty package dependency edits remain conservative when no pushed head is supplied',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerPrepushBehaviorCheck();
  reportOk('prepush pushed diff, head tree fast path, and dirty worktree isolation passed.');
}
