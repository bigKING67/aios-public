#!/usr/bin/env node

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildTrellisArchiveSourceManifest,
  collectTrellisArchiveInventory,
  parseTrellisArchiveExportArgs,
  resolveTrellisArchiveOutputDir,
} from '../../lib/repo/trellis-archive-export-core.mjs';
import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const {
  assertEqual,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('trellis-archive-export-behavior');

function writeTask(root, month, name, completedAt, extraFiles = {}) {
  const taskDir = path.join(root, '.trellis/tasks/archive', month, name);
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(path.join(taskDir, 'task.json'), `${JSON.stringify({
    id: name,
    status: 'completed',
    completedAt,
  }, null, 2)}\n`);
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const file = path.join(taskDir, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return taskDir;
}

function captureError(callback) {
  try {
    callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const root = mkdtempSync(path.join(tmpdir(), 'aios-trellis-archive-behavior-'));
try {
  const eligibleDir = writeTask(root, '2026-06', '06-22-eligible', '2026-06-22', {
    'prd.md': '# eligible\n',
    'research/evidence.md': 'fixture\n',
  });
  writeTask(root, '2026-06', '06-23-boundary', '2026-06-23', {
    'prd.md': '# boundary\n',
  });

  const inventory = collectTrellisArchiveInventory(root, { cutoffExclusive: '2026-06-23' });
  assertEqual(inventory.inspectedTaskCount, 2, 'inventory should inspect every archived task');
  assertEqual(inventory.eligibleTasks.length, 1, 'cutoff should be exclusive');
  assertIncludes(inventory.eligibleTasks[0].path, '06-22-eligible', 'older completed task should be selected');

  const eligibleRelative = path.relative(root, eligibleDir).replace(/\\/gu, '/');
  const trackedFiles = [
    `${eligibleRelative}/prd.md`,
    `${eligibleRelative}/research/evidence.md`,
    `${eligibleRelative}/task.json`,
    '.trellis/tasks/archive/2026-06/06-23-boundary/prd.md',
    '.trellis/tasks/archive/2026-06/06-23-boundary/task.json',
  ];
  const manifest = buildTrellisArchiveSourceManifest(root, inventory.eligibleTasks, { trackedFiles });
  assertEqual(manifest.taskCount, 1, 'source manifest should retain selected task count');
  assertEqual(manifest.fileCount, 3, 'source manifest should include selected tracked files only');
  assertTrue(
    manifest.entries.every(({ file }) => file.includes('06-22-eligible')),
    'boundary task files must not leak into the source manifest',
  );
  assertEqual(
    manifest.entries.map(({ file }) => file).join('\n'),
    [...manifest.entries].map(({ file }) => file).sort().join('\n'),
    'source manifest paths should be bytewise sorted',
  );

  const originalTreeHash = manifest.sourceTreeSha256;
  writeFileSync(path.join(eligibleDir, 'prd.md'), '# changed\n');
  const changedManifest = buildTrellisArchiveSourceManifest(root, inventory.eligibleTasks, { trackedFiles });
  assertTrue(
    changedManifest.sourceTreeSha256 !== originalTreeHash,
    'source tree digest should change when archived content changes',
  );

  const options = parseTrellisArchiveExportArgs([
    '--cutoff-exclusive', '2026-06-23',
    '--output-dir', '/tmp/archive-fixture',
  ]);
  assertEqual(options.cutoffExclusive, '2026-06-23', 'cutoff argument should parse');
  assertEqual(options.outputDir, '/tmp/archive-fixture', 'output argument should parse');
  assertIncludes(
    captureError(() => parseTrellisArchiveExportArgs([])),
    '--cutoff-exclusive is required',
    'missing cutoff should fail closed',
  );
  assertIncludes(
    captureError(() => parseTrellisArchiveExportArgs(['--cutoff-exclusive', '2026-02-30'])),
    'valid calendar date',
    'invalid calendar dates should fail closed',
  );
  assertIncludes(
    captureError(() => parseTrellisArchiveExportArgs(['--unknown'])),
    'unknown argument',
    'unknown arguments should fail closed',
  );
  assertIncludes(
    captureError(() => resolveTrellisArchiveOutputDir(root, path.join(root, '.cache/export'))),
    'outside the repository',
    'artifact output should stay outside the repository',
  );
} finally {
  rmSync(root, { force: true, recursive: true });
}

reportOk('exclusive cutoff selection, tracked source filtering, stable ordering, content digests, and fail-closed CLI parsing are covered.');
