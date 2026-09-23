#!/usr/bin/env node

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanInfluencerTagForwardRepairDecisions,
  parseQianchuanInfluencerTagForwardRepairDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions-cli.mjs';
import {
  buildQianchuanInfluencerTagForwardRepairDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs \\
    --prior-decisions /tmp/alimama-decisions.json --prior-decisions-sha256 <sha256> \\
    --plan /tmp/influencer-tag-repair-plan.json --plan-sha256 <sha256> \\
    --stage1 /tmp/influencer-tag-stage1.json --stage1-sha256 <sha256> \\
    --stage2-checkpoint /tmp/influencer-tag-stage2-completed.json --stage2-checkpoint-sha256 <sha256> \\
    --postrepair-probe /tmp/influencer-tag-postrepair.json --postrepair-probe-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --confirm-influencer-tag-forward-repair-decision \\
    --output /tmp/influencer-tag-forward-repair-decisions.json [--json]

This offline command preserves the immutable prior 21 decisions and appends only
warehouse/20260510_1800 as verified_forward_repaired with historicalExecution=false
and ledgerAction=do_not_record. It requires explicit repository-owner confirmation,
the exact plan/Stage 1/completed Stage 2 chain, and a later independent --postrepair
zero-drift artifact. It never connects to production, writes the ledger, executes a
migration or repair, changes VPS/deploy state, or invokes Ark.`;

try {
  const options = parseQianchuanInfluencerTagForwardRepairDecisionArgs(
    process.argv.slice(2),
  );
  if (options.help) {
    console.log(USAGE);
  } else {
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const plan = readExternalMigrationAuditJson(options.planPath);
    const stage1 = readExternalMigrationAuditJson(options.stage1Path);
    const stage2Checkpoint = readExternalMigrationAuditJson(options.stage2CheckpointPath);
    const postrepairProbe = readExternalMigrationAuditJson(options.postrepairProbePath);
    const result = buildQianchuanInfluencerTagForwardRepairDecisions({
      confirmed: options.confirmed,
      plan: plan.data,
      planArtifact: plan.metadata,
      planSha256: options.planSha256,
      postrepairProbe: postrepairProbe.data,
      postrepairProbeArtifact: postrepairProbe.metadata,
      postrepairProbeSha256: options.postrepairProbeSha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
      stage1: stage1.data,
      stage1Artifact: stage1.metadata,
      stage1Sha256: options.stage1Sha256,
      stage2Checkpoint: stage2Checkpoint.data,
      stage2CheckpointArtifact: stage2Checkpoint.metadata,
      stage2CheckpointSha256: options.stage2CheckpointSha256,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanInfluencerTagForwardRepairDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-influencer-tag-forward-repair-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
