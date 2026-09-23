#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1cReviewDecisions,
  parseQianchuanProductionMigrationP1cReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-review-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationP1cReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-review-decisions.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1c-review-decisions.mjs \\
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \\
    --prior-decisions /tmp/p1b-decisions.json --prior-decisions-sha256 <sha256> \\
    --lineage /tmp/p1c-lineage.json --lineage-sha256 <sha256> \\
    --catalog-probe /tmp/p1c-catalog-probe.json --catalog-probe-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --output /tmp/p1c-review-decisions.json [--json]

This offline command preserves the prior three P1B decisions and appends only the exact
13-entry P1C not_applicable cohort. It verifies all pinned artifacts and never authorizes
production, ledger, migration, network, Ark, or deployment writes.`;

try {
  const options = parseQianchuanProductionMigrationP1cReviewDecisionArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifest = readExternalMigrationAuditJson(options.manifestPath);
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const lineage = readExternalMigrationAuditJson(options.lineagePath);
    const catalogProbe = readExternalMigrationAuditJson(options.catalogProbePath);
    const result = buildQianchuanProductionMigrationP1cReviewDecisions({
      catalogProbe: catalogProbe.data,
      catalogProbeArtifact: catalogProbe.metadata,
      catalogProbeSha256: options.catalogProbeSha256,
      lineage: lineage.data,
      lineageArtifact: lineage.metadata,
      lineageSha256: options.lineageSha256,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1cReviewDecisions(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1c-review-decisions] failed: ${detail}`);
  process.exitCode = 1;
}
