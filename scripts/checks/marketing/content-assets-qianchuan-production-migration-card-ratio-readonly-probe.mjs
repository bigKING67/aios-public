#!/usr/bin/env node

import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanCardRatioReadonlyProbe,
  parseQianchuanCardRatioReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe-cli.mjs';
import {
  runQianchuanCardRatioReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-card-ratio-readonly-probe.mjs \\
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \\
    --p1d-probe /tmp/p1d-probe.json --p1d-probe-sha256 <sha256> \\
    [--output /tmp/card-ratio-readiness.json] [--json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

This command pins the unresolved P1D=5 packet and prior P1D read-only probe. It runs only
BEGIN READ ONLY, bounded SELECT/WITH statements and ROLLBACK to measure ODS/ADS formula drift,
keys, sizes, indexes, routines, triggers, parity and lock state. It never repairs or backs up data.`;

let client;
try {
  const options = parseQianchuanCardRatioReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const p1 = readExternalMigrationAuditJson(options.p1Path);
    const p1dProbe = readExternalMigrationAuditJson(options.p1dProbePath);
    client = new pg.Client({
      application_name: 'aios-qianchuan-card-ratio-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanCardRatioReadonlyProbe({
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
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanCardRatioReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-card-ratio-readonly-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
