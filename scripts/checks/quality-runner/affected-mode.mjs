#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  buildQualityGateRegistry,
  selectGatesByNames,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  listMode,
  modeGateNames,
} from '../../quality-runner.mjs';

const {
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-affected-mode-behavior');

function captureStdout(callback) {
  const originalStdoutWrite = process.stdout.write;
  let output = '';
  try {
    process.stdout.write = (chunk, encoding, done) => {
      output += String(chunk);
      if (typeof done === 'function') {
        done();
      }
      return true;
    };
    callback();
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
  return output;
}

export async function runQualityRunnerAffectedModeBehaviorCheck() {
  {
    const helpResult = spawnSync(process.execPath, ['scripts/quality-runner.mjs', 'run', 'affected', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assertEqual(helpResult.status, 0, `quality-runner --help should exit successfully\nstdout:\n${helpResult.stdout}\nstderr:\n${helpResult.stderr}`);
    assertIncludes(helpResult.stdout, 'Usage:', '--help should print usage to stdout');
    assertNotIncludes(helpResult.stdout, '[quality] mode=affected', '--help must not execute affected gates');
  }

  {
    const stdout = captureStdout(() => {
      listMode('quick', { base: undefined, changedFiles: null, compact: false, json: false });
    });
    assertIncludes(stdout, '[quality] mode=quick', 'list output should include mode');
    assertIncludes(stdout, 'verify:frontend:preflight', 'quick list should include preflight');
    assertIncludes(stdout, 'verify:frontend:structure-gate-registry-behavior', 'quick list should include dependency-expanded frontend behavior checks');
    assertIncludes(stdout, 'verify:shell:syntax', 'quick list should include shell syntax baseline');
    assertTrue(
      !stdout.includes('verify:backend:test'),
      'quick list should not include backend test unless backend files are affected',
    );
    assertTrue(
      !stdout.includes('verify:backend:check'),
      'quick list should not include backend check unless backend files are affected',
    );
  }

  {
    const repoRoot = process.cwd();
    const registry = buildQualityGateRegistry({ repoRoot });
    const context = modeGateNames('affected', registry, repoRoot, {
      changedFiles: ['backend-rust/src/main.rs'],
    });
    const { gates } = selectGatesByNames(registry, context.names);
    const stdout = captureStdout(() => {
      listMode('affected', { base: undefined, changedFiles: ['backend-rust/src/main.rs'], compact: false, json: false });
    });
    assertTrue(gates.some((gate) => gate.name === 'verify:backend:check'), 'affected backend selection should include backend check');
    assertIncludes(stdout, 'verify:backend:check', 'affected backend list should include backend check');
  }

  {
    const repoRoot = process.cwd();
    const registry = buildQualityGateRegistry({ repoRoot });
    const context = modeGateNames('affected', registry, repoRoot, {
      changedFiles: ['apps/web-vite/src/components/protected-route.tsx'],
    });
    assertTrue(
      context.names.includes('verify:repo:naming'),
      'affected migrated frontend domains should include the repo naming gate',
    );
  }

  {
    const repoRoot = process.cwd();
    const registry = buildQualityGateRegistry({ repoRoot });
    let observedBase = null;
    modeGateNames('affected', registry, repoRoot, {
      changedFiles: ['package.json'],
      packageJsonRequiresFullCi: (_repoRoot, base) => {
        observedBase = base;
        return false;
      },
    });
    assertTrue(Boolean(observedBase), 'explicit package affected selection should resolve a base before package fast-path checks');
  }

  {
    const stdout = captureStdout(() => {
      listMode('prepush', { base: undefined, changedFiles: ['backend-rust/src/main.rs'], compact: false, json: false });
    });
    assertIncludes(stdout, 'verify:backend:check', 'prepush list should include affected backend check');
    assertIncludes(stdout, 'verify:repo:source-size-governance', 'prepush list should enforce cross-language source-size governance');
    assertIncludes(stdout, 'verify:frontend:preflight', 'prepush list should retain quick safety gates');
    assertNotIncludes(stdout, 'verify:frontend:structure-gate-registry', 'prepush list should not inflate affected runs with all quick registry gates');
    const gateMatch = stdout.match(/\[quality\] mode=prepush gates=(\d+)/);
    assertTrue(Boolean(gateMatch), 'prepush list should print the selected gate count');
    assertTrue(Number(gateMatch?.[1]) < 19, 'prepush backend-only selection should stay narrow instead of inheriting quick baseline');
  }

  {
    const stdout = captureStdout(() => {
      listMode('affected', { base: undefined, changedFiles: ['tailwind.config.ts'], compact: true, json: false });
    });
    assertIncludes(stdout, '[quality] mode=affected', 'compact list should include mode');
    assertTrue(
      stdout.indexOf('- core:') < stdout.indexOf('- design:') && stdout.indexOf('- design:') < stdout.indexOf('- frontend:'),
      'compact list should print groups in stable alphabetical order',
    );
    assertIncludes(stdout, '- design:', 'compact list should summarize groups');
    assertNotIncludes(stdout, ':: node ', 'compact list should not include full commands');
  }

  {
    const stdout = captureStdout(() => {
      listMode('affected', { base: undefined, changedFiles: ['tailwind.config.ts'], compact: false, json: false });
    });
    assertTrue(
      stdout.indexOf('[group] core ') < stdout.indexOf('[group] design ') && stdout.indexOf('[group] design ') < stdout.indexOf('[group] frontend '),
      'full list should print groups in stable alphabetical order',
    );
    assertTrue(
      stdout.indexOf('- build ') < stdout.indexOf('- lint ') && stdout.indexOf('- lint ') < stdout.indexOf('- type-check '),
      'full list should print gates inside each group in stable alphabetical order',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerAffectedModeBehaviorCheck();
  reportOk('list, mode gate selection, and prepush narrowing checks passed.');
}
