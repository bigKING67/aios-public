#!/usr/bin/env node

import pg from 'pg';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanProductionCutoverReadiness,
  parseQianchuanProductionCutoverArgs,
  qianchuanProductionCutoverExitCode,
  resolveQianchuanProductionCutoverConfig,
} from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  runQianchuanProductionCutoverReadiness,
} from '../../lib/migrations/aios-qianchuan-production-cutover-readiness.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-cutover-readiness.mjs [--json] [--require-ready]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

Optional environment:
  STATEMENT_TIMEOUT_MS=15000
  MIN_QIANCHUAN_BINDING_COVERAGE_PCT=95

The audit uses BEGIN READ ONLY, SET LOCAL statement_timeout, SELECT, and ROLLBACK only.
It never applies/baselines migrations, refreshes data, invokes Ark, or prints DATABASE_URL.`;

let client;
try {
  const options = parseQianchuanProductionCutoverArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const descriptor = readAiosMigrationDescriptor();
    const records = discoverAiosMigrations({ descriptor });
    client = new pg.Client({
      application_name: 'aios-qianchuan-production-cutover-readonly',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanProductionCutoverReadiness({
      client,
      descriptor,
      minimumCoveragePct: config.minimumCoveragePct,
      records,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanProductionCutoverReadiness(result));
    process.exitCode = qianchuanProductionCutoverExitCode(result, options.requireReady);
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-cutover-readiness] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
