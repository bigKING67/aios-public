#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1dForwardRepairDecisions,
  parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationP1dForwardRepairDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1d-forward-repair-decisions.mjs \\
    --prior-decisions /tmp/p1d-decisions.json --prior-decisions-sha256 <sha256> \\
    --owner-review-probe /tmp/p1d-owner-review-probe.json --owner-review-probe-sha256 <sha256> \\
    --stage2-checkpoint /tmp/card-ratio-stage2-completed.json --stage2-checkpoint-sha256 <sha256> \\
    --postcheck-probe /tmp/card-ratio-postcheck.json --postcheck-probe-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --confirm-card-ratio-forward-repair-decision \\
    --output /tmp/p1d-forward-repair-decisions.json [--json]

This offline command preserves the immutable prior 19 decisions and appends only
warehouse/20260609_2045 as verified_forward_repaired with historicalExecution=false
and ledgerAction=do_not_record. It requires explicit confirmation and pinned read-only/
checkpoint evidence. It never writes production, ledger, migration, VPS, deploy, or Ark state.`;

try {
  const options = parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs(
    process.argv.slice(2),
  );
  if (options.help) {
    console.log(USAGE);
  } else {
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const ownerReviewProbe = readExternalMigrationAuditJson(options.ownerReviewProbePath);
    const stage2Checkpoint = readExternalMigrationAuditJson(options.stage2CheckpointPath);
    const postcheckProbe = readExternalMigrationAuditJson(options.postcheckProbePath);
    const result = buildQianchuanProductionMigrationP1dForwardRepairDecisions({
      confirmed: options.confirmed,
      ownerReviewProbe: ownerReviewProbe.data,
      ownerReviewProbeArtifact: ownerReviewProbe.metadata,
      ownerReviewProbeSha256: options.ownerReviewProbeSha256,
      postcheckProbe: postcheckProbe.data,
      postcheckProbeArtifact: postcheckProbe.metadata,
      postcheckProbeSha256: options.postcheckProbeSha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
      stage2Checkpoint: stage2Checkpoint.data,
      stage2CheckpointArtifact: stage2Checkpoint.metadata,
      stage2CheckpointSha256: options.stage2CheckpointSha256,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1dForwardRepairDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1d-forward-repair-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
