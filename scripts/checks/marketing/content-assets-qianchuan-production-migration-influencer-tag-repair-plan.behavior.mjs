#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  formatQianchuanInfluencerTagRepairPlan,
  parseQianchuanInfluencerTagRepairPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan-cli.mjs';
import {
  buildQianchuanInfluencerTagRepairPlan,
  validateQianchuanInfluencerTagForwardFunctionSql,
  validateQianchuanInfluencerTagRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';

const TARGET_CHECKSUM = '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function impactRow(id, rowVersion, before, expected) {
  return {
    id,
    rowVersion,
    updatedAt: '2026-06-03 09:52:13.299463',
    before,
    expected,
    beforeSha256: sha256(JSON.stringify(before)),
    expectedSha256: sha256(JSON.stringify(expected)),
  };
}

const probe = {
  schemaVersion: 1,
  generatedAt: '2026-07-25T05:10:24.715Z',
  mode: 'live_readonly_influencer_tag_normalization_repair_readiness_probe',
  target: {
    identity: 'warehouse/20260510_1800',
    checksum: TARGET_CHECKSUM,
    source: {
      bytes: 2371,
      path: 'etl/groland_postgres/sql/migrations/20260510_1800__normalize_influencer_library_anchor_tags.sql',
      sha256: TARGET_CHECKSUM,
    },
  },
  sourceArtifacts: {
    p1: { bytes: 100, path: '/tmp/p1.json', sha256: '1'.repeat(64) },
    p1dProbe: { bytes: 100, path: '/tmp/p1d.json', sha256: '2'.repeat(64) },
  },
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 15000,
    networkAccess: true,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    repairExecutionAuthorized: false,
    backupCreated: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  summary: {
    relationsPresent: 1,
    exactPrimaryKeys: 1,
    exactRequiredColumns: 5,
    supportRoutinesPresent: 3,
    normalizeFunctionPresent: false,
    touchTriggerPresent: 1,
    activeRows: 285,
    rowsWithNormalizedTags: 96,
    mismatchRows: 3,
    tagsOnlyMismatchRows: 1,
    anchorDescOnlyMismatchRows: 1,
    bothMismatchRows: 1,
    impactRowsCaptured: 3,
    captureLimit: 1000,
    estimatedBackupBytes: 768,
    waitingLocks: 0,
    maxUpdatedAt: '2026-06-03 09:52:13.299463',
    repairPlanReady: false,
  },
  catalog: {
    table: {
      qualified_name: 'ads.influencer_library',
      oid: '100',
      relation_kind: 'r',
      total_bytes: '98304',
    },
    primaryKeys: [{ definition: 'PRIMARY KEY (id)' }],
    columns: [],
    routines: [{
      signature: 'ads.fn_influencer_library_normalize_anchor_tag(text)',
      present: false,
      routineKind: null,
      definitionBytes: null,
      definitionSha256: null,
    }],
    trigger: { present: true },
  },
  impactRows: [
    impactRow(
      '1',
      '10',
      { tags: ['服装'], anchorDesc: '服装' },
      { tags: ['服饰主播'], anchorDesc: '服饰主播' },
    ),
    impactRow(
      '2',
      '11',
      { tags: ['美妆'], anchorDesc: '美妆类主播' },
      { tags: ['美妆主播'], anchorDesc: '美妆主播' },
    ),
    impactRow(
      '3',
      '12',
      { tags: ['穿搭类主播'], anchorDesc: '穿搭' },
      { tags: ['穿搭', '穿搭主播'], anchorDesc: '穿搭、穿搭主播' },
    ),
  ],
};
const probeContent = `${JSON.stringify(probe, null, 2)}\n`;
const probeArtifact = {
  bytes: Buffer.byteLength(probeContent),
  path: '/tmp/influencer-tag-readiness.json',
  sha256: sha256(probeContent),
};

const plan = buildQianchuanInfluencerTagRepairPlan({
  now: () => new Date('2026-07-25T06:00:00.000Z'),
  probe,
  probeArtifact,
  probeSha256: probeArtifact.sha256,
});
assert.equal(validateQianchuanInfluencerTagRepairPlan(plan), plan);
assert.equal(plan.policy.networkAccess, false);
assert.equal(plan.policy.productionWritesAuthorized, false);
assert.equal(plan.policy.historicalMigrationReplayRecommended, false);
assert.equal(plan.decision.repairPlanReady, true);
assert.equal(plan.execution.changes.length, 3);
assert.equal(plan.execution.canary.id, '1');
assert.equal(plan.execution.canary.rows, 1);
assert.equal(plan.execution.batching.remainingRows, 2);
assert.equal(plan.execution.batching.maxRowsPerTransaction, 50);
assert.equal(plan.execution.batching.expectedBatches, 1);
assert.equal(plan.execution.batching.skipLocked, false);
assert.equal(plan.execution.backup.estimatedRows, 3);
assert.equal(plan.execution.backup.rawPayloadBytes, 768);
assert.equal(plan.execution.backup.recommendedCapacityBytes, 1024 * 1024);
assert.equal(plan.execution.backup.created, false);
assert.equal(plan.execution.forwardFunction.historicalMigrationReplay, false);
assert.equal(plan.execution.forwardFunction.definitionSha256.length, 64);
assert.equal(plan.execution.postcondition.mismatchRows, 0);
assert.equal(plan.execution.postcondition.reviewedP1dRemains, 5);
assert.equal(plan.rollback.writeQuiescenceFirst, true);
assert.equal(plan.rollback.functionRemovalDefault, false);
assert.equal(plan.authorizationBoundaries.ownerDecisionRequiresSeparateAcceptance, true);

const functionDefinition = validateQianchuanInfluencerTagForwardFunctionSql(
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
);
assert.equal(functionDefinition.bytes, plan.execution.forwardFunction.definitionBytes);
assert.equal(functionDefinition.sha256, plan.execution.forwardFunction.definitionSha256);
assert.throws(
  () => validateQianchuanInfluencerTagForwardFunctionSql(
    `${QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL}\nUPDATE ads.influencer_library SET tags = tags;`,
  ),
  /must remain DDL-only/,
);

const invalidPlanHash = structuredClone(plan);
invalidPlanHash.execution.changes[1].expectedSha256 = '0'.repeat(64);
assert.throws(
  () => validateQianchuanInfluencerTagRepairPlan(invalidPlanHash),
  /row 2 hash evidence is inconsistent/,
);

const invalidDefinitionHash = structuredClone(plan);
invalidDefinitionHash.execution.forwardFunction.definitionSha256 = '0'.repeat(64);
assert.throws(
  () => validateQianchuanInfluencerTagRepairPlan(invalidDefinitionHash),
  /execution or rollback boundary is incomplete/,
);

const textOutput = formatQianchuanInfluencerTagRepairPlan(plan, {
  bytes: 1000,
  path: '/tmp/influencer-tag-plan.json',
  sha256: 'f'.repeat(64),
});
assert.match(textOutput, /mismatch_rows=3 canary_rows=1 remaining_rows=2/);
assert.doesNotMatch(textOutput, /服装|穿搭|beforeSha256/);

assert.throws(
  () => buildQianchuanInfluencerTagRepairPlan({
    probe,
    probeArtifact,
    probeSha256: '0'.repeat(64),
  }),
  /Influencer-tag readiness probe SHA-256 differs/,
);

const badHashProbe = structuredClone(probe);
badHashProbe.impactRows[1].expectedSha256 = '0'.repeat(64);
assert.throws(
  () => buildQianchuanInfluencerTagRepairPlan({
    probe: badHashProbe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
  }),
  /row 2 hash evidence is inconsistent/,
);

const unorderedProbe = structuredClone(probe);
unorderedProbe.impactRows.reverse();
assert.throws(
  () => buildQianchuanInfluencerTagRepairPlan({
    probe: unorderedProbe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
  }),
  /row identities must be unique and ordered/,
);

assert.deepEqual(
  parseQianchuanInfluencerTagRepairPlanArgs([
    '--probe', '/tmp/influencer-tag-readiness.json',
    `--probe-sha256=${'a'.repeat(64)}`,
    '--output', '/tmp/influencer-tag-plan.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    outputPath: '/tmp/influencer-tag-plan.json',
    probePath: '/tmp/influencer-tag-readiness.json',
    probeSha256: 'a'.repeat(64),
  },
);
for (const option of [
  '--apply',
  '--backup',
  '--baseline',
  '--deploy',
  '--execute',
  '--install-function',
  '--repair',
  '--update-rows',
  '--write-ledger',
]) {
  assert.throws(
    () => parseQianchuanInfluencerTagRepairPlanArgs([option]),
    /Unknown qianchuan influencer-tag repair-plan option/,
  );
}

const commandSource = readFileSync(new URL(
  './content-assets-qianchuan-production-migration-influencer-tag-repair-plan.mjs',
  import.meta.url,
), 'utf8');
assert.doesNotMatch(commandSource, /from ['"]pg['"]|DATABASE_URL|AIOS_QC_ALLOW_LIVE_READONLY/);

console.log('[qianchuan-influencer-tag-repair-plan-behavior] OK: offline pinning, exact row guards, forward function, single-row canary, bounded update, postcheck, rollback, and authorization separation passed.');
