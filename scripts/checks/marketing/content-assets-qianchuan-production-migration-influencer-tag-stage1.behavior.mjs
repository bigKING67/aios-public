#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  formatQianchuanInfluencerTagStage1Result,
  parseQianchuanInfluencerTagStage1Args,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1-cli.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import {
  buildQianchuanInfluencerTagRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  assertQianchuanInfluencerTagStage1Authorization,
  assertQianchuanInfluencerTagStage1GitState,
  runQianchuanInfluencerTagStage1,
  validateQianchuanInfluencerTagInstalledFunctionCatalog,
  validateQianchuanInfluencerTagStage1Result,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1.mjs';

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
const planContent = `${JSON.stringify(plan, null, 2)}\n`;
const planArtifact = {
  bytes: Buffer.byteLength(planContent),
  path: '/tmp/influencer-tag-repair-plan.json',
  sha256: sha256(planContent),
};
const functionDefinition = QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL
  .slice(0, QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL.indexOf('\n\nCOMMENT ON FUNCTION'));
const functionDescription = /\sIS '([^']+)';$/.exec(
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
)?.[1];

function backupRows() {
  return plan.execution.changes.map((row) => ({
    id: row.id,
    source_xmin: row.sourceRowVersion,
    source_updated_at: row.sourceUpdatedAt,
    tags: row.before.tags,
    anchor_desc: row.before.anchorDesc,
    before_sha256: row.beforeSha256,
    expected_sha256: row.expectedSha256,
  }));
}

function remainingImpactRows() {
  return plan.execution.changes.slice(1).map((row) => ({
    id: row.id,
    row_version: row.sourceRowVersion,
    updated_at: row.sourceUpdatedAt,
    before_tags: row.before.tags,
    before_anchor_desc: row.before.anchorDesc,
    expected_tags: row.expected.tags,
    expected_anchor_desc: row.expected.anchorDesc,
  }));
}

class FakeClient {
  constructor({ invalidCanary = false, invalidPostcheck = false } = {}) {
    this.functionCatalogReads = 0;
    this.invalidCanary = invalidCanary;
    this.invalidPostcheck = invalidPostcheck;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'
      || sql === 'BEGIN READ ONLY'
      || sql.startsWith('SET LOCAL')
      || sql.includes('pg_advisory_xact_lock')
      || sql === 'COMMIT'
      || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:function_catalog')) {
      this.functionCatalogReads += 1;
      if (this.functionCatalogReads === 1) {
        return { rows: [{ oid: null, routine_kind: null, definition: null, description: null }] };
      }
      return { rows: [{
        oid: '900',
        routine_kind: 'f',
        definition: functionDefinition,
        description: functionDescription,
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:backup_table')) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:backup_shape')) {
      return { rows: [{
        column_count: '9',
        column_types: {
          repair_run_id: 'text',
          backed_up_at: 'timestamptz',
          id: 'int8',
          source_xmin: 'text',
          source_updated_at: 'timestamp',
          tags: '_text',
          anchor_desc: 'text',
          before_sha256: 'text',
          expected_sha256: 'text',
        },
        primary_key: 'PRIMARY KEY (repair_run_id, id)',
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:existing_backup_run')) {
      return { rows: [{ rows: '0' }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:exact_backup')) {
      assert.equal(params[0].startsWith('qit-'), true);
      assert.equal(JSON.parse(params[1]).length, 3);
      return { rowCount: 3, rows: [] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:backup_rows')) {
      return { rows: backupRows() };
    }
    if (sql === QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL) {
      return { rowCount: null, rows: [] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:canary_update')) {
      const canary = plan.execution.changes[0];
      const stored = this.invalidCanary ? canary.before : canary.expected;
      return { rowCount: 1, rows: [{
        id: canary.id,
        row_version: '20',
        updated_at: '2026-07-25 06:01:00',
        tags: stored.tags,
        anchor_desc: stored.anchorDesc,
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:postcheck_summary')) {
      return { rows: [{
        active_rows: '285',
        rows_with_normalized_tags: '97',
        mismatch_rows: this.invalidPostcheck ? '3' : '2',
        tags_only_mismatch_rows: '0',
        anchor_desc_only_mismatch_rows: '1',
        both_mismatch_rows: this.invalidPostcheck ? '2' : '1',
        waiting_locks: '0',
      }] };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:postcheck_impact_rows')) {
      return { rows: remainingImpactRows() };
    }
    if (sql.includes('aios_qianchuan_influencer_tag_stage1:postcheck_canary')) {
      const canary = plan.execution.changes[0];
      return { rows: [{
        id: canary.id,
        row_version: '20',
        updated_at: '2026-07-25 06:01:00',
        tags: canary.expected.tags,
        anchor_desc: canary.expected.anchorDesc,
      }] };
    }
    throw new Error(`Unexpected influencer-tag Stage 1 fixture SQL: ${sql.slice(0, 120)}`);
  }
}

const client = new FakeClient();
const events = [];
const result = await runQianchuanInfluencerTagStage1({
  client,
  git: {
    branch: 'main',
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    worktreeClean: true,
  },
  now: () => new Date('2026-07-25T06:00:00.000Z'),
  onEvent: (event) => events.push(event),
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  readonlyInputs: {},
  repairRunId: 'qit-20260725T060000Z-deadbeef',
  runReadonlyProbe: async () => structuredClone(probe),
});
assert.equal(validateQianchuanInfluencerTagStage1Result(result), result);
assert.equal(result.backup.rows, 3);
assert.equal(result.postcheck.remainingMismatchRows, 2);
assert.equal(result.policy.fullBackfillExecuted, false);
assert.equal(result.policy.ledgerWritten, false);
assert.equal(result.policy.ownerDecisionRecorded, false);
assert.deepEqual(events.map((event) => event.stage), [
  'preflight_passed',
  'backup_verified_in_transaction',
  'forward_function_verified_in_transaction',
  'canary_verified_in_transaction',
  'atomic_stage1_committed',
  'postcheck_passed',
]);
assert.equal(client.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);
assert.equal(client.queries.filter(({ sql }) => sql === 'BEGIN READ ONLY').length, 1);
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assert.equal(client.queries.some(({ sql }) => /SKIP\s+LOCKED/i.test(sql)), false);
assert.equal(client.queries.filter(({ sql }) => (
  sql.includes('aios_qianchuan_influencer_tag_stage1:canary_update')
)).length, 1);

const rollbackClient = new FakeClient({ invalidCanary: true });
await assert.rejects(
  runQianchuanInfluencerTagStage1({
    client: rollbackClient,
    git: {},
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    readonlyInputs: {},
    repairRunId: 'qit-20260725T060100Z-cafebabe',
    runReadonlyProbe: async () => structuredClone(probe),
  }),
  /canary stored values differ/,
);
assert.equal(rollbackClient.queries.at(-1).sql, 'ROLLBACK');
assert.equal(rollbackClient.queries.some(({ sql }) => sql === 'COMMIT'), false);

const committedPostcheckClient = new FakeClient({ invalidPostcheck: true });
await assert.rejects(
  runQianchuanInfluencerTagStage1({
    client: committedPostcheckClient,
    git: {},
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    readonlyInputs: {},
    repairRunId: 'qit-20260725T060200Z-1234abcd',
    runReadonlyProbe: async () => structuredClone(probe),
  }),
  (error) => {
    assert.match(error.message, /postcheck did not preserve/);
    assert.equal(error.stage1Committed, true);
    return true;
  },
);
assert.equal(committedPostcheckClient.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);

assert.equal(assertQianchuanInfluencerTagStage1GitState({
  branch: 'main',
  expectedGitSha: '1'.repeat(40),
  head: '1'.repeat(40),
  originMain: '1'.repeat(40),
  status: '',
}), true);
assert.throws(
  () => assertQianchuanInfluencerTagStage1GitState({
    branch: 'main',
    expectedGitSha: '1'.repeat(40),
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    status: ' M package.json',
  }),
  /refuses a dirty Git worktree/,
);
assert.deepEqual(
  assertQianchuanInfluencerTagStage1Authorization({
    confirmed: true,
    env: {
      AIOS_QC_ALLOW_LIVE_WRITE: '1',
      AIOS_QC_INFLUENCER_TAG_WRITE_ACK: 'stage1',
      AIOS_QC_EXPECTED_GIT_SHA: '1'.repeat(40),
      DATABASE_URL: 'postgres://fixture',
    },
  }),
  {
    connectionString: 'postgres://fixture',
    expectedGitSha: '1'.repeat(40),
  },
);
assert.throws(
  () => assertQianchuanInfluencerTagStage1Authorization({
    confirmed: false,
    env: {
      AIOS_QC_ALLOW_LIVE_WRITE: '1',
      AIOS_QC_INFLUENCER_TAG_WRITE_ACK: 'stage1',
      DATABASE_URL: 'postgres://fixture',
    },
  }),
  /requires --confirm-stage1/,
);

assert.deepEqual(
  parseQianchuanInfluencerTagStage1Args([
    '--plan', '/tmp/plan.json',
    `--plan-sha256=${'a'.repeat(64)}`,
    '--repair-run-id', 'qit-20260725T060000Z-deadbeef',
    '--output', '/tmp/stage1.json',
    '--confirm-stage1',
  ]),
  {
    confirmed: true,
    help: false,
    outputPath: '/tmp/stage1.json',
    planPath: '/tmp/plan.json',
    planSha256: 'a'.repeat(64),
    repairRunId: 'qit-20260725T060000Z-deadbeef',
  },
);
for (const option of ['--deploy', '--full-backfill', '--ark', '--write-ledger', '--owner-decision']) {
  assert.throws(
    () => parseQianchuanInfluencerTagStage1Args([option]),
    /Unknown qianchuan influencer-tag Stage 1 option/,
  );
}

assert.throws(
  () => validateQianchuanInfluencerTagInstalledFunctionCatalog({
    oid: '900',
    routine_kind: 'f',
    definition: functionDefinition.replace("RETURN '服饰主播';", "RETURN '服装主播';"),
    description: functionDescription,
  }),
  /catalog definition is incomplete or changed/,
);

const formatted = formatQianchuanInfluencerTagStage1Result(result, {
  bytes: 1000,
  path: '/tmp/influencer-tag-stage1.json',
  sha256: 'f'.repeat(64),
});
assert.match(formatted, /backup_rows=3/);
assert.match(formatted, /remaining_mismatch_rows=2/);
assert.doesNotMatch(formatted, /服装|穿搭|beforeSha256/);

const opsSource = readFileSync(new URL(
  '../../ops/qianchuan-influencer-tag-stage1.mjs',
  import.meta.url,
), 'utf8');
const authorizationIndex = opsSource.indexOf(
  'const authorization = assertQianchuanInfluencerTagStage1Authorization',
);
const gitIndex = opsSource.indexOf('git = readGitState(authorization.expectedGitSha)');
const reserveIndex = opsSource.indexOf(
  'outputReservation = reserveExclusiveMigrationAuditJson(options.outputPath)',
);
const planReadIndex = opsSource.indexOf('readExternalMigrationAuditJson(options.planPath)');
const connectIndex = opsSource.indexOf('new pg.Client');
assert.equal(authorizationIndex >= 0 && authorizationIndex < gitIndex, true);
assert.equal(gitIndex < reserveIndex && reserveIndex < planReadIndex, true);
assert.equal(planReadIndex < connectIndex, true);
assert.match(opsSource, /writeReservedMigrationAuditJson\(outputReservation, \{ \.\.\.result, events \}\)/);
assert.match(opsSource, /stage1Committed: error\?\.stage1Committed === true/);

console.log('[qianchuan-influencer-tag-stage1-behavior] OK: auth and clean-pushed Git fail-closed before artifact/DB access, exact backup, pinned function, xmin/value-hash canary, rollback-before-commit, truthful committed-postcheck failure, separate read-only postcheck, and no batch/ledger/owner/deploy/Ark passed.');
