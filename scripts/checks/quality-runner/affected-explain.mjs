#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  explainAffected,
  formatFailedGateAffectedContext,
} from '../../quality-runner.mjs';
import {
  assertAffectedExplainSnapshotFixtures,
} from './affected-explain-snapshot-fixtures.mjs';

const {
  assertDeepEqual,
  assertEqual,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-affected-explain-behavior');

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

export function runQualityRunnerAffectedExplainBehaviorCheck() {
  assertAffectedExplainSnapshotFixtures({
    assertDeepEqual,
    assertEqual,
  });

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['tailwind.config.ts', '.tmp-backend-rust.pid'],
        json: false,
        summary: true,
        why: null,
      });
    });
    assertIncludes(stdout, '[quality] changed=2 ignored=1', 'summary should report ignored files');
    assertIncludes(stdout, 'Tailwind config token surface', 'summary should include Tailwind reason');
  }

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['tailwind.config.ts', '.tmp-backend-rust.pid'],
        json: true,
        summary: true,
        why: null,
      });
    });
    const parsed = JSON.parse(stdout);
    assertEqual(parsed.summary.changedCount, 2, 'JSON summary should report changed file count');
    assertEqual(parsed.summary.ignoredCount, 1, 'JSON summary should report ignored file count');
    assertDeepEqual(parsed.summary.ignoredFiles, ['.tmp-backend-rust.pid'], 'JSON summary should expose ignored files');
    assertEqual(parsed.summary.selectedCount, parsed.selection.names.length, 'JSON summary selected count should match selection');
    assertIncludes(Object.keys(parsed.summary.groups).join(','), 'design', 'JSON summary should expose selected gate groups');
    assertIncludes(
      JSON.stringify(parsed.summary.topReasons),
      'Tailwind config token surface',
      'JSON summary should expose top affected reasons',
    );
  }

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['tailwind.config.ts'],
        json: false,
        summary: false,
        why: 'verify:design:tailwind',
      });
    });
    assertIncludes(stdout, 'gate=verify:design:tailwind selected=yes', 'why output should mark selected gate');
    assertIncludes(stdout, 'tailwind.config.ts: Tailwind config token surface', 'why output should include gate reason');
  }

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['tailwind.config.ts'],
        json: true,
        summary: false,
        why: 'verify:design:tailwind',
      });
    });
    const parsed = JSON.parse(stdout);
    assertDeepEqual(
      parsed.why,
      {
        gate: 'verify:design:tailwind',
        selected: true,
        reasons: ['tailwind.config.ts: Tailwind config token surface'],
      },
      'JSON why output should expose selected gate and exact reasons',
    );
  }

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['package-lock.json', 'package.json'],
        json: true,
        packageJsonKind: () => 'release-metadata-only',
        packageLockKind: () => 'release-metadata-only',
        summary: true,
        why: 'verify:ci:release-version-bump',
      });
    });
    const parsed = JSON.parse(stdout);
    assertEqual(parsed.summary.selectedCount, parsed.selection.names.length, 'combined JSON should keep summary payload');
    assertEqual(parsed.summary.changedCount, 2, 'combined JSON should include both package files');
    assertEqual(parsed.summary.groups['ci-meta'], parsed.selection.names.length, 'combined JSON should keep group counts');
    assertDeepEqual(
      Object.keys(parsed.selection.reasons),
      [...Object.keys(parsed.selection.reasons)].sort(),
      'combined JSON should keep stable reason key ordering',
    );
    assertEqual(
      Object.keys(parsed.summary.groups).join(','),
      'ci-meta',
      'combined JSON should keep stable group ordering',
    );
    assertEqual(
      parsed.summary.topReasons[0].reason,
      'package-lock root-version-only release metadata change',
      'combined JSON should keep stable reason ordering for tied counts',
    );
    assertEqual(
      parsed.summary.topReasons[1].reason,
      'release metadata-only package change',
      'combined JSON should keep stable reason ordering for tied counts',
    );
    assertEqual(parsed.why.gate, 'verify:ci:release-version-bump', 'JSON why output should echo requested gate');
    assertEqual(parsed.why.selected, true, 'JSON why output should mark selected gate');
    assertDeepEqual(
      parsed.why.reasons,
      [
        'package-lock.json: package-lock root-version-only release metadata change',
        'package.json: release metadata-only package change',
      ],
      'JSON why output should expose sorted reasons for a selected gate',
    );
  }

  {
    const stdout = captureStdout(() => {
      explainAffected({
        base: undefined,
        changedFiles: ['package-lock.json', 'package.json'],
        json: false,
        packageJsonKind: () => 'release-metadata-only',
        packageLockKind: () => 'release-metadata-only',
        summary: false,
        why: null,
      });
    });
    assertTrue(
      stdout.indexOf('verify:ci:gate-fixture-utils-behavior') < stdout.indexOf('verify:ci:generated'),
      'text affected reasons should print gates in stable alphabetical order',
    );
  }

  {
    const context = formatFailedGateAffectedContext({
      command: 'node scripts/checks/design/tailwind.mjs',
      durationMs: 1,
      gate: {
        command: 'node scripts/checks/design/tailwind.mjs',
        group: 'design',
        name: 'verify:design:tailwind',
      },
      status: 'fail',
    }, {
      changedFileEntries: ['M:tailwind.config.ts'],
      changedFiles: ['tailwind.config.ts'],
      mode: 'affected',
      reasons: {
        'verify:design:tailwind': [
          'tailwind.config.ts: Zeta surface',
          'tailwind.config.ts: Alpha surface',
        ],
      },
    });
    assertIncludes(context, '[why] verify:design:tailwind selected because:', 'failed gate context should start with the selected gate');
    assertIncludes(context, 'changed files: tailwind.config.ts', 'failed gate context should include changed files');
    assertTrue(
      context.indexOf('Alpha surface') < context.indexOf('Zeta surface'),
      'failed gate context should print reasons in stable alphabetical order',
    );
    assertIncludes(context, 'group: design', 'failed gate context should include gate group');
    assertIncludes(context, 'reproduce: node scripts/checks/design/tailwind.mjs', 'failed gate context should include reproduction command');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerAffectedExplainBehaviorCheck();
  reportOk('summary, JSON summary, why, JSON why, and affected snapshot checks passed.');
}
