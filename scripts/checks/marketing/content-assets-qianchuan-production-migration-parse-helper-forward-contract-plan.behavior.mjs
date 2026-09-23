#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  formatQianchuanParseHelperForwardContractPlan,
  parseQianchuanParseHelperForwardContractPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan-cli.mjs';
import {
  buildQianchuanParseHelperForwardContractPlan,
  validateQianchuanParseHelperForwardContractPlan,
  validateQianchuanParseHelperForwardMigrationAsset,
  validateQianchuanParseHelperForwardMigrationSql,
  validateQianchuanParseHelperRuntimeSelfDdlSource,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs';

const historicalMigrationSql = readFileSync(
  new URL('../../../etl/groland_postgres/sql/migrations/20260525_1730__add_marketing_content_report_parse_helpers.sql', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../../../etl/groland_postgres/scripts/marketing_content_assets/qianchuan_reports.py', import.meta.url),
  'utf8',
);
const forwardMigrationSql = readFileSync(
  new URL('../../../etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql', import.meta.url),
  'utf8',
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    path: artifactPath,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
}

const otherFamilies = [
  'alimama_incremental_rename',
  'report_channel_localization_rename',
  'creator_live_refund_rename',
  'shortvideo_detail_rebuild',
  'influencer_tag_normalization',
  'card_ratio_enforcement',
  'platform_video_identity_dedupe',
];
const probe = {
  schemaVersion: 1,
  generatedAt: '2026-07-25T04:04:28.329Z',
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 15000,
    networkAccess: true,
    authoritativeClassificationChanged: false,
    reviewerChanged: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  summary: {
    entries: 8,
    families: 8,
    ownerDecisionReady: false,
    byEvidenceState: {},
  },
  entryEvidence: [
    ...otherFamilies.map((family) => ({
      family,
      entries: [`warehouse/${family}`],
      evidenceState: 'fixture',
      decision: null,
      reviewer: null,
    })),
    {
      family: 'qianchuan_parse_helpers',
      entries: ['warehouse/20260525_1730'],
      evidenceState: 'missing_runtime_contract_on_dormant_data_path',
      decision: null,
      reviewer: null,
    },
  ],
  catalog: {
    routines: [
      'public.marketing_content_parse_numeric(text)',
      'public.marketing_content_parse_bigint(text)',
      'public.marketing_content_parse_rate(text)',
    ].map((signature) => ({
      signature,
      present: false,
      routineKind: null,
      definitionBytes: null,
      definitionSha256: null,
      definitionNeedles: {},
    })),
  },
  dataShapes: {
    qianchuanParse: {
      rawRows: '0',
      rawMinDate: null,
      rawMaxDate: null,
      dwdRows: '0',
      qianchuanDwdRows: '0',
    },
  },
};
const probeArtifact = artifact(probe, '/tmp/p1d-owner-review-probe.json');

const migrationEvidence = validateQianchuanParseHelperForwardMigrationSql(
  historicalMigrationSql,
);
assert.equal(migrationEvidence.sha256, '9b5e08a572a47505fa5e1215f7136e839834344d3170a20f4b259c1c17ed61ff');
assert.equal(migrationEvidence.functions.length, 3);
assert.throws(
  () => validateQianchuanParseHelperForwardMigrationSql(
    `${historicalMigrationSql}\nUPDATE ods.qianchuan_material_daily_report_raw SET raw_payload = raw_payload;`,
  ),
  /must remain function-only DDL/,
);
const forwardMigrationAsset = validateQianchuanParseHelperForwardMigrationAsset({
  forwardMigrationPath: 'etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql',
  forwardMigrationSql,
  historicalMigrationSql,
});
assert.equal(forwardMigrationAsset.identity, 'warehouse/20260725_2300');
assert.equal(forwardMigrationAsset.sha256, migrationEvidence.sha256);
assert.throws(
  () => validateQianchuanParseHelperForwardMigrationAsset({
    forwardMigrationPath: 'etl/groland_postgres/sql/migrations/20260725_2301__ensure_marketing_content_report_parse_helpers.sql',
    forwardMigrationSql,
    historicalMigrationSql,
  }),
  /path differs from the staged repository identity/,
);
assert.throws(
  () => validateQianchuanParseHelperForwardMigrationAsset({
    forwardMigrationPath: 'etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql',
    forwardMigrationSql: `${forwardMigrationSql}\n-- unauthorized drift\n`,
    historicalMigrationSql,
  }),
  /must preserve the exact reviewed function-only SQL/,
);

const runtimeEvidence = validateQianchuanParseHelperRuntimeSelfDdlSource(runtimeSource);
assert.equal(runtimeEvidence.selfProvisioningCallCount, 1);
assert.equal(runtimeEvidence.selfProvisioningDefinitionCount, 1);
assert.equal(runtimeEvidence.runtimeDdlFunctionCount, 3);
assert.throws(
  () => validateQianchuanParseHelperRuntimeSelfDdlSource(
    runtimeSource.replace('    _ensure_parse_functions(conn)\n', ''),
  ),
  /no longer matches the pinned self-DDL boundary/,
);

const plan = buildQianchuanParseHelperForwardContractPlan({
  historicalMigrationSql,
  now: () => new Date('2026-07-25T07:00:00.000Z'),
  probe,
  probeArtifact,
  probeSha256: probeArtifact.sha256,
  runtimeSource,
});
assert.equal(validateQianchuanParseHelperForwardContractPlan(plan), plan);
assert.equal(plan.policy.networkAccess, false);
assert.equal(plan.policy.productionWritesAuthorized, false);
assert.equal(plan.policy.migrationApplyAuthorized, false);
assert.equal(plan.decision.forwardContractPlanReady, true);
assert.equal(plan.observed.helpersPresent, 0);
assert.equal(plan.observed.rawRows, 0);
assert.equal(plan.execution.forwardMigration.functions.length, 3);
assert.equal(plan.execution.forwardMigration.historicalMigrationReplay, false);
assert.equal(plan.execution.forwardMigration.tableDmlAllowed, false);
assert.equal(plan.execution.runtimeTransition.applyOnlyAfterReadonlyPostcheck, true);
assert.equal(plan.execution.runtimeTransition.eliminateOutOfBandCommit, true);
assert.equal(plan.execution.dormantPathSmoke.productionImportAuthorized, false);
assert.equal(plan.rollback.functionRemovalDefault, false);
assert.equal(plan.rollback.neverRestoreRuntimeSelfDdlAsFallback, true);

const badProbe = structuredClone(probe);
badProbe.dataShapes.qianchuanParse.rawRows = '1';
assert.throws(
  () => buildQianchuanParseHelperForwardContractPlan({
    historicalMigrationSql,
    probe: badProbe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
    runtimeSource,
  }),
  /differs from the dormant parse-helper forward-contract boundary/,
);

const unsafePlan = structuredClone(plan);
unsafePlan.execution.forwardMigration.sql += '\nCALL public.activate_qianchuan_report();';
assert.throws(
  () => validateQianchuanParseHelperForwardContractPlan(unsafePlan),
  /must remain function-only DDL/,
);

const driftedRuntimePlan = structuredClone(plan);
driftedRuntimePlan.execution.runtimeTransition.sourceSha256 = '0'.repeat(64);
assert.throws(
  () => validateQianchuanParseHelperForwardContractPlan(driftedRuntimePlan),
  /execution or rollback boundary is incomplete/,
);

const textOutput = formatQianchuanParseHelperForwardContractPlan(plan, {
  path: '/tmp/parse-helper-plan.json',
  bytes: 5000,
  sha256: 'f'.repeat(64),
});
assert.match(textOutput, /helpers_present=0 raw_rows=0 dwd_rows=0 qianchuan_dwd_rows=0/);
assert.doesNotMatch(textOutput, /CREATE OR REPLACE|regexp_replace|EXCEPTION WHEN/);

assert.deepEqual(
  parseQianchuanParseHelperForwardContractPlanArgs([
    '--probe', '/tmp/p1d-owner-review-probe.json',
    `--probe-sha256=${'a'.repeat(64)}`,
    '--output', '/tmp/parse-helper-plan.json',
  ]),
  {
    help: false,
    outputPath: '/tmp/parse-helper-plan.json',
    probePath: '/tmp/p1d-owner-review-probe.json',
    probeSha256: 'a'.repeat(64),
  },
);
for (const option of [
  '--apply',
  '--baseline',
  '--deploy',
  '--execute',
  '--json',
  '--remove-runtime-ddl',
  '--write-ledger',
]) {
  assert.throws(
    () => parseQianchuanParseHelperForwardContractPlanArgs([option]),
    /Unknown qianchuan parse-helper plan option/,
  );
}

const commandSource = readFileSync(new URL(
  './content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs',
  import.meta.url,
), 'utf8');
assert.doesNotMatch(commandSource, /from ['"]pg['"]|DATABASE_URL|AIOS_QC_ALLOW_LIVE_READONLY/);

console.log('[qianchuan-parse-helper-forward-contract-plan-behavior] OK: pinned dormant evidence, function-only DDL, ordered runtime self-DDL removal, postcheck, rollback, and authorization separation passed.');
