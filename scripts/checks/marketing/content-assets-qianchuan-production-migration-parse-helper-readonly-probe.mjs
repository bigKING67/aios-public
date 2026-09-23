#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import pg from 'pg';

import {
  closeMigrationAuditReservation,
  readExternalMigrationAuditJson,
  reserveExclusiveMigrationAuditJson,
  writeReservedMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import { resolveQianchuanProductionCutoverConfig } from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs';
import {
  formatQianchuanParseHelperReadonlyProbe,
  parseQianchuanParseHelperReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe-cli.mjs';
import {
  runQianchuanParseHelperReadonlyProbe,
  validateQianchuanParseHelperPostinstallReadonlyProbe,
  validateQianchuanParseHelperPreinstallReadonlyProbe,
  validateQianchuanParseHelperReadonlyProbeSources,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-parse-helper-readonly-probe.mjs \\
    --plan /tmp/parse-helper-forward-contract-plan.json --plan-sha256 <sha256> \\
    --output /tmp/parse-helper-readonly-probe.json [--postinstall]

Required environment:
  AIOS_QC_ALLOW_LIVE_READONLY=1
  DATABASE_URL=<repo-external secret>

The default preinstall state requires all three helpers and all dormant-path rows to be
absent. --postinstall requires exact function kind/language/volatility/body semantics,
bounded value probes, zero dormant-path rows and zero target-relation waiting locks. The
command only runs BEGIN READ ONLY, SELECT and ROLLBACK, and writes one exclusive external
artifact. It does not apply/baseline a migration, write a ledger or row, remove runtime
self-DDL, record an owner decision, deploy, print business payload JSON or invoke Ark.`;

let client;
let options;
let outputReservation;
let planArtifact;
try {
  options = parseQianchuanParseHelperReadonlyProbeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    outputReservation = reserveExclusiveMigrationAuditJson(options.outputPath);
    const planInput = readExternalMigrationAuditJson(options.planPath);
    planArtifact = planInput.metadata;
    const forwardMigrationSql = readFileSync(QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path, 'utf8');
    validateQianchuanParseHelperReadonlyProbeSources({
      forwardMigrationSql,
      plan: planInput.data,
      planArtifact,
      planSha256: options.planSha256,
    });
    const config = resolveQianchuanProductionCutoverConfig(process.env);
    client = new pg.Client({
      application_name: 'aios-qianchuan-parse-helper-readonly-probe',
      connectionString: config.connectionString,
    });
    await client.connect();
    const result = await runQianchuanParseHelperReadonlyProbe({
      client,
      forwardMigrationSql,
      plan: planInput.data,
      planArtifact,
      planSha256: options.planSha256,
      state: options.state,
      statementTimeoutMs: config.statementTimeoutMs,
    });
    const validate = options.state === 'postinstall'
      ? validateQianchuanParseHelperPostinstallReadonlyProbe
      : validateQianchuanParseHelperPreinstallReadonlyProbe;
    validate(result);
    const artifact = writeReservedMigrationAuditJson(outputReservation, result);
    console.log(formatQianchuanParseHelperReadonlyProbe(result, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  let failureArtifact = null;
  if (outputReservation && !outputReservation.written) {
    try {
      failureArtifact = writeReservedMigrationAuditJson(outputReservation, {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: 'live_readonly_qianchuan_parse_helper_forward_migration_probe',
        requestedState: options?.state ?? null,
        status: 'failed',
        error: detail,
        sourceArtifacts: { plan: planArtifact ?? null },
      });
    } catch {
      failureArtifact = null;
    }
  }
  console.error(`[qianchuan-parse-helper-readonly-probe] failed: ${detail}`);
  if (failureArtifact) {
    console.error(`[qianchuan-parse-helper-readonly-probe] failure_artifact=${failureArtifact.path} sha256=${failureArtifact.sha256}`);
  }
  process.exitCode = 1;
} finally {
  if (outputReservation && !outputReservation.written) {
    try {
      closeMigrationAuditReservation(outputReservation);
    } catch {
      // Preserve the reserved file for inspection when close itself fails.
    }
  }
  await client?.end().catch(() => {});
}
