#!/usr/bin/env node

import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanProductionMigrationP1cLineage,
  parseQianchuanProductionMigrationP1cLineageArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-lineage-cli.mjs';
import {
  buildQianchuanProductionMigrationP1cLineagePacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-lineage.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1c-lineage.mjs \
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \
    [--output /tmp/p1c-lineage.json] [--json]

This command is offline and performs no database or network access. It pins both source
artifacts, verifies repository migration checksums, preserves unknown classifications and null
owner decisions, and groups the 17-entry P1C lineage cohort without authorizing writes.`;

try {
  const options = parseQianchuanProductionMigrationP1cLineageArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifestSource = readExternalMigrationAuditJson(options.manifestPath);
    const p1Source = readExternalMigrationAuditJson(options.p1Path);
    const result = buildQianchuanProductionMigrationP1cLineagePacket({
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
      : formatQianchuanProductionMigrationP1cLineage(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1c-lineage] failed: ${detail}`);
  process.exitCode = 1;
}
