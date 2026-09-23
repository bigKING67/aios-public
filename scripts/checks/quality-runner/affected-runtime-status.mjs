#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  withFixtureWorkspace,
} from '../../lib/shared/gate-fixture-utils.mjs';
import {
  changedFilesEnvValue,
  listChangedFileEntries,
} from '../../lib/quality/quality-affected.mjs';

const {
  assertEqual,
  reportOk,
} = createCheckGuard('quality-runner-affected-runtime-status-behavior');

export function runQualityRunnerAffectedRuntimeStatusBehaviorCheck() {
  withFixtureWorkspace({
    files: {
      'apps/web-vite/src/app/one.tsx': 'export const one = 1;\n',
    },
    packageJson: null,
    prefix: 'aios-quality-runner-affected-runtime-status-',
  }, (fixture) => {
    const { repoRoot } = fixture;
    fixture.run('git', ['-c', 'core.fsync=none', 'add', 'apps/web-vite/src/app/one.tsx']);
    fixture.write({
      'apps/web-vite/src/app/one.tsx': 'export const one = 10;\n',
      'apps/web-vite/src/app/two.tsx': 'export const two = 20;\n',
    });

    const originalGitDir = process.env.GIT_DIR;
    const originalGitWorkTree = process.env.GIT_WORK_TREE;
    try {
      process.env.GIT_DIR = path.join(process.cwd(), '.git');
      process.env.GIT_WORK_TREE = process.cwd();

      const changedEntries = listChangedFileEntries(repoRoot, { base: null });
      assertEqual(
        changedFilesEnvValue(changedEntries),
        'AM:apps/web-vite/src/app/one.tsx\n??:apps/web-vite/src/app/two.tsx',
        'git worktree status entries should ignore inherited hook Git env and preserve status',
      );
    } finally {
      if (originalGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = originalGitDir;
      }
      if (originalGitWorkTree === undefined) {
        delete process.env.GIT_WORK_TREE;
      } else {
        process.env.GIT_WORK_TREE = originalGitWorkTree;
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerAffectedRuntimeStatusBehaviorCheck();
  reportOk('git changed-file staged+modified status formatting passed.');
}
