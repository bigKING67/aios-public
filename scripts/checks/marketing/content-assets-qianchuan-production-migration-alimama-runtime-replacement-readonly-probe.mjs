#!/usr/bin/env node

import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanAlimamaRuntimeReplacementReadonlyProbe,
  parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe-cli.mjs';
import {
  runQianchuanAlimamaRuntimeReplacementReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs \\
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \\
    --p1d-probe /tmp/p1d-owner-review-probe.json --p1d-probe-sha256 <sha256> \\
    [--output /tmp/alimama-runtime-replacement-probe.json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

This command uses only BEGIN READ ONLY, bounded SELECT/WITH statements and ROLLBACK.
It checks the retired Alimama DWD/DWS/ADS topology, the current report runtime,
ODS plus report-calendar watermarks and full consumer-facing row reconciliation for
the latest active week. It does not replay a migration, mutate data, record an owner
decision/ledger, deploy, or invoke Ark.`;

let client;
try {
  const options = parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const p1 = readExternalMigrationAuditJson(options.p1Path);
    const p1dProbe = readExternalMigrationAuditJson(options.p1dProbePath);
    client = new pg.Client({
      application_name: 'aios-qianchuan-alimama-runtime-replacement-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanAlimamaRuntimeReplacementReadonlyProbe({
      client,
      p1Artifact: p1.metadata,
      p1Packet: p1.data,
      p1Sha256: options.p1Sha256,
      p1dProbe: p1dProbe.data,
      p1dProbeArtifact: p1dProbe.metadata,
      p1dProbeSha256: options.p1dProbeSha256,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(formatQianchuanAlimamaRuntimeReplacementReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-alimama-runtime-replacement-readonly-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
