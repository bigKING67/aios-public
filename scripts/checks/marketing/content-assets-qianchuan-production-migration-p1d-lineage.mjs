#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1dLineage,
  parseQianchuanProductionMigrationP1dLineageArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-lineage-cli.mjs';
import {
  buildQianchuanProductionMigrationP1dLineagePacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-lineage.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1d-lineage.mjs \
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \
    [--output /tmp/p1d-lineage.json] [--json]

This command is offline. It pins the exact current 8-entry P1D cohort, verifies migration,
successor-migration and runtime-callsite evidence, preserves null owner decisions, and performs
no database, network, ledger, migration, deployment or Ark action.`;

try {
  const options = parseQianchuanProductionMigrationP1dLineageArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifestSource = readExternalMigrationAuditJson(options.manifestPath);
    const p1Source = readExternalMigrationAuditJson(options.p1Path);
    const result = buildQianchuanProductionMigrationP1dLineagePacket({
      manifest: manifestSource.data,
      manifestArtifact: manifestSource.metadata,
      manifestSha256: options.manifestSha256,
      p1Packet: p1Source.data,
      p1Artifact: p1Source.metadata,
      p1Sha256: options.p1Sha256,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1dLineage(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1d-lineage] failed: ${detail}`);
  process.exitCode = 1;
}
