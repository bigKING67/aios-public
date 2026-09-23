#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { changedFilesEnvValue } from '../../lib/quality/quality-affected.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createSchedulerTempWorkspace,
  removeSchedulerTempWorkspace,
  writeText,
} from './scheduler-fixtures.mjs';

const {
  assertEqual,
  assertIncludes,
  reportOk,
} = createCheckGuard('quality-runner-scheduler-env-behavior');

export async function runQualityRunnerSchedulerEnvBehaviorCheck() {
  const repoRoot = createSchedulerTempWorkspace();
  const originalGitDir = process.env.GIT_DIR;
  const originalGitWorkTree = process.env.GIT_WORK_TREE;
  try {
    process.env.GIT_DIR = path.join(process.cwd(), '.git');
    process.env.GIT_WORK_TREE = process.cwd();
    writeText(
      path.join(repoRoot, 'scripts/fixtures/affected-fast-path-env.mjs'),
      [
        'const expected = "M:apps/web-vite/src/app/one.tsx\\nM:apps/web-vite/src/app/two.tsx";',
        'if (process.env.FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES !== expected) {',
        '  console.error(`unexpected changed files env: ${JSON.stringify(process.env.FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES)}`);',
        '  process.exit(1);',
        '}',
        'if (process.env.GIT_DIR || process.env.GIT_WORK_TREE) {',
        '  console.error("repository-bound Git env leaked into gate process");',
        '  process.exit(1);',
        '}',
        'console.log("changed files env ok");',
        '',
      ].join('\n'),
    );
    const result = await runQualityGates([
      {
        name: 'changed-files-env',
        command: 'node scripts/fixtures/affected-fast-path-env.mjs',
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
    ], {
      cache: false,
      env: {
        FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES: changedFilesEnvValue([
          { file: 'apps/web-vite/src/app/one.tsx', status: 'M' },
          { file: 'apps/web-vite/src/app/two.tsx', status: 'M' },
        ]),
      },
      parallel: 1,
      repoRoot,
    });
    assertEqual(result.status, 'pass', 'scheduler should pass changed-files env through to gate processes');
    assertIncludes(result.results[0]?.stdout ?? '', 'changed files env ok', 'changed-files env fixture should run');
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
    removeSchedulerTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerSchedulerEnvBehaviorCheck();
  reportOk('changed-file env passthrough and hook Git env isolation passed.');
}
