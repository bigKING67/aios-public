#!/usr/bin/env node

import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  commitFixtureFiles,
  commitTrackedFixtureFiles,
  runFixtureCommand,
  withFixtureWorkspace,
} from '../../lib/shared/gate-fixture-utils.mjs';

const {
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  reportOk,
} = createCheckGuard('quality-runner-hook-behavior');

export function runQualityRunnerHookBehaviorCheck(options = {}) {
  const {
    sourceRepoRoot = process.cwd(),
  } = options;
  withFixtureWorkspace({
    git: true,
    packageJson: null,
    prefix: 'aios-quality-runner-hook-',
  }, (fixture) => {
    const packageJson = {
      private: true,
      scripts: {
        'verify:prepush': 'node scripts/quality-runner.mjs run prepush',
        'verify:quality-runner:affected-mode': 'node scripts/checks/quality-runner/affected-mode.mjs',
      },
    };
    fixture.write({
      '.githooks/pre-push': readFileSync(path.join(sourceRepoRoot, '.githooks/pre-push'), 'utf8'),
      'scripts/ops/vps-prepush-guard.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'echo "fixture VPS coordination guard: $*"',
        '',
      ].join('\n'),
      'scripts/quality-runner.mjs': [
        '#!/usr/bin/env node',
        'const args = process.argv.slice(2);',
        'if (args[0] === "remote-cache" && args[1] === "env") {',
        '  if (!args.includes("--health-only") || args[args.indexOf("--remote-cache-mode") + 1] !== "read") {',
        '    console.error(`unexpected remote-cache env args: ${args.join(" ")}`);',
        '    process.exit(1);',
        '  }',
        '  console.log(`export AIOS_QUALITY_REMOTE_CACHE_URL="file:///fixture-remote-cache" AIOS_QUALITY_REMOTE_CACHE_MODE=read`);',
        '  process.exit(0);',
        '}',
        'if (args[0] !== "run" || args[1] !== "prepush") {',
        '  console.error(`unexpected fixture runner args: ${args.join(" ")}`);',
        '  process.exit(1);',
        '}',
        'const remoteCacheAutoDisabled = process.env.AIOS_QUALITY_PREPUSH_REMOTE_CACHE_AUTO === "0";',
        'if (remoteCacheAutoDisabled && process.env.AIOS_QUALITY_REMOTE_CACHE_URL) {',
        '  console.error(`remote cache env should not activate when auto mode is disabled: ${process.env.AIOS_QUALITY_REMOTE_CACHE_URL}`);',
        '  process.exit(1);',
        '}',
        'if (!remoteCacheAutoDisabled && process.env.AIOS_QUALITY_REMOTE_CACHE_URL !== "file:///fixture-remote-cache") {',
        '  console.error(`remote cache env was not activated: ${process.env.AIOS_QUALITY_REMOTE_CACHE_URL ?? ""}`);',
        '  process.exit(1);',
        '}',
        'if (!remoteCacheAutoDisabled && process.env.AIOS_QUALITY_REMOTE_CACHE_MODE !== "read") {',
        '  console.error(`remote cache mode should be read: ${process.env.AIOS_QUALITY_REMOTE_CACHE_MODE ?? ""}`);',
        '  process.exit(1);',
        '}',
        'if (remoteCacheAutoDisabled) {',
        '  console.log("remote cache auto disabled fixture");',
        '}',
        'console.log(`fixture runner args: ${args.join(" ")}`);',
        'const changedFiles = args[args.indexOf("--changed-files") + 1] ?? "";',
        'if (!changedFiles.includes("M:apps/web-vite/src/app/committed.tsx")) {',
        '  console.error(`missing committed change: ${changedFiles}`);',
        '  process.exit(1);',
        '}',
        'if (changedFiles.includes("dirty.module.css")) {',
        '  console.error(`dirty worktree leaked into pre-push changed files: ${changedFiles}`);',
        '  process.exit(1);',
        '}',
        'console.log(`prepush changed files: ${changedFiles}`);',
        '',
      ].join('\n'),
      'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
      'apps/web-vite/src/app/committed.tsx': 'export const value = 1;\n',
    });
    commitFixtureFiles(fixture, [
      '.githooks/pre-push',
      'package.json',
      'scripts/ops/vps-prepush-guard.sh',
      'scripts/quality-runner.mjs',
      'apps/web-vite/src/app/committed.tsx',
    ], 'baseline');

    fixture.write({
      'apps/web-vite/src/app/committed.tsx': 'export const value = 2;\n',
    });
    packageJson.scripts['verify:quality-runner:affected-mapping'] = 'node scripts/checks/quality-runner/affected-mapping.mjs';
    fixture.write({
      'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    });
    commitTrackedFixtureFiles(fixture, 'pushed change');
    const remoteRef = 'HEAD~1';
    const localRef = 'HEAD';
    fixture.write({
      'apps/web-vite/src/app/dirty.module.css': '.dirty { color: red; }\n',
    });

    const fixtureEnv = { ...process.env };
    delete fixtureEnv.AIOS_QUALITY_REMOTE_CACHE_URL;
    delete fixtureEnv.AIOS_QUALITY_REMOTE_CACHE_MODE;
    delete fixtureEnv.AIOS_QUALITY_PREPUSH_REMOTE_CACHE_AUTO;
    const result = runFixtureCommand(fixture, 'bash', ['.githooks/pre-push', 'origin', ''], {
      check: false,
      env: fixtureEnv,
      input: `refs/heads/main ${localRef} refs/heads/main ${remoteRef}\n`,
    });
    assertEqual(result.status, 0, `pre-push should verify pushed diff without dirty worktree leakage\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'prepush changed files:', 'pre-push fixture should run verify script');
    assertIncludes(result.stdout, 'fixture VPS coordination guard:', 'pre-push fixture should run the VPS guard first');
    assertIncludes(result.stdout, 'remote cache auto env enabled mode=read', 'pre-push should auto-enable read-only remote cache when fresh health is available');
    assertIncludes(result.stdout, 'running direct verify:prepush', 'pre-push should call the node runner directly without npm startup overhead');
    assertIncludes(result.stdout, 'M:apps/web-vite/src/app/committed.tsx', 'pre-push should pass committed changed file with status');
    assertIncludes(result.stdout, `--base ${remoteRef}`, 'pre-push should pass the pushed diff base ref to verify:prepush');
    assertIncludes(result.stdout, `--head ${localRef}`, 'pre-push should pass the pushed diff head ref to verify:prepush');
    assertIncludes(result.stdout, 'M:package.json', 'pre-push should include committed package script-only changes');
    assertNotIncludes(result.stdout, 'dirty.module.css', 'pre-push should ignore uncommitted dirty files outside pushed diff');

    const disabledEnv = {
      ...fixtureEnv,
      AIOS_QUALITY_PREPUSH_REMOTE_CACHE_AUTO: '0',
    };
    const disabledResult = runFixtureCommand(fixture, 'bash', ['.githooks/pre-push', 'origin', ''], {
      check: false,
      env: disabledEnv,
      input: `refs/heads/main ${localRef} refs/heads/main ${remoteRef}\n`,
    });
    assertEqual(disabledResult.status, 0, `pre-push should allow disabling automatic remote cache activation\nstdout:\n${disabledResult.stdout}\nstderr:\n${disabledResult.stderr}`);
    assertIncludes(disabledResult.stdout, 'remote cache auto disabled fixture', 'pre-push should pass through opt-out state to the runner');
    assertIncludes(disabledResult.stdout, 'prepush changed files:', 'pre-push opt-out path should still run verify script');
    assertNotIncludes(disabledResult.stdout, 'remote cache auto env enabled mode=read', 'pre-push should not auto-enable remote cache when opt-out is set');

    const sha = runFixtureCommand(fixture, 'git', ['rev-parse', 'HEAD']).stdout.trim();
    const base = runFixtureCommand(fixture, 'git', ['rev-parse', 'HEAD~1']).stdout.trim();
    const zero = '0'.repeat(40);
    const cnbUrl = 'https://cnb.cool/bql_huayue/aios.git';
    const ref = 'refs/heads/feat/member-a/example';
    const push = (input, url = cnbUrl) => runFixtureCommand(fixture, 'bash', ['.githooks/pre-push', 'team', url], {
      check: false, env: fixtureEnv, input,
    });
    assertEqual(push(`${ref} ${sha} refs/heads/main ${base}\n`).status, 1, 'CNB main direct push must be rejected regardless of alias');
    assertEqual(push(`${ref} ${sha} refs/tags/v1 ${zero}\n`).status, 1, 'CNB member tag publication must be rejected');
    assertEqual(push(`${ref} ${sha} ${ref} ${base}\n`).status, 1, 'CNB verification must reject a dirty checkout');
    rmSync(path.join(fixture.repoRoot, 'apps/web-vite/src/app/dirty.module.css'));
    runFixtureCommand(fixture, 'git', ['config', 'user.name', 'Member A']);
    runFixtureCommand(fixture, 'git', ['config', 'user.email', 'member-a@example.invalid']);
    assertEqual(push(`${ref} ${base} ${ref} ${zero}\n`).status, 1, 'cannot test current HEAD as evidence for another commit');
    assertEqual(push(`${ref} ${sha} ${ref} ${zero}\n`).status, 1, 'new branch must have a known main baseline');
    runFixtureCommand(fixture, 'git', ['update-ref', 'refs/remotes/team/main', base]);
    fixtureEnv.AIOS_QUALITY_REMOTE_CACHE_URL = 'file:///must-not-use-inherited-cache';
    fixtureEnv.AIOS_QUALITY_REMOTE_CACHE_MODE = 'readwrite';
    const memberPush = push(`${ref} ${sha} ${ref} ${zero}\n`);
    assertEqual(memberPush.status, 0, `clean CNB task push should pass local checks: ${memberPush.stderr}`);
    assertIncludes(memberPush.stdout, `--base ${base} --head ${sha}`, 'new branch checks the full main-to-HEAD diff');
    assertNotIncludes(memberPush.stdout, 'fixture VPS coordination guard', 'members do not need VPS access');
    assertIncludes(memberPush.stdout, 'remote cache auto disabled fixture', 'members do not discover a VPS remote cache');
    assertEqual(push(`${ref} ${sha} ${ref} ${base}\n${ref} ${sha} refs/heads/fix/member-a/other ${base}\n`).status, 1, 'multi-ref pushes cannot reuse one checkout as evidence');
    assertEqual(push(`${ref} ${sha} ${ref} ${base}\n`, 'https://cnb.cool/wrong/repo.git').status, 1, 'unknown CNB destination must not fall through to legacy checks');
    runFixtureCommand(fixture, 'git', ['config', 'user.name', '']);
    assertEqual(push(`${ref} ${sha} ${ref} ${base}\n`).status, 1, 'missing personal Git identity must be rejected');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerHookBehaviorCheck();
  reportOk('direct pre-push runner, pushed diff args, and dirty worktree isolation passed.');
}
