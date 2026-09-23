#!/usr/bin/env node

import pg from 'pg';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanProductionMigrationReconciliation,
  parseQianchuanProductionMigrationReconciliationArgs,
  writeQianchuanProductionMigrationReconciliationArtifact,
} from '../../lib/migrations/aios-qianchuan-production-migration-reconciliation-cli.mjs';
import {
  qianchuanProductionMigrationReconciliationExitCode,
  runQianchuanProductionMigrationReconciliation,
} from '../../lib/migrations/aios-qianchuan-production-migration-reconciliation.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-reconciliation.mjs [--json] [--output /tmp/manifest.json] [--require-reconciled]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

Optional environment:
  STATEMENT_TIMEOUT_MS=15000

The audit emits one entry per discovered migration. Catalog evidence never proves execution by itself.
Artifacts are written only to an explicit absolute path outside the repository and never overwrite an existing file.
The database transaction allows BEGIN READ ONLY, SET LOCAL statement_timeout, SELECT, and ROLLBACK only.`;

let client;
try {
  const options = parseQianchuanProductionMigrationReconciliationArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const descriptor = readAiosMigrationDescriptor();
    const records = discoverAiosMigrations({ descriptor });
    client = new pg.Client({
      application_name: 'aios-qianchuan-migration-reconciliation-readonly',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanProductionMigrationReconciliation({
      client,
      descriptor,
      records,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const artifact = writeQianchuanProductionMigrationReconciliationArtifact(
      result,
      options.outputPath,
    );
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionMigrationReconciliation(result, artifact));
    process.exitCode = qianchuanProductionMigrationReconciliationExitCode(
      result,
      options.requireReconciled,
    );
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-reconciliation] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
