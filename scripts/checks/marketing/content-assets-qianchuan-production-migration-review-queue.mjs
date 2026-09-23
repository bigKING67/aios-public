#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationReviewQueue,
  parseQianchuanProductionMigrationReviewQueueArgs,
  qianchuanProductionMigrationReviewQueueExitCode,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-queue-cli.mjs';
import {
  buildQianchuanProductionMigrationReviewQueue,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-queue.mjs';
import {
  buildReviewedQianchuanProductionMigrationReviewQueue,
} from '../../lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-review-queue.mjs --manifest /tmp/reconciliation.json [--decisions /tmp/review-decisions.json --decisions-sha256 <sha256>] [--output /tmp/review-queue.json] [--json] [--require-reviewed]

This command is offline and performs no database or network access. It preserves authoritative
migration classifications, prioritizes unresolved review work, and writes only to an explicit
absolute path outside the repository using exclusive file creation.`;

try {
  const options = parseQianchuanProductionMigrationReviewQueueArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const source = readExternalMigrationAuditJson(options.manifestPath);
    const decisionSource = options.decisionsPath
      ? readExternalMigrationAuditJson(options.decisionsPath)
      : null;
    const result = decisionSource
      ? buildReviewedQianchuanProductionMigrationReviewQueue({
        decisions: decisionSource.data,
        decisionsArtifact: decisionSource.metadata,
        decisionsSha256: options.decisionsSha256,
        manifest: source.data,
        sourceArtifact: source.metadata,
      })
      : buildQianchuanProductionMigrationReviewQueue({
        manifest: source.data,
        sourceArtifact: source.metadata,
      });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationReviewQueue(result, artifact));
    process.exitCode = qianchuanProductionMigrationReviewQueueExitCode(
      result,
      options.requireReviewed,
    );
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-review-queue] failed: ${detail}`);
  process.exitCode = 1;
}
