#!/usr/bin/env node

import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanInfluencerTagReadonlyProbe,
  parseQianchuanInfluencerTagReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe-cli.mjs';
import {
  runQianchuanInfluencerTagReadonlyProbe,
  validateQianchuanInfluencerTagPostrepairReadonlyProbe,
  validateQianchuanInfluencerTagReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-readonly-probe.mjs \\
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \\
    --p1d-probe /tmp/p1d-probe.json --p1d-probe-sha256 <sha256> \\
    [--postrepair] [--output /tmp/influencer-tag-readiness.json] [--json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

This command pins the unresolved influencer-tag P1D boundary and prior live probe. It runs
only BEGIN READ ONLY, bounded SELECT/WITH statements and ROLLBACK to capture catalog, lock,
impact, row-version and rollback-size evidence. It never installs the function, updates rows,
creates a backup, records a decision or ledger entry, deploys, or invokes Ark. --postrepair
requires the function to exist and drift/captured rows to be zero.`;

let client;
try {
  const options = parseQianchuanInfluencerTagReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const p1 = readExternalMigrationAuditJson(options.p1Path);
    const p1dProbe = readExternalMigrationAuditJson(options.p1dProbePath);
    client = new pg.Client({
      application_name: 'aios-qianchuan-influencer-tag-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanInfluencerTagReadonlyProbe({
      client,
      p1Artifact: p1.metadata,
      p1Packet: p1.data,
      p1Sha256: options.p1Sha256,
      p1dProbe: p1dProbe.data,
      p1dProbeArtifact: p1dProbe.metadata,
      p1dProbeSha256: options.p1dProbeSha256,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const validate = options.postrepair
      ? validateQianchuanInfluencerTagPostrepairReadonlyProbe
      : validateQianchuanInfluencerTagReadonlyProbe;
    validate(result);
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(options.json
      ? JSON.stringify(result, null, 2)
      : formatQianchuanInfluencerTagReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-influencer-tag-readonly-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
