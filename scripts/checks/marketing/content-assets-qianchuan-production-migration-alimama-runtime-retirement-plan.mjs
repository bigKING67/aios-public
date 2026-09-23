#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  scanQianchuanAlimamaRuntimeConsumers,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-inventory.mjs';
import {
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS,
  buildQianchuanAlimamaRuntimeRetirementPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs';
import {
  formatQianchuanAlimamaRuntimeRetirementPlan,
  parseQianchuanAlimamaRuntimeRetirementPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan-cli.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs \\
    --probe /tmp/alimama-runtime-replacement-probe.json --probe-sha256 <sha256> \\
    [--output /tmp/alimama-runtime-retirement-plan.json]

This offline command pins the target-specific production read-only probe, current
runtime consumers, migration lineage and retirement documentation. It recommends an
owner decision only when both input watermarks and every consumer-facing field are
reconciled. It does not connect to PostgreSQL, create/apply a migration, mutate data,
record a decision or ledger, deploy, or invoke Ark.`;

try {
  const options = parseQianchuanAlimamaRuntimeRetirementPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const probe = readExternalMigrationAuditJson(options.probePath);
    const sources = Object.fromEntries(Object.entries(ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS).map(([key, sourcePath]) => [
      key, readFileSync(sourcePath, 'utf8'),
    ]));
    const plan = buildQianchuanAlimamaRuntimeRetirementPlan({
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
      runtimeInventory: scanQianchuanAlimamaRuntimeConsumers(),
      sources,
    });
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(formatQianchuanAlimamaRuntimeRetirementPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-alimama-runtime-retirement-plan] failed: ${detail}`);
  process.exitCode = 1;
}
