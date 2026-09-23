#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  applyTrellisRuntimeCleanup,
  auditTrellisRuntime,
  formatTrellisRuntimeReport,
  parseTrellisRuntimeArgs,
} from '../../lib/repo/trellis-runtime-hygiene-core.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('trellis-runtime-hygiene-behavior');

const NOW_MS = Date.parse('2026-07-13T00:00:00Z');
const OLD_MS = Date.parse('2026-05-01T00:00:00Z');

function writeFile(root, relativePath, content, mtimeMs = OLD_MS) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  const timestamp = new Date(mtimeMs);
  fs.utimesSync(absolutePath, timestamp, timestamp);
  return absolutePath;
}

function runFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-trellis-runtime-'));
  try {
    const staleMarker = writeFile(root, '.trellis/.runtime/update-check-old.marker', 'checked\n');
    const recentMarker = writeFile(
      root,
      '.trellis/.runtime/update-check-recent.marker',
      'checked\n',
      NOW_MS - 2 * 24 * 60 * 60 * 1000,
    );
    const staleSession = writeFile(root, '.trellis/.runtime/sessions/codex-old.json', '{}\n');
    const removableLog = writeFile(root, '.trellis/workspace/runtime-logs/removable.log', 'old log\n');
    const referencedLog = writeFile(root, '.trellis/workspace/runtime-logs/referenced.json', '{}\n');
    const livePid = writeFile(root, '.trellis/workspace/runtime-logs/live-worker.pid', `${process.pid}\n`);
    const liveLog = writeFile(root, '.trellis/workspace/runtime-logs/live-worker.log', 'live log\n');
    const deadPid = writeFile(root, '.trellis/workspace/runtime-logs/dead-worker.pid', '424242\n');
    const deadLog = writeFile(root, '.trellis/workspace/runtime-logs/dead-worker.log', 'dead log\n');
    const symlinkPath = path.join(root, '.trellis/workspace/runtime-logs/link.log');
    fs.symlinkSync(removableLog, symlinkPath);
    writeFile(root, '.trellis/.runtime/unknown.bin', 'unknown\n');
    writeFile(
      root,
      '.trellis/tasks/07-13-active/prd.md',
      'Evidence: `.trellis/workspace/runtime-logs/referenced.json`.\n',
    );

    const audit = auditTrellisRuntime(root, {
      nowMs: NOW_MS,
      processAlive: (pid) => pid === process.pid,
      retentionDays: 30,
    });
    const candidateFiles = audit.candidates.map(({ file }) => file);
    const protectedByFile = new Map(audit.protectedFiles.map(({ file, reason }) => [file, reason]));

    assertTrue(candidateFiles.includes('.trellis/.runtime/update-check-old.marker'), 'stale markers should be candidates');
    assertTrue(candidateFiles.includes('.trellis/.runtime/sessions/codex-old.json'), 'stale session pointers should be candidates');
    assertTrue(candidateFiles.includes('.trellis/workspace/runtime-logs/removable.log'), 'unreferenced stale logs should be candidates');
    assertTrue(candidateFiles.includes('.trellis/workspace/runtime-logs/dead-worker.pid'), 'dead PID files should be candidates');
    assertTrue(candidateFiles.includes('.trellis/workspace/runtime-logs/dead-worker.log'), 'dead PID siblings should be candidates');
    assertEqual(protectedByFile.get('.trellis/.runtime/update-check-recent.marker'), 'within-retention', 'recent markers should be protected');
    assertEqual(protectedByFile.get('.trellis/workspace/runtime-logs/referenced.json'), 'active-task-reference', 'active task references should be protected');
    assertEqual(protectedByFile.get('.trellis/workspace/runtime-logs/live-worker.pid'), 'live-pid-family', 'live PID files should be protected');
    assertEqual(protectedByFile.get('.trellis/workspace/runtime-logs/live-worker.log'), 'live-pid-family', 'live PID siblings should be protected');
    assertEqual(protectedByFile.get('.trellis/workspace/runtime-logs/link.log'), 'symlink', 'symlinks should be protected');
    assertFalse(candidateFiles.includes('.trellis/.runtime/unknown.bin'), 'unknown runtime paths must stay outside the allowlist');

    const dryRunReport = formatTrellisRuntimeReport(audit);
    assertIncludes(dryRunReport, 'mode=dry-run', 'default report should state dry-run mode');
    assertIncludes(dryRunReport, 'no files were deleted', 'dry-run report should be explicit');
    for (const file of [staleMarker, staleSession, removableLog, referencedLog, livePid, liveLog, deadPid, deadLog, recentMarker]) {
      assertTrue(fs.existsSync(file), `dry-run must preserve ${path.basename(file)}`);
    }

    const applyResult = applyTrellisRuntimeCleanup(audit, {
      removeFile: (file) => {
        if (file === removableLog) {
          throw new Error('fixture delete failure');
        }
        fs.unlinkSync(file);
      },
    });
    assertEqual(applyResult.failures.length, 1, 'apply should report individual deletion failures');
    assertTrue(fs.existsSync(removableLog), 'failed candidate should remain');
    assertFalse(fs.existsSync(staleMarker), 'successful candidate deletion should apply');
    assertFalse(fs.existsSync(staleSession), 'successful session candidate deletion should apply');
    assertTrue(fs.existsSync(referencedLog), 'protected referenced log should remain after apply');
    assertTrue(fs.existsSync(livePid), 'protected live PID should remain after apply');
    assertTrue(fs.existsSync(liveLog), 'protected live PID sibling should remain after apply');

    const applyReport = formatTrellisRuntimeReport(audit, { applyResult });
    assertIncludes(applyReport, 'mode=apply', 'apply report should state apply mode');
    assertIncludes(applyReport, 'failed=1', 'apply report should expose failures');

    assertEqual(parseTrellisRuntimeArgs([]).apply, false, 'CLI defaults to dry-run');
    assertEqual(parseTrellisRuntimeArgs(['--retention-days', '45']).retentionDays, 45, 'CLI should parse retention days');
    assertEqual(parseTrellisRuntimeArgs(['--apply']).apply, true, 'CLI requires explicit apply flag');
    let invalidRejected = false;
    try {
      parseTrellisRuntimeArgs(['--retention-days', '0']);
    } catch {
      invalidRejected = true;
    }
    assertTrue(invalidRejected, 'invalid retention values should be rejected');
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
}

runFixture();
reportOk('dry-run, retention, active-reference, PID-family, symlink, allowlist, apply, and partial-failure contracts passed.');
