#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  buildQualityGateRegistry,
  selectGatesByNames,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  runQualityGates,
} from '../../lib/quality/quality-scheduler.mjs';
import {
  createGateEnv,
  modeGateNames,
} from '../../quality-runner.mjs';

const {
  assertEqual,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-affected-runtime-env-behavior');

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-affected-runtime-env-'));
}

export async function runQualityRunnerAffectedRuntimeEnvBehaviorCheck() {
  const repoRoot = createTempWorkspace();
  try {
    writeText(
      path.join(repoRoot, 'scripts/checks/frontend/design-evolution.mjs'),
      [
        'const expected = "M:apps/web-vite/src/app/one.tsx\\nM:apps/web-vite/src/app/two.tsx";',
        'if (process.env.FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES !== expected) {',
        '  console.error(`unexpected changed files env: ${JSON.stringify(process.env.FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES)}`);',
        '  process.exit(1);',
        '}',
        'console.log("changed files env ok");',
        '',
      ].join('\n'),
    );
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    packageJson.scripts['verify:frontend:design-evolution'] = 'node scripts/checks/frontend/design-evolution.mjs';
    writeText(path.join(repoRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
    writeText(path.join(repoRoot, 'apps/web-vite/src/app/one.tsx'), 'export const one = 10;\n');
    writeText(path.join(repoRoot, 'apps/web-vite/src/app/two.tsx'), 'export const two = 20;\n');

    const changedFiles = ['M:apps/web-vite/src/app/one.tsx', 'M:apps/web-vite/src/app/two.tsx'];
    const nonShellGateEnv = createGateEnv(changedFiles);
    assertEqual(
      nonShellGateEnv.AIOS_SHELL_SYNTAX_CHANGED_SCOPE,
      'changed',
      'changed affected scope should mark shell syntax as changed mode even when no shell file changed',
    );
    assertEqual(
      nonShellGateEnv.AIOS_SHELL_SYNTAX_CHANGED_FILES,
      '',
      'non-shell affected changes should not perturb shell syntax cache key with unrelated files',
    );
    const shellGateEnv = createGateEnv([
      { file: 'scripts/deploy.sh', status: 'M' },
      { file: '.githooks/pre-push', status: 'M' },
      { file: 'apps/web-vite/src/app/page.tsx', status: 'M' },
    ]);
    assertEqual(
      shellGateEnv.AIOS_SHELL_SYNTAX_CHANGED_FILES,
      'M:.githooks/pre-push\nM:scripts/deploy.sh',
      'shell syntax env should keep only shell and hook changed files',
    );
    assertEqual(
      createGateEnv([]).AIOS_SHELL_SYNTAX_CHANGED_SCOPE,
      'full',
      'empty changed-file scope should keep shell syntax on full scan mode',
    );

    const fixtureRegistry = buildQualityGateRegistry({ packageJson });
    const context = modeGateNames('affected', fixtureRegistry, repoRoot, {
      changedFiles,
    });
    assertTrue(
      context.names.includes('verify:frontend:design-evolution'),
      'design evolution gate should be selected for apps/web-vite/src/app changes',
    );
    const { gates } = selectGatesByNames(fixtureRegistry, ['verify:frontend:design-evolution'], { includeDeps: false });
    const result = await runQualityGates(gates, {
      cache: false,
      env: createGateEnv(context.changedFileEntries),
      parallel: 1,
      repoRoot,
    });
    assertEqual(result.status, 'pass', 'affected run should pass changed-files env to selected gates');
    assertIncludes(result.results[0]?.stdout ?? '', 'changed files env ok', 'design evolution fixture should receive status-preserving changed files env');
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerAffectedRuntimeEnvBehaviorCheck();
  reportOk('runtime changed-file env injection passed.');
}
