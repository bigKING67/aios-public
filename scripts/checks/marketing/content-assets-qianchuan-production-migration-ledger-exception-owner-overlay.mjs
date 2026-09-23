#!/usr/bin/env node

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
  parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay-cli.mjs';
import {
  buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs';

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-exception-owner-overlay.mjs \\
    --decisions /tmp/owner-decisions.json --decisions-sha256 <sha256> \\
    --reviewer repository-owner --reviewed-at <ISO-8601 UTC> \\
    --confirm-ledger-exception-owner-overlay \\
    --output /tmp/ledger-exception-owner-overlay.json

This offline command re-attests every exact do_not_record owner decision as a
runner-contract-v2 record_exception resolution. It pins the source decision
artifact but intentionally does not embed the output artifact's own SHA. It never
connects to PostgreSQL, generates SQL, changes the ledger/schema, applies a
migration, deploys, changes VPS state, or invokes Ark.`;

try {
  const options = parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs(
    process.argv.slice(2),
  );
  if (options.help) {
    console.log(USAGE);
  } else {
    const decisions = readExternalMigrationAuditJson(options.decisionsPath);
    const overlay = buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
      confirmed: options.confirmed,
      decisions: decisions.data,
      decisionsArtifact: decisions.metadata,
      decisionsSha256: options.decisionsSha256,
      reviewedAt: options.reviewedAt,
      reviewer: options.reviewer,
    });
    const artifact = writeExclusiveMigrationAuditJson(overlay, options.outputPath);
    console.log(formatQianchuanProductionMigrationLedgerExceptionOwnerOverlay(overlay, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-production-migration-ledger-exception-owner-overlay] failed: ${detail}`);
  process.exitCode = 1;
}
