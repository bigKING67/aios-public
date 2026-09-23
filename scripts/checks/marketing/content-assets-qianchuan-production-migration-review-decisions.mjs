#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationReviewDecisions,
  parseQianchuanProductionMigrationReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-decisions-cli.mjs';
import { buildQianchuanProductionMigrationReviewDecisions } from '../../lib/migrations/aios-qianchuan-production-migration-review-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-review-decisions.mjs \\
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \\
    --evidence /tmp/p1b-live-probe.json --evidence-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --output /tmp/review-decisions.json [--json]

This command is offline and records only the exact three allowlisted P1B not_applicable owner
decisions. It verifies pinned external artifacts, never mutates the source manifest, and does
not authorize production, ledger, migration, network, or deployment writes.`;

try {
  const options = parseQianchuanProductionMigrationReviewDecisionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifest = readExternalMigrationAuditJson(options.manifestPath);
    const evidence = readExternalMigrationAuditJson(options.evidencePath);
    const result = buildQianchuanProductionMigrationReviewDecisions({
      evidence: evidence.data,
      evidenceArtifact: evidence.metadata,
      evidenceSha256: options.evidenceSha256,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationReviewDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-review-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
