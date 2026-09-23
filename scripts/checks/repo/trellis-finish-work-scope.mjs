#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditFinishWorkContractTexts,
  auditFinishWorkStagedEntries,
  FINISH_WORK_SCOPE_GUARD_NAME,
  formatFinishWorkScopeFailure,
  readFinishWorkContractTexts,
  readStagedArchiveTaskMetadata,
  readStagedNameStatusEntries,
} from '../../lib/repo/trellis-finish-work-scope-core.mjs';
import {
  createCheckGuard,
} from '../../lib/shared/guard-utils.mjs';

export {
  auditFinishWorkContractTexts,
  auditFinishWorkStagedEntries,
  formatFinishWorkScopeFailure,
  readFinishWorkContractTexts,
  readStagedArchiveTaskMetadata,
  readStagedNameStatusEntries,
} from '../../lib/repo/trellis-finish-work-scope-core.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../../..');

function parseArgs(argv) {
  return {
    allowLiteWork: argv.includes('--allow-lite-work'),
    requireStaged: argv.includes('--require-staged'),
  };
}

function main() {
  const { fail, reportOk } = createCheckGuard(FINISH_WORK_SCOPE_GUARD_NAME, { errorPrefix: '' });
  const args = parseArgs(process.argv.slice(2));
  const stagedEntries = readStagedNameStatusEntries(ROOT_DIR);
  const taskMetadataBySlug = readStagedArchiveTaskMetadata(ROOT_DIR, stagedEntries);
  const stagedAudit = args.requireStaged
    ? auditFinishWorkStagedEntries(stagedEntries, {
      allowLiteWork: args.allowLiteWork,
      requireStaged: true,
      taskMetadataBySlug,
    })
    : {
      archiveTaskSlugs: [],
      findings: [],
      stagedPathCount: stagedEntries.length,
    };
  const contractFindings = auditFinishWorkContractTexts(readFinishWorkContractTexts(ROOT_DIR));
  const findings = [
    ...stagedAudit.findings,
    ...contractFindings,
  ];

  if (findings.length > 0) {
    fail(formatFinishWorkScopeFailure(findings));
  }

  const archiveSummary = stagedAudit.archiveTaskSlugs.length > 0
    ? ` archive_tasks=${stagedAudit.archiveTaskSlugs.join(',')}`
    : '';
  const stagedMode = args.requireStaged ? 'checked' : 'skipped';
  const auditMode = args.allowLiteWork ? 'lite-work' : 'bookkeeping';
  reportOk(`staged_scope=${stagedMode}; mode=${auditMode}; staged_paths=${stagedAudit.stagedPathCount}; product_paths=${stagedAudit.productPathCount ?? 0}; finish-work contract text current.${archiveSummary}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
