#!/usr/bin/env node

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanCardRatioRepairPlan,
  parseQianchuanCardRatioRepairPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-repair-plan-cli.mjs';
import {
  buildQianchuanCardRatioRepairPlan,
  validateQianchuanCardRatioRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-repair-plan.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-card-ratio-repair-plan.mjs \\
    --probe /tmp/card-ratio-readiness.json --probe-sha256 <sha256> \\
    [--output /tmp/card-ratio-repair-plan.json] [--json]

This command is offline. It pins a validated live read-only readiness artifact and emits a
forward-only guard, backup, canary, batched backfill, postcondition and rollback plan. It does
not connect to PostgreSQL, create a backup, apply a migration, repair data, deploy or invoke Ark.`;

try {
  const options = parseQianchuanCardRatioRepairPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const probe = readExternalMigrationAuditJson(options.probePath);
    const plan = buildQianchuanCardRatioRepairPlan({
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
    });
    validateQianchuanCardRatioRepairPlan(plan);
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(options.json
      ? JSON.stringify(plan, null, 2)
      : formatQianchuanCardRatioRepairPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-card-ratio-repair-plan] failed: ${detail}`);
  process.exitCode = 1;
}
