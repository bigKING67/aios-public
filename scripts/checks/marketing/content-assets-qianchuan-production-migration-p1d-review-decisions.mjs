#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1dReviewDecisions,
  parseQianchuanProductionMigrationP1dReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-review-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationP1dReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-review-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1d-review-decisions.mjs \\
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \\
    --prior-decisions /tmp/p1c-decisions.json --prior-decisions-sha256 <sha256> \\
    --lineage /tmp/p1d-lineage.json --lineage-sha256 <sha256> \\
    --readonly-probe /tmp/p1d-readonly-probe.json --readonly-probe-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --output /tmp/p1d-review-decisions.json [--json]

This offline command preserves the prior 16 decisions and appends only the exact three-entry
P1D replacement cohort as not_applicable/do_not_record. The other five P1D entries remain
unresolved. It never authorizes production, ledger, migration, network, Ark, or deployment writes.`;

try {
  const options = parseQianchuanProductionMigrationP1dReviewDecisionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifest = readExternalMigrationAuditJson(options.manifestPath);
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const lineage = readExternalMigrationAuditJson(options.lineagePath);
    const readonlyProbe = readExternalMigrationAuditJson(options.readonlyProbePath);
    const result = buildQianchuanProductionMigrationP1dReviewDecisions({
      lineage: lineage.data,
      lineageArtifact: lineage.metadata,
      lineageSha256: options.lineageSha256,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      readonlyProbe: readonlyProbe.data,
      readonlyProbeArtifact: readonlyProbe.metadata,
      readonlyProbeSha256: options.readonlyProbeSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1dReviewDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1d-review-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
