#!/usr/bin/env node

import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanProductionMigrationP1dReadonlyProbe,
  parseQianchuanProductionMigrationP1dReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-readonly-probe-cli.mjs';
import {
  runQianchuanProductionMigrationP1dReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-p1d-readonly-probe.mjs \
    --lineage /tmp/p1d-lineage.json --lineage-sha256 <sha256> \
    [--output /tmp/p1d-readonly-probe.json] [--json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

The probe pins the exact P1D lineage artifact and runs only BEGIN READ ONLY, SET LOCAL, SELECT,
WITH and ROLLBACK. It records replacement topology, routine hashes, constraints, indexes,
triggers and exact data-shape postconditions without decisions, writes, migration execution,
deployment or Ark invocation.`;

let client;
try {
  const options = parseQianchuanProductionMigrationP1dReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const lineageSource = readExternalMigrationAuditJson(options.lineagePath);
    client = new pg.Client({
      application_name: 'aios-qianchuan-p1d-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanProductionMigrationP1dReadonlyProbe({
      client,
      lineage: lineageSource.data,
      lineageArtifact: lineageSource.metadata,
      lineageSha256: options.lineageSha256,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationP1dReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-p1d-readonly-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
