#!/usr/bin/env node

import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanProductionMigrationP1cCatalogProbe,
  parseQianchuanProductionMigrationP1cCatalogProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-catalog-probe-cli.mjs';
import {
  runQianchuanProductionMigrationP1cCatalogProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-catalog-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1c-catalog-probe.mjs \
    --lineage /tmp/p1c-lineage.json --lineage-sha256 <sha256> \
    [--output /tmp/p1c-catalog-probe.json] [--json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

The probe pins the offline lineage packet and runs only BEGIN READ ONLY, SET LOCAL, SELECT,
and ROLLBACK. It records current catalog topology, routine hashes, columns, and exact row counts,
but never changes classifications, reviewers, owner decisions, ledger state, or deployment state.`;

let client;
try {
  const options = parseQianchuanProductionMigrationP1cCatalogProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const lineageSource = readExternalMigrationAuditJson(options.lineagePath);
    client = new pg.Client({
      application_name: 'aios-qianchuan-p1c-catalog-readonly',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanProductionMigrationP1cCatalogProbe({
      client,
      lineage: lineageSource.data,
      lineageArtifact: lineageSource.metadata,
      lineageSha256: options.lineageSha256,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1cCatalogProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1c-catalog-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
