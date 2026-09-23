#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanProductionMigrationLedgerBootstrapPlan,
  parseQianchuanProductionMigrationLedgerBootstrapPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan-cli.mjs';
import {
  buildQianchuanProductionMigrationLedgerBootstrapPlan,
  QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-bootstrap-plan.mjs \\
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \\
    --decisions /tmp/owner-decisions.json --decisions-sha256 <sha256> \\
    --exception-overlay /tmp/exception-overlay.json --exception-overlay-sha256 <sha256> \\
    --output /tmp/ledger-bootstrap-plan.json

This offline command pins a fresh production reconciliation artifact, the latest
owner decisions, and the v2 record_exception overlay. Planner schema v3 verifies
the canonical-v2/bootstrap-writer source pins and reports effective strict-prefix
rows and target readiness. It does not connect to PostgreSQL, generate SQL, apply
or baseline migrations, write or upgrade the ledger, deploy, or invoke Ark.`;

try {
  const options = parseQianchuanProductionMigrationLedgerBootstrapPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifest = readExternalMigrationAuditJson(options.manifestPath);
    const decisions = readExternalMigrationAuditJson(options.decisionsPath);
    const exceptionOverlay = readExternalMigrationAuditJson(options.exceptionOverlayPath);
    const descriptor = readAiosMigrationDescriptor();
    const records = discoverAiosMigrations({ descriptor });
    const runnerSources = Object.fromEntries(Object.entries(
      QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS,
    ).map(([key, sourcePath]) => [key, readFileSync(sourcePath, 'utf8')]));
    const plan = buildQianchuanProductionMigrationLedgerBootstrapPlan({
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      decisions: decisions.data,
      decisionsArtifact: decisions.metadata,
      decisionsSha256: options.decisionsSha256,
      exceptionOverlay: exceptionOverlay.data,
      exceptionOverlayArtifact: exceptionOverlay.metadata,
      exceptionOverlaySha256: options.exceptionOverlaySha256,
      records,
      runnerSources,
    });
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(formatQianchuanProductionMigrationLedgerBootstrapPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-ledger-bootstrap-plan] failed: ${detail}`);
  process.exitCode = 1;
}
