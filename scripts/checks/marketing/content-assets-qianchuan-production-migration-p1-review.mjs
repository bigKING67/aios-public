#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1Review,
  parseQianchuanProductionMigrationP1ReviewArgs,
  qianchuanProductionMigrationP1ReviewExitCode,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1-review-cli.mjs';
import {
  buildQianchuanProductionMigrationP1ReviewPacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1-review.mjs';
import {
  buildReviewedQianchuanProductionMigrationP1Packet,
} from '../../lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1-review.mjs --manifest /tmp/reconciliation.json [--decisions /tmp/review-decisions.json --decisions-sha256 <sha256>] [--output /tmp/p1-review.json] [--json] [--require-reviewed]

This command is offline. It verifies repository source checksums, groups target-prefix schema
conflicts into deterministic P1 review waves, preserves authoritative classifications, and
writes only to an explicit external path using exclusive creation.`;

try {
  const options = parseQianchuanProductionMigrationP1ReviewArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const source = readExternalMigrationAuditJson(options.manifestPath);
    const decisionSource = options.decisionsPath
      ? readExternalMigrationAuditJson(options.decisionsPath)
      : null;
    const result = decisionSource
      ? buildReviewedQianchuanProductionMigrationP1Packet({
        decisions: decisionSource.data,
        decisionsArtifact: decisionSource.metadata,
        decisionsSha256: options.decisionsSha256,
        manifest: source.data,
        sourceArtifact: source.metadata,
      })
      : buildQianchuanProductionMigrationP1ReviewPacket({
        manifest: source.data,
        sourceArtifact: source.metadata,
      });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1Review(result, artifact));
    process.exitCode = qianchuanProductionMigrationP1ReviewExitCode(
      result,
      options.requireReviewed,
    );
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1-review] failed: ${detail}`);
  process.exitCode = 1;
}
