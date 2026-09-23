import { createHash } from 'node:crypto';

import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import {
  buildQianchuanInfluencerTagRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  validateQianchuanInfluencerTagPostrepairReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';
import {
  validateQianchuanInfluencerTagBackupRows,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1.mjs';
import {
  runQianchuanInfluencerTagStage2Batch,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2.mjs';

export const INFLUENCER_TAG_TARGET_CHECKSUM = '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

export function influencerTagAuditArtifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    bytes: Buffer.byteLength(content),
    path: artifactPath,
    sha256: sha256(content),
  };
}

function impactRow(id, rowVersion, before, expected) {
  return {
    id,
    rowVersion,
    updatedAt: '2026-06-03 09:52:13.299463',
    before,
    expected,
    beforeSha256: sha256Json(before),
    expectedSha256: sha256Json(expected),
  };
}

export function createInfluencerTagStage2Fixture() {
  const probe = {
    schemaVersion: 1,
    generatedAt: '2026-07-25T05:10:24.715Z',
    mode: 'live_readonly_influencer_tag_normalization_repair_readiness_probe',
    target: {
      identity: 'warehouse/20260510_1800',
      checksum: INFLUENCER_TAG_TARGET_CHECKSUM,
      source: {
        bytes: 2371,
        path: 'etl/groland_postgres/sql/migrations/20260510_1800__normalize_influencer_library_anchor_tags.sql',
        sha256: INFLUENCER_TAG_TARGET_CHECKSUM,
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
  const probeArtifact = influencerTagAuditArtifact(
    probe,
    '/tmp/influencer-tag-readiness.json',
  );
  const plan = buildQianchuanInfluencerTagRepairPlan({
    now: () => new Date('2026-07-25T06:00:00.000Z'),
    probe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
  });
  const planArtifact = influencerTagAuditArtifact(
    plan,
    '/tmp/influencer-tag-repair-plan.json',
  );
  const functionDefinition = QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL
    .slice(0, QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL.indexOf('\n\nCOMMENT ON FUNCTION'));
  const functionDescription = /\sIS '([^']+)';$/.exec(
    QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
  )?.[1];
  const functionCatalogSha256 = sha256(functionDefinition);

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

  const backupEvidence = validateQianchuanInfluencerTagBackupRows(backupRows(), plan);
  const canary = plan.execution.changes[0];
  const stage1 = {
    schemaVersion: 1,
    generatedAt: '2026-07-25T06:01:00.000Z',
    mode: 'live_write_influencer_tag_stage1_canary',
    status: 'succeeded',
    target: { ...plan.target },
    sourceArtifacts: {
      plan: planArtifact,
      readinessProbe: plan.sourceArtifact,
    },
    git: {
      branch: 'main',
      head: '1'.repeat(40),
      originMain: '1'.repeat(40),
      worktreeClean: true,
    },
    policy: {
      transaction: 'atomic repeatable-read exact backup + forward function + one-row canary',
      productionWritesAuthorized: true,
      repairExecutionAuthorized: true,
      backupCreated: true,
      forwardFunctionApplied: true,
      canaryCommitted: true,
      fullBackfillExecuted: false,
      ledgerWritten: false,
      ownerDecisionRecorded: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    backup: {
      runId: 'qit-20260725T060000Z-deadbeef',
      table: 'etl.aios_influencer_tag_repair_backup',
      rows: 3,
      rowsSha256: backupEvidence.rowsSha256,
      sourceProbeSha256: probeArtifact.sha256,
    },
    forwardFunction: {
      signature: plan.execution.forwardFunction.signature,
      sourceBytes: plan.execution.forwardFunction.definitionBytes,
      sourceSha256: plan.execution.forwardFunction.definitionSha256,
      catalogDefinitionBytes: Buffer.byteLength(functionDefinition),
      catalogDefinitionSha256: functionCatalogSha256,
    },
    canary: {
      id: canary.id,
      postUpdateRowVersion: '20',
      postUpdateUpdatedAt: '2026-07-25 06:01:00',
      expectedSha256: canary.expectedSha256,
    },
    preflight: {
      generatedAt: probe.generatedAt,
      activeRows: 285,
      mismatchRows: 3,
      waitingLocks: 0,
    },
    postcheck: {
      activeRows: 285,
      backupRows: 3,
      backupRowsSha256: backupEvidence.rowsSha256,
      canaryPostUpdateRowVersion: '20',
      canaryPostUpdateUpdatedAt: '2026-07-25 06:01:00',
      functionCatalogDefinitionSha256: functionCatalogSha256,
      remainingIdsSha256: sha256Json(['2', '3']),
      remainingMismatchRows: 2,
      waitingLocks: 0,
    },
  };
  const stage1Artifact = influencerTagAuditArtifact(
    stage1,
    '/tmp/influencer-tag-stage1.json',
  );

  class FakeClient {
    constructor({ failBatchGuard = false, failCommittedPostcheck = false } = {}) {
      this.committed = false;
      this.failBatchGuard = failBatchGuard;
      this.failCommittedPostcheck = failCommittedPostcheck;
      this.queries = [];
      this.rows = new Map(plan.execution.changes.map((row) => [row.id, {
        id: row.id,
        rowVersion: row.sourceRowVersion,
        updatedAt: row.sourceUpdatedAt,
        tags: structuredClone(row.before.tags),
        anchorDesc: row.before.anchorDesc,
      }]));
      const canaryRow = this.rows.get(canary.id);
      canaryRow.rowVersion = '20';
      canaryRow.updatedAt = '2026-07-25 06:01:00';
      canaryRow.tags = structuredClone(canary.expected.tags);
      canaryRow.anchorDesc = canary.expected.anchorDesc;
    }

    mismatchChanges() {
      return plan.execution.changes.filter((change) => {
        const row = this.rows.get(change.id);
        return sha256Json({ tags: row.tags, anchorDesc: row.anchorDesc }) !== change.expectedSha256;
      });
    }

    async query(sql, params = []) {
      this.queries.push({ params, sql });
      if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'
        || sql === 'BEGIN READ ONLY'
        || sql.startsWith('SET LOCAL')
        || sql.includes('pg_advisory_xact_lock')
        || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql === 'COMMIT') {
        this.committed = true;
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage1:function_catalog')) {
        return { rows: [{
          oid: '900',
          routine_kind: 'f',
          definition: functionDefinition,
          description: functionDescription,
        }] };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage1:backup_rows')) {
        return { rows: backupRows() };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage1:postcheck_summary')) {
        const mismatches = this.mismatchChanges();
        return { rows: [{
          active_rows: '285',
          mismatch_rows: String(mismatches.length),
          tags_only_mismatch_rows: '0',
          anchor_desc_only_mismatch_rows: String(mismatches.length),
          both_mismatch_rows: '0',
          waiting_locks: this.failCommittedPostcheck && this.committed ? '1' : '0',
        }] };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage1:postcheck_impact_rows')) {
        return { rows: this.mismatchChanges().map((change) => {
          const row = this.rows.get(change.id);
          return {
            id: row.id,
            row_version: row.rowVersion,
            updated_at: row.updatedAt,
            before_tags: row.tags,
            before_anchor_desc: row.anchorDesc,
            expected_tags: change.expected.tags,
            expected_anchor_desc: change.expected.anchorDesc,
          };
        }) };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage2:current_planned_rows')) {
        return { rows: plan.execution.changes.map((change) => {
          const row = this.rows.get(change.id);
          return {
            planned_id: change.id,
            current_id: row.id,
            current_xmin: row.rowVersion,
            current_updated_at: row.updatedAt,
            current_tags: row.tags,
            current_anchor_desc: row.anchorDesc,
            is_deleted: false,
          };
        }) };
      }
      if (sql.includes('aios_qianchuan_influencer_tag_stage2:batch_update')) {
        const selected = JSON.parse(params[0]);
        const applied = this.failBatchGuard ? selected.slice(0, -1) : selected;
        const rows = applied.map((change) => {
          const row = this.rows.get(change.id);
          row.rowVersion = String(30 + Number(change.id));
          row.updatedAt = `2026-07-25 06:02:0${change.id}`;
          row.tags = structuredClone(change.expected.tags);
          row.anchorDesc = change.expected.anchorDesc;
          return {
            id: row.id,
            row_version: row.rowVersion,
            updated_at: row.updatedAt,
            tags: row.tags,
            anchor_desc: row.anchorDesc,
          };
        });
        return { rowCount: rows.length, rows };
      }
      throw new Error(`Unexpected influencer-tag Stage 2 fixture SQL: ${sql.slice(0, 120)}`);
    }
  }

  return {
    createClient: (options) => new FakeClient(options),
    plan,
    planArtifact,
    probe,
    probeArtifact,
    stage1,
    stage1Artifact,
  };
}

export async function buildCompletedInfluencerTagForwardRepairFixture() {
  const fixture = createInfluencerTagStage2Fixture();
  const client = fixture.createClient();
  const first = await runQianchuanInfluencerTagStage2Batch({
    batchSize: 1,
    client,
    git: fixture.stage1.git,
    now: () => new Date('2026-07-25T06:02:00.000Z'),
    plan: fixture.plan,
    planArtifact: fixture.planArtifact,
    planSha256: fixture.planArtifact.sha256,
    stage1: fixture.stage1,
    stage1Artifact: fixture.stage1Artifact,
    stage1Sha256: fixture.stage1Artifact.sha256,
  });
  const firstArtifact = influencerTagAuditArtifact(
    first,
    '/tmp/influencer-tag-stage2-first.json',
  );
  const stage2Checkpoint = await runQianchuanInfluencerTagStage2Batch({
    batchSize: 1,
    checkpoint: first,
    checkpointArtifact: firstArtifact,
    checkpointSha256: firstArtifact.sha256,
    client,
    git: fixture.stage1.git,
    now: () => new Date('2026-07-25T06:03:00.000Z'),
    plan: fixture.plan,
    planArtifact: fixture.planArtifact,
    planSha256: fixture.planArtifact.sha256,
    stage1: fixture.stage1,
    stage1Artifact: fixture.stage1Artifact,
    stage1Sha256: fixture.stage1Artifact.sha256,
  });
  const stage2CheckpointArtifact = influencerTagAuditArtifact(
    stage2Checkpoint,
    '/tmp/influencer-tag-stage2-completed.json',
  );
  const postrepairProbe = structuredClone(fixture.probe);
  postrepairProbe.generatedAt = '2026-07-25T06:04:00.000Z';
  postrepairProbe.summary.normalizeFunctionPresent = true;
  postrepairProbe.summary.mismatchRows = 0;
  postrepairProbe.summary.tagsOnlyMismatchRows = 0;
  postrepairProbe.summary.anchorDescOnlyMismatchRows = 0;
  postrepairProbe.summary.bothMismatchRows = 0;
  postrepairProbe.summary.impactRowsCaptured = 0;
  postrepairProbe.summary.estimatedBackupBytes = 0;
  postrepairProbe.catalog.routines[0] = {
    signature: 'ads.fn_influencer_library_normalize_anchor_tag(text)',
    present: true,
    routineKind: 'f',
    definitionBytes: fixture.stage1.forwardFunction.catalogDefinitionBytes,
    definitionSha256: fixture.stage1.forwardFunction.catalogDefinitionSha256,
  };
  postrepairProbe.impactRows = [];
  validateQianchuanInfluencerTagPostrepairReadonlyProbe(postrepairProbe);
  const postrepairProbeArtifact = influencerTagAuditArtifact(
    postrepairProbe,
    '/tmp/influencer-tag-postrepair.json',
  );
  return {
    ...fixture,
    client,
    firstCheckpoint: first,
    firstCheckpointArtifact: firstArtifact,
    postrepairProbe,
    postrepairProbeArtifact,
    stage2Checkpoint,
    stage2CheckpointArtifact,
  };
}
