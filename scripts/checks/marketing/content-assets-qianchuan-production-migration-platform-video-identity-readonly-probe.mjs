#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import pg from 'pg';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  formatQianchuanPlatformVideoIdentityReadonlyProbe,
  parseQianchuanPlatformVideoIdentityReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe-cli.mjs';
import {
  QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION,
  validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan.mjs';
import {
  runQianchuanPlatformVideoIdentityReadonlyProbe,
  validateQianchuanPlatformVideoIdentityProbeSources,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs \\
    --p1 /tmp/reviewed-p1.json --p1-sha256 <sha256> \\
    --p1d-probe /tmp/p1d-owner-review-probe.json --p1d-probe-sha256 <sha256> \\
    [--postinstall | --postcontract] [--output /tmp/platform-video-identity-probe.json]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

This command runs only BEGIN READ ONLY, bounded SELECT/WITH statements and ROLLBACK. It
pins the exact unresolved platform-video P1D entry, captures current index definitions,
global external-video/fallback duplicate shape, locks and dependent material references.
Postinstall/postcontract runs also pin the staged canonical-guard forward migration before
connecting to PostgreSQL.
It never creates/drops an index, mutates a row, records a decision/ledger, deploys or calls Ark.`;

let client;
try {
  const options = parseQianchuanPlatformVideoIdentityReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    const p1 = readExternalMigrationAuditJson(options.p1Path);
    const p1dProbe = readExternalMigrationAuditJson(options.p1dProbePath);
    const forwardInstallMigration = options.state === 'precontract' ? null
      : validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
        forwardMigrationPath: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
        forwardMigrationSql: readFileSync(
          QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
          'utf8',
        ),
      });
    validateQianchuanPlatformVideoIdentityProbeSources({
      p1Artifact: p1.metadata,
      p1Packet: p1.data,
      p1Sha256: options.p1Sha256,
      p1dProbe: p1dProbe.data,
      p1dProbeArtifact: p1dProbe.metadata,
      p1dProbeSha256: options.p1dProbeSha256,
    });
    client = new pg.Client({
      application_name: 'aios-qianchuan-platform-video-identity-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanPlatformVideoIdentityReadonlyProbe({
      client,
      p1Artifact: p1.metadata,
      p1Packet: p1.data,
      p1Sha256: options.p1Sha256,
      p1dProbe: p1dProbe.data,
      p1dProbeArtifact: p1dProbe.metadata,
      p1dProbeSha256: options.p1dProbeSha256,
      forwardInstallMigration,
      state: options.state,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const artifact = writeExclusiveMigrationAuditJson(result, options.outputPath);
    console.log(formatQianchuanPlatformVideoIdentityReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-platform-video-identity-readonly-probe] failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
