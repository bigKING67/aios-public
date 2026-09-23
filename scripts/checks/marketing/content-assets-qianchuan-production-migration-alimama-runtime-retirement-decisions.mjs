#!/usr/bin/env node

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanAlimamaRuntimeRetirementDecisions,
  parseQianchuanAlimamaRuntimeRetirementDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions-cli.mjs';
import {
  buildQianchuanAlimamaRuntimeRetirementDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs \\
    --prior-decisions /tmp/p1d-forward-repair-decisions.json --prior-decisions-sha256 <sha256> \\
    --probe /tmp/alimama-runtime-replacement-probe.json --probe-sha256 <sha256> \\
    --plan /tmp/alimama-runtime-retirement-plan.json --plan-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --confirm-alimama-runtime-retirement-decision \\
    --output /tmp/alimama-runtime-retirement-decisions.json [--json]

This offline command preserves the immutable prior 20 decisions and appends only
warehouse/20260212_1600 as not_applicable with historicalExecution=false and
ledgerAction=do_not_record. It requires explicit repository-owner confirmation and
SHA-pinned schema-v2 probe/plan evidence. It never connects to production, creates
or applies a migration, writes the ledger, changes VPS/deploy state, or invokes Ark.`;

try {
  const options = parseQianchuanAlimamaRuntimeRetirementDecisionArgs(
    process.argv.slice(2),
  );
  if (options.help) {
    console.log(USAGE);
  } else {
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const probe = readExternalMigrationAuditJson(options.probePath);
    const plan = readExternalMigrationAuditJson(options.planPath);
    const result = buildQianchuanAlimamaRuntimeRetirementDecisions({
      confirmed: options.confirmed,
      plan: plan.data,
      planArtifact: plan.metadata,
      planSha256: options.planSha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanAlimamaRuntimeRetirementDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-alimama-runtime-retirement-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
