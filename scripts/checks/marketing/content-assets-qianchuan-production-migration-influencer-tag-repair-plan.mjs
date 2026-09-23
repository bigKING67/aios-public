#!/usr/bin/env node

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanInfluencerTagRepairPlan,
  parseQianchuanInfluencerTagRepairPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan-cli.mjs';
import {
  buildQianchuanInfluencerTagRepairPlan,
  validateQianchuanInfluencerTagRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-repair-plan.mjs \\
    --probe /tmp/influencer-tag-readiness.json --probe-sha256 <sha256> \\
    [--output /tmp/influencer-tag-repair-plan.json] [--json]

This command is offline. It pins a validated live read-only readiness artifact and emits a
forward-function, exact backup, single-row canary, bounded guarded update, postcondition and
rollback plan. It does not connect to PostgreSQL, create a backup, install the function,
update data, record an owner decision or ledger entry, deploy, or invoke Ark.`;

try {
  const options = parseQianchuanInfluencerTagRepairPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const probe = readExternalMigrationAuditJson(options.probePath);
    const plan = buildQianchuanInfluencerTagRepairPlan({
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
    });
    validateQianchuanInfluencerTagRepairPlan(plan);
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(options.json
      ? JSON.stringify(plan, null, 2)
      : formatQianchuanInfluencerTagRepairPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-influencer-tag-repair-plan] failed: ${detail}`);
  process.exitCode = 1;
}
