#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanParseHelperForwardContractPlan,
  parseQianchuanParseHelperForwardContractPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan-cli.mjs';
import {
  buildQianchuanParseHelperForwardContractPlan,
  validateQianchuanParseHelperForwardContractPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs';

const HISTORICAL_MIGRATION_PATH = 'etl/groland_postgres/sql/migrations/20260525_1730__add_marketing_content_report_parse_helpers.sql';
const RUNTIME_SOURCE_PATH = 'etl/groland_postgres/scripts/marketing_content_assets/qianchuan_reports.py';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs \\
    --probe /tmp/p1d-owner-review-probe.json --probe-sha256 <sha256> \\
    [--output /tmp/parse-helper-forward-contract-plan.json]

This command is offline. It pins the P1D owner-review probe plus current repository
migration/runtime source and emits a function-only forward migration, independent
read-only postcheck, ordered runtime self-DDL removal and rollback plan. It does not
connect to PostgreSQL, apply a migration, edit Python, deploy, write a ledger
or owner decision, activate the dormant report path, or invoke Ark.`;

try {
  const options = parseQianchuanParseHelperForwardContractPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const probe = readExternalMigrationAuditJson(options.probePath);
    const plan = buildQianchuanParseHelperForwardContractPlan({
      historicalMigrationSql: readFileSync(HISTORICAL_MIGRATION_PATH, 'utf8'),
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
      runtimeSource: readFileSync(RUNTIME_SOURCE_PATH, 'utf8'),
    });
    validateQianchuanParseHelperForwardContractPlan(plan);
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(formatQianchuanParseHelperForwardContractPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-parse-helper-forward-contract-plan] failed: ${detail}`);
  process.exitCode = 1;
}
