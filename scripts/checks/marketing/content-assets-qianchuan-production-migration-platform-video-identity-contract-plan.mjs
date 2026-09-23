#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanPlatformVideoIdentityContractPlan,
  parseQianchuanPlatformVideoIdentityContractPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan-cli.mjs';
import {
  buildQianchuanPlatformVideoIdentityContractPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan.mjs';

const SOURCE_PATHS = Object.freeze({
  historicalMigration: 'etl/groland_postgres/sql/migrations/20260617_1900__dedupe_marketing_content_platform_video_identities.sql',
  initialIndexMigration: 'etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql',
  performanceIndexMigration: 'etl/groland_postgres/sql/migrations/20260525_1930__add_marketing_content_performance_indexes.sql',
  identityLookup: 'backend-rust/src/marketing/content_assets/identity_lookup.rs',
  identityMutations: 'backend-rust/src/marketing/content_assets/identity_mutations.rs',
  yuntuArchiveRepository: 'etl/groland_postgres/scripts/marketing_content_assets/yuntu_archive_repository.py',
});

const USAGE = `Usage:
  node scripts/checks/marketing/content-assets-qianchuan-production-migration-platform-video-identity-contract-plan.mjs \\
    --probe /tmp/platform-video-identity-probe.json --probe-sha256 <sha256> \\
    [--output /tmp/platform-video-identity-contract-plan.json]

This offline command pins the target-specific read-only probe and current repository
identity sources. It emits two index-only forward migrations separated by independent
read-only postchecks. The canonical-guard install is staged separately in the repository;
the redundant-index cleanup remains deliberately unstaged until postinstall passes. It does
not connect to PostgreSQL, mutate rows, create/drop indexes, record an owner decision/ledger,
deploy, or invoke Ark.`;

try {
  const options = parseQianchuanPlatformVideoIdentityContractPlanArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const probe = readExternalMigrationAuditJson(options.probePath);
    const sources = Object.fromEntries(Object.entries(SOURCE_PATHS).map(([key, path]) => [
      key,
      readFileSync(path, 'utf8'),
    ]));
    const plan = buildQianchuanPlatformVideoIdentityContractPlan({
      probe: probe.data,
      probeArtifact: probe.metadata,
      probeSha256: options.probeSha256,
      sources,
    });
    const artifact = writeExclusiveMigrationAuditJson(plan, options.outputPath);
    console.log(formatQianchuanPlatformVideoIdentityContractPlan(plan, artifact));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[qianchuan-platform-video-identity-contract-plan] failed: ${detail}`);
  process.exitCode = 1;
}
