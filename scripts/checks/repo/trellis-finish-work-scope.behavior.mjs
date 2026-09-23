#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createCheckGuard,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditFinishWorkContractTexts,
  auditFinishWorkStagedEntries,
  parseGitNameStatusZ,
  readStagedArchiveTaskMetadata,
} from '../../lib/repo/trellis-finish-work-scope-core.mjs';

const {
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('trellis-finish-work-scope-behavior');

function findingReasons(findings) {
  return findings.map((finding) => finding.reason).join('\n');
}

const parsed = parseGitNameStatusZ([
  'R100',
  '.trellis/tasks/example/prd.md',
  '.trellis/tasks/archive/2026-07/example/prd.md',
  'M',
  '.trellis/workspace/Codex/index.md',
  '',
].join('\0'));
assertDeepEqual(
  parsed,
  [
    {
      status: 'R100',
      oldPath: '.trellis/tasks/example/prd.md',
      newPath: '.trellis/tasks/archive/2026-07/example/prd.md',
    },
    {
      status: 'M',
      file: '.trellis/workspace/Codex/index.md',
    },
  ],
  'NUL name-status parser should preserve rename and normal entries',
);

const metadataRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-metadata-'));
try {
  execFileSync('git', ['init', '--quiet'], { cwd: metadataRepo });
  const stagedTaskPath = '.trellis/tasks/archive/2026-07/index-truth/task.json';
  const absoluteTaskPath = path.join(metadataRepo, stagedTaskPath);
  fs.mkdirSync(path.dirname(absoluteTaskPath), { recursive: true });
  fs.writeFileSync(absoluteTaskPath, JSON.stringify({
    completedAt: '2026-07-12',
    status: 'completed',
    workflow_profile: 'lite',
  }));
  execFileSync('git', ['add', stagedTaskPath], { cwd: metadataRepo });
  fs.writeFileSync(absoluteTaskPath, JSON.stringify({
    completedAt: null,
    status: 'in_progress',
    workflow_profile: 'full',
  }));

  const stagedMetadata = readStagedArchiveTaskMetadata(metadataRepo, [
    { status: 'A', file: stagedTaskPath },
  ]).get('index-truth');
  assertDeepEqual(
    stagedMetadata,
    {
      completedAt: '2026-07-12',
      status: 'completed',
      workflowProfile: 'lite',
    },
    'Lite metadata must come from the Git index rather than the working tree',
  );
} finally {
  fs.rmSync(metadataRepo, { force: true, recursive: true });
}

const safeAudit = auditFinishWorkStagedEntries(parsed);
assertIncludes(
  findingReasons(safeAudit.findings),
  'workspace journals are host-local',
  'tracked workspace changes must fail after the local-journal cutover',
);
assertDeepEqual(safeAudit.archiveTaskSlugs, ['example'], 'archive slug should be captured');

const archiveRenameAudit = auditFinishWorkStagedEntries(parsed.slice(0, 1));
assertEqual(archiveRenameAudit.findings.length, 0, 'archive rename without workspace files should pass');

const productAudit = auditFinishWorkStagedEntries([
  { status: 'M', file: 'apps/web-vite/src/app/dashboard/page.tsx' },
]);
assertIncludes(
  findingReasons(productAudit.findings),
  'finish-work bookkeeping commits may only stage Trellis task archive moves',
  'product code staging should fail',
);

const liteMixedEntries = [
  {
    status: 'R100',
    oldPath: '.trellis/tasks/lite-task/prd.md',
    newPath: '.trellis/tasks/archive/2026-07/lite-task/prd.md',
  },
  {
    status: 'R095',
    oldPath: '.trellis/tasks/lite-task/task.json',
    newPath: '.trellis/tasks/archive/2026-07/lite-task/task.json',
  },
  { status: 'M', file: 'scripts/checks/repo/example.mjs' },
];
const liteMixedAudit = auditFinishWorkStagedEntries(liteMixedEntries, {
  allowLiteWork: true,
  requireStaged: true,
  taskMetadataBySlug: new Map([['lite-task', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertEqual(liteMixedAudit.findings.length, 0, 'Lite archive plus work path should pass explicit Lite mode');
assertEqual(liteMixedAudit.productPathCount, 1, 'Lite mode should count staged work paths');

const liteTrellisSourceAudit = auditFinishWorkStagedEntries([
  ...liteMixedEntries,
  { status: 'M', file: '.trellis/scripts/add_session.py' },
  { status: 'M', file: '.trellis/spec/repo/quality-gates.md' },
], {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([['lite-task', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertEqual(
  liteTrellisSourceAudit.findings.length,
  0,
  'Lite governance work should allow Trellis scripts and specs',
);
assertEqual(liteTrellisSourceAudit.productPathCount, 3, 'Lite source allowlist should count as work');

const forbiddenLiteTrellisAudit = auditFinishWorkStagedEntries([
  ...liteMixedEntries,
  { status: 'M', file: '.trellis/config.yaml' },
  { status: 'M', file: '.trellis/workflow.md' },
], {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([['lite-task', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertTrue(
  forbiddenLiteTrellisAudit.findings.some((finding) => finding.file === '.trellis/config.yaml'),
  'Lite work must keep Trellis config outside the source allowlist',
);
assertTrue(
  forbiddenLiteTrellisAudit.findings.some((finding) => finding.file === '.trellis/workflow.md'),
  'Lite work must keep the workflow contract outside the source allowlist',
);

const newLiteMixedAudit = auditFinishWorkStagedEntries([
  { status: 'A', file: '.trellis/tasks/archive/2026-07/new-lite/prd.md' },
  { status: 'A', file: '.trellis/tasks/archive/2026-07/new-lite/task.json' },
  { status: 'A', file: 'scripts/checks/repo/new-lite-work.mjs' },
], {
  allowLiteWork: true,
  requireStaged: true,
  taskMetadataBySlug: new Map([['new-lite', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertEqual(
  newLiteMixedAudit.findings.length,
  0,
  'A new Lite task first committed from its archive path should pass',
);

const fullMixedAudit = auditFinishWorkStagedEntries(liteMixedEntries, {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([['lite-task', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'full',
  }]]),
});
assertIncludes(
  findingReasons(fullMixedAudit.findings),
  'workflow_profile=lite',
  'Full and legacy tasks must not use Lite mixed-commit mode',
);

const liteJournalAudit = auditFinishWorkStagedEntries([
  ...liteMixedEntries,
  { status: 'M', file: '.trellis/workspace/Codex/index.md' },
], {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([['lite-task', {
    completedAt: '2026-07-12',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertIncludes(
  findingReasons(liteJournalAudit.findings),
  'workspace journals are host-local',
  'Lite mixed work commits must not include journal bookkeeping',
);

const liteArchiveOnlyAudit = auditFinishWorkStagedEntries(
  liteMixedEntries.filter((entry) => !entry.file?.startsWith('scripts/')),
  {
    allowLiteWork: true,
    taskMetadataBySlug: new Map([['lite-task', {
      completedAt: '2026-07-12',
      status: 'completed',
      workflowProfile: 'lite',
    }]]),
  },
);
assertIncludes(
  findingReasons(liteArchiveOnlyAudit.findings),
  'requires at least one staged task-owned work path',
  'Lite mixed mode should not replace the archive-only bookkeeping guard',
);

const multipleLiteAudit = auditFinishWorkStagedEntries([
  ...liteMixedEntries,
  {
    status: 'R100',
    oldPath: '.trellis/tasks/other-lite/prd.md',
    newPath: '.trellis/tasks/archive/2026-07/other-lite/prd.md',
  },
], {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([
    ['lite-task', {
      completedAt: '2026-07-12',
      status: 'completed',
      workflowProfile: 'lite',
    }],
    ['other-lite', {
      completedAt: '2026-07-12',
      status: 'completed',
      workflowProfile: 'lite',
    }],
  ]),
});
assertIncludes(
  findingReasons(multipleLiteAudit.findings),
  'exactly one archive task',
  'Lite mixed mode should reject multiple task archives',
);

const staleArchiveAdditionAudit = auditFinishWorkStagedEntries([
  { status: 'A', file: '.trellis/tasks/archive/2026-07/stale-lite/extra.md' },
  { status: 'M', file: 'scripts/checks/repo/example.mjs' },
], {
  allowLiteWork: true,
  taskMetadataBySlug: new Map([['stale-lite', {
    completedAt: '2026-07-01',
    status: 'completed',
    workflowProfile: 'lite',
  }]]),
});
assertIncludes(
  findingReasons(staleArchiveAdditionAudit.findings),
  'requires the archived task.json',
  'Adding files to an existing Lite archive must not impersonate closeout',
);

const liveTaskAddAudit = auditFinishWorkStagedEntries([
  { status: 'A', file: '.trellis/tasks/new-task/prd.md' },
]);
assertIncludes(
  findingReasons(liveTaskAddAudit.findings),
  'live task paths may only be deleted',
  'live task additions should not pass as finish-work bookkeeping',
);

const unmatchedDeleteAudit = auditFinishWorkStagedEntries([
  { status: 'D', file: '.trellis/tasks/old-task/prd.md' },
]);
assertIncludes(
  findingReasons(unmatchedDeleteAudit.findings),
  'staged without a matching archive target',
  'task deletion without archive target should fail',
);

const archiveOnlyAudit = auditFinishWorkStagedEntries([
  { status: 'A', file: '.trellis/tasks/archive/2026-07/old-task/prd.md' },
]);
assertEqual(archiveOnlyAudit.findings.length, 0, 'archive-only additions remain valid for legacy untracked task cleanup');

const emptyRequiredAudit = auditFinishWorkStagedEntries([], { requireStaged: true });
assertTrue(emptyRequiredAudit.findings.length > 0, 'requireStaged should fail on an empty index');

const currentTexts = new Map([
  ['.trellis/config.yaml', 'session_auto_commit: false\n'],
  ['.trellis/workflow.md', 'Finish-work is scoped manual bookkeeping.\n'],
  ['.agents/skills/trellis-finish-work/SKILL.md', 'Manual scoped Trellis bookkeeping commit.\n'],
  ['.pi/prompts/trellis-finish-work.md', 'Manual scoped Trellis bookkeeping commit.\n'],
]);
assertEqual(auditFinishWorkContractTexts(currentTexts).length, 0, 'current contract wording should pass');

const staleTexts = new Map(currentTexts);
staleTexts.set('.trellis/workflow.md', 'archive commit -> journal commit\n');
const staleFindings = auditFinishWorkContractTexts(staleTexts);
assertIncludes(
  findingReasons(staleFindings),
  'stale finish-work auto-commit wording found',
  'stale auto-commit wording should fail',
);

const badConfigTexts = new Map(currentTexts);
badConfigTexts.set('.trellis/config.yaml', 'session_auto_commit: true\n');
assertFalse(
  auditFinishWorkContractTexts(badConfigTexts).length === 0,
  'session_auto_commit drift should fail',
);

reportOk('parser, staged scope, stale wording, and config drift fixtures passed.');
