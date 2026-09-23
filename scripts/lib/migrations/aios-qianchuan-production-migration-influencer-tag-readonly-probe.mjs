import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import { validateQianchuanProductionMigrationP1dReadonlyProbe } from './aios-qianchuan-production-migration-p1d-readonly-probe.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

const TARGET_IDENTITY = 'warehouse/20260510_1800';
const TARGET_CHECKSUM = '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a';
const TARGET_SOURCE = 'etl/groland_postgres/sql/migrations/20260510_1800__normalize_influencer_library_anchor_tags.sql';
const RELATION = 'ads.influencer_library';
const NORMALIZE_SIGNATURE = 'ads.fn_influencer_library_normalize_anchor_tag(text)';
const CAPTURE_LIMIT = 1000;

const REQUIRED_COLUMNS = Object.freeze([
  Object.freeze({ dataType: 'bigint', name: 'id', notNull: true }),
  Object.freeze({ dataType: 'text[]', name: 'tags', notNull: true }),
  Object.freeze({ dataType: 'text', name: 'anchor_desc', notNull: false }),
  Object.freeze({ dataType: 'timestamp without time zone', name: 'updated_at', notNull: true }),
  Object.freeze({ dataType: 'boolean', name: 'is_deleted', notNull: true }),
]);

const ROUTINES = Object.freeze([
  Object.freeze({ expectedKind: 'f', signature: NORMALIZE_SIGNATURE }),
  Object.freeze({ expectedKind: 'f', signature: 'ads.fn_influencer_library_parse_number(text)' }),
  Object.freeze({ expectedKind: 'f', signature: 'ads.fn_touch_influencer_library_updated_at()' }),
  Object.freeze({ expectedKind: 'p', signature: 'ads.initialize_influencer_library_from_feishu_sources()' }),
]);

const TABLE_STATS_SQL = `/* aios_qianchuan_influencer_tag:table_stats */
SELECT
  requested.qualified_name,
  relation.oid::TEXT AS oid,
  relation.relkind::TEXT AS relation_kind,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_relation_size(relation.oid)::TEXT END AS heap_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_indexes_size(relation.oid)::TEXT END AS index_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_total_relation_size(relation.oid)::TEXT END AS total_bytes,
  stats.n_live_tup::TEXT AS estimated_live_rows,
  stats.n_dead_tup::TEXT AS estimated_dead_rows,
  COALESCE(locks.granted_locks, 0)::TEXT AS granted_locks,
  COALESCE(locks.waiting_locks, 0)::TEXT AS waiting_locks
FROM (VALUES ($1::TEXT)) AS requested(qualified_name)
LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.qualified_name)
LEFT JOIN pg_stat_user_tables stats ON stats.relid = relation.oid
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE lock.granted)::BIGINT AS granted_locks,
    COUNT(*) FILTER (WHERE NOT lock.granted)::BIGINT AS waiting_locks
  FROM pg_locks lock
  WHERE lock.relation = relation.oid
) locks ON TRUE`;

const PRIMARY_KEY_SQL = `/* aios_qianchuan_influencer_tag:primary_key */
SELECT
  constraint_record.conname AS constraint_name,
  pg_get_constraintdef(constraint_record.oid, TRUE) AS definition
FROM pg_constraint constraint_record
WHERE constraint_record.conrelid = to_regclass($1)
  AND constraint_record.contype = 'p'
ORDER BY constraint_record.conname`;

const COLUMNS_SQL = `/* aios_qianchuan_influencer_tag:columns */
SELECT
  requested.column_name,
  attribute.attnum::TEXT AS position,
  CASE WHEN attribute.attnum IS NULL THEN NULL
    ELSE format_type(attribute.atttypid, attribute.atttypmod) END AS data_type,
  attribute.attnotnull AS not_null
FROM unnest($2::TEXT[]) WITH ORDINALITY AS requested(column_name, position)
LEFT JOIN pg_attribute attribute
  ON attribute.attrelid = to_regclass($1)
 AND attribute.attname = requested.column_name
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
ORDER BY requested.position`;

const ROUTINES_SQL = `/* aios_qianchuan_influencer_tag:routines */
SELECT
  requested.signature,
  routine.oid::TEXT AS oid,
  routine.prokind::TEXT AS routine_kind,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_functiondef(routine.oid) END AS definition
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(signature, position)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)
ORDER BY requested.position`;

const TRIGGER_SQL = `/* aios_qianchuan_influencer_tag:trigger */
SELECT
  trigger_record.oid::TEXT AS oid,
  trigger_record.tgname AS trigger_name,
  trigger_record.tgenabled::TEXT AS enabled,
  pg_get_triggerdef(trigger_record.oid, TRUE) AS definition
FROM pg_trigger trigger_record
WHERE trigger_record.tgrelid = to_regclass($1)
  AND trigger_record.tgname = 'trg_touch_influencer_library_updated_at'
  AND NOT trigger_record.tgisinternal`;

const IMPACT_SUMMARY_SQL = `/* aios_qianchuan_influencer_tag:impact_summary */
WITH ${QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL},
mismatches AS (
  SELECT *,
    tags IS DISTINCT FROM normalized_tags AS tags_mismatch,
    anchor_desc IS DISTINCT FROM expected_anchor_desc AS anchor_desc_mismatch
  FROM normalized_rows
  WHERE tags IS DISTINCT FROM normalized_tags
     OR anchor_desc IS DISTINCT FROM expected_anchor_desc
)
SELECT
  (SELECT COUNT(*) FROM normalized_rows)::TEXT AS active_rows,
  (SELECT COUNT(*) FROM normalized_rows WHERE cardinality(normalized_tags) > 0)::TEXT AS rows_with_normalized_tags,
  COUNT(*)::TEXT AS mismatch_rows,
  COUNT(*) FILTER (WHERE tags_mismatch AND NOT anchor_desc_mismatch)::TEXT AS tags_only_mismatch_rows,
  COUNT(*) FILTER (WHERE NOT tags_mismatch AND anchor_desc_mismatch)::TEXT AS anchor_desc_only_mismatch_rows,
  COUNT(*) FILTER (WHERE tags_mismatch AND anchor_desc_mismatch)::TEXT AS both_mismatch_rows,
  COALESCE(SUM(pg_column_size(jsonb_build_object(
    'id', id,
    'rowVersion', row_version,
    'tags', tags,
    'anchorDesc', anchor_desc,
    'updatedAt', updated_at
  ))), 0)::TEXT AS estimated_backup_bytes,
  (SELECT MAX(updated_at)::TEXT FROM normalized_rows) AS max_updated_at
FROM mismatches`;

const IMPACT_ROWS_SQL = `/* aios_qianchuan_influencer_tag:impact_rows */
WITH ${QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL}
SELECT
  id,
  row_version,
  updated_at::TEXT AS updated_at,
  tags AS before_tags,
  anchor_desc AS before_anchor_desc,
  normalized_tags AS expected_tags,
  expected_anchor_desc
FROM normalized_rows
WHERE tags IS DISTINCT FROM normalized_tags
   OR anchor_desc IS DISTINCT FROM expected_anchor_desc
ORDER BY id::BIGINT
LIMIT $1`;

function asCount(value, label = 'Count') {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function definitionEvidence(row, identity) {
  const definition = row?.definition ?? null;
  return {
    ...identity,
    present: row?.oid != null,
    routineKind: row?.routine_kind ?? null,
    enabled: row?.enabled ?? null,
    definitionBytes: definition == null ? null : Buffer.byteLength(definition),
    definitionSha256: definition == null
      ? null
      : createHash('sha256').update(definition).digest('hex'),
  };
}

function normalizePrimaryKeyDefinition(value) {
  return String(value ?? '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function validateSources(p1Packet, p1Artifact, p1Sha256, p1dProbe, p1dProbeArtifact, p1dProbeSha256) {
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'Reviewed P1 overlay');
  assertPinnedMigrationReviewArtifact(p1dProbeArtifact, p1dProbeSha256, 'P1D read-only probe');
  validateQianchuanProductionMigrationP1dReadonlyProbe(p1dProbe);
  if (p1Packet?.mode !== 'offline_readonly_reviewed_p1_overlay'
    || p1Packet.policy?.productionWritesAuthorized !== false
    || p1Packet.policy?.ledgerWritesAuthorized !== false
    || p1Packet.summary?.byWave?.P1D !== 5) {
    throw new Error('Influencer-tag probe requires the reviewed P1 overlay with exact P1D=5 boundary.');
  }
  const entry = p1Packet.entries?.find((value) => `${value.namespace}/${value.version}` === TARGET_IDENTITY);
  const missingEffect = entry?.effects?.unsatisfiedCurrentEffects?.[0];
  const unsupportedSignals = new Set(entry?.unsupportedSignals ?? []);
  if (!entry || entry.checksum !== TARGET_CHECKSUM || entry.relativePath !== TARGET_SOURCE
    || entry.authoritativeClassification !== 'unknown' || entry.reviewWaveLabel !== 'P1D'
    || entry.review?.decision !== null || entry.review?.reviewer !== null
    || entry.effects?.unsatisfied !== 1 || entry.effects?.satisfied !== 0
    || entry.effects?.unsatisfiedCurrentEffects?.length !== 1
    || missingEffect?.key !== `routine:function:${NORMALIZE_SIGNATURE}`
    || missingEffect?.present !== false || missingEffect?.expectedPresent !== true
    || !unsupportedSignals.has('dml_or_backfill') || !unsupportedSignals.has('procedural_body')) {
    throw new Error(`${TARGET_IDENTITY} no longer matches the unresolved influencer-tag repair boundary.`);
  }
  const probeEntry = p1dProbe.entryEvidence.find((value) => value.family === 'influencer_tag_normalization');
  if (!probeEntry || probeEntry.evidenceState !== 'missing_runtime_contract_with_data_drift'
    || probeEntry.decision !== null || probeEntry.reviewer !== null
    || JSON.stringify(probeEntry.entries) !== JSON.stringify([TARGET_IDENTITY])
    || asCount(p1dProbe.dataShapes?.normalization?.mismatchRows, 'Prior mismatch rows') < 1) {
    throw new Error('Pinned P1D probe no longer proves unresolved influencer-tag data drift.');
  }
  return entry;
}

function exactColumnCount(columns) {
  const byName = new Map(columns.map((column) => [column.column_name, column]));
  return REQUIRED_COLUMNS.filter((expected) => {
    const actual = byName.get(expected.name);
    return actual?.position != null
      && actual.data_type === expected.dataType
      && actual.not_null === expected.notNull;
  }).length;
}

function impactEvidence(row) {
  const before = { tags: row.before_tags, anchorDesc: row.before_anchor_desc };
  const expected = { tags: row.expected_tags, anchorDesc: row.expected_anchor_desc };
  return {
    id: row.id,
    rowVersion: row.row_version,
    updatedAt: row.updated_at,
    before,
    expected,
    beforeSha256: sha256Json(before),
    expectedSha256: sha256Json(expected),
  };
}

export async function runQianchuanInfluencerTagReadonlyProbe({
  client,
  now = () => new Date(),
  p1Artifact,
  p1Packet,
  p1Sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256,
  statementTimeoutMs = 30000,
}) {
  const targetEntry = validateSources(
    p1Packet,
    p1Artifact,
    p1Sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256,
  );
  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const table = (await client.query(TABLE_STATS_SQL, [RELATION])).rows[0] ?? {};
    const primaryKeys = (await client.query(PRIMARY_KEY_SQL, [RELATION])).rows;
    const columns = (await client.query(COLUMNS_SQL, [RELATION, REQUIRED_COLUMNS.map((entry) => entry.name)])).rows;
    const routineRows = (await client.query(ROUTINES_SQL, [ROUTINES.map((entry) => entry.signature)])).rows;
    const triggerRows = (await client.query(TRIGGER_SQL, [RELATION])).rows;
    const impactSummary = (await client.query(IMPACT_SUMMARY_SQL)).rows[0] ?? {};
    const impactRows = (await client.query(IMPACT_ROWS_SQL, [CAPTURE_LIMIT])).rows.map(impactEvidence);
    const routines = routineRows.map((row, index) => definitionEvidence(row, {
      expectedKind: ROUTINES[index].expectedKind,
      signature: ROUTINES[index].signature,
    }));
    const trigger = definitionEvidence(triggerRows[0], {
      triggerName: 'trg_touch_influencer_library_updated_at',
    });
    const routineBySignature = new Map(routines.map((routine) => [routine.signature, routine]));
    const supportRoutines = ROUTINES.slice(1);
    const mismatchRows = asCount(impactSummary.mismatch_rows, 'Mismatch rows');
    if (mismatchRows > CAPTURE_LIMIT || impactRows.length !== mismatchRows) {
      throw new Error(`Influencer-tag mismatch capture must fit the exact ${CAPTURE_LIMIT}-row bound.`);
    }
    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_influencer_tag_normalization_repair_readiness_probe',
      target: {
        identity: TARGET_IDENTITY,
        checksum: TARGET_CHECKSUM,
        source: targetEntry.source,
      },
      sourceArtifacts: {
        p1: p1Artifact,
        p1dProbe: p1dProbeArtifact,
      },
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs,
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
        relationsPresent: table.oid == null ? 0 : 1,
        exactPrimaryKeys: primaryKeys.filter((row) => (
          normalizePrimaryKeyDefinition(row.definition) === 'primary key (id)'
        )).length,
        exactRequiredColumns: exactColumnCount(columns),
        supportRoutinesPresent: supportRoutines.filter((expected) => {
          const actual = routineBySignature.get(expected.signature);
          return actual?.present && actual.routineKind === expected.expectedKind;
        }).length,
        normalizeFunctionPresent: routineBySignature.get(NORMALIZE_SIGNATURE)?.present === true,
        touchTriggerPresent: trigger.present
          && trigger.enabled === 'O'
          && triggerRows[0]?.definition?.includes('ads.fn_touch_influencer_library_updated_at()') === true ? 1 : 0,
        activeRows: asCount(impactSummary.active_rows, 'Active rows'),
        rowsWithNormalizedTags: asCount(impactSummary.rows_with_normalized_tags, 'Rows with normalized tags'),
        mismatchRows,
        tagsOnlyMismatchRows: asCount(impactSummary.tags_only_mismatch_rows, 'Tags-only mismatch rows'),
        anchorDescOnlyMismatchRows: asCount(impactSummary.anchor_desc_only_mismatch_rows, 'Anchor-desc-only mismatch rows'),
        bothMismatchRows: asCount(impactSummary.both_mismatch_rows, 'Both-field mismatch rows'),
        impactRowsCaptured: impactRows.length,
        captureLimit: CAPTURE_LIMIT,
        estimatedBackupBytes: asCount(impactSummary.estimated_backup_bytes, 'Estimated backup bytes'),
        waitingLocks: asCount(table.waiting_locks, 'Waiting locks'),
        maxUpdatedAt: impactSummary.max_updated_at ?? null,
        repairPlanReady: false,
      },
      catalog: {
        table,
        primaryKeys,
        columns,
        routines,
        trigger,
      },
      impactRows,
    };
  });
}

function validateProbeEnvelopeAndPolicy(result) {
  if (result?.schemaVersion !== 1
    || result.mode !== 'live_readonly_influencer_tag_normalization_repair_readiness_probe'
    || result.target?.identity !== TARGET_IDENTITY
    || result.target?.checksum !== TARGET_CHECKSUM
    || result.target?.source?.path !== TARGET_SOURCE
    || !result.catalog?.table
    || !Array.isArray(result.impactRows)) {
    throw new Error('Influencer-tag repair readiness probe structure is invalid.');
  }
  if (result.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || result.policy?.networkAccess !== true
    || !Number.isInteger(result.policy?.statementTimeoutMs)
    || result.policy.statementTimeoutMs < 1000 || result.policy.statementTimeoutMs > 120000
    || result.policy?.productionWritesAuthorized !== false
    || result.policy?.ledgerWritesAuthorized !== false
    || result.policy?.repairExecutionAuthorized !== false
    || result.policy?.backupCreated !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.arkInvoked !== false
    || result.summary?.repairPlanReady !== false) {
    throw new Error('Influencer-tag repair readiness probe policy is unsafe.');
  }
}

function validateCommonCatalogEvidence(result) {
  if (result.summary?.relationsPresent !== 1
    || result.catalog.table.relation_kind !== 'r'
    || asCount(result.catalog.table.total_bytes, 'Table total bytes') < 1
    || result.summary?.exactPrimaryKeys !== 1
    || result.summary?.exactRequiredColumns !== REQUIRED_COLUMNS.length
    || result.summary?.supportRoutinesPresent !== ROUTINES.length - 1
    || result.summary?.touchTriggerPresent !== 1
    || asCount(result.summary?.activeRows, 'Active rows') < 1
    || asCount(result.summary?.rowsWithNormalizedTags, 'Rows with normalized tags') > result.summary.activeRows
    || result.summary?.captureLimit !== CAPTURE_LIMIT
    || asCount(result.summary?.waitingLocks, 'Waiting locks') !== 0
    || typeof result.summary?.maxUpdatedAt !== 'string' || !result.summary.maxUpdatedAt) {
    throw new Error('Influencer-tag catalog evidence is incomplete.');
  }
}

function mismatchBreakdown(result) {
  return asCount(result.summary?.tagsOnlyMismatchRows, 'Tags-only mismatch rows')
    + asCount(result.summary?.anchorDescOnlyMismatchRows, 'Anchor-desc-only mismatch rows')
    + asCount(result.summary?.bothMismatchRows, 'Both-field mismatch rows');
}

export function validateQianchuanInfluencerTagReadonlyProbe(result) {
  validateProbeEnvelopeAndPolicy(result);
  validateCommonCatalogEvidence(result);
  const mismatchRows = asCount(result.summary?.mismatchRows, 'Mismatch rows');
  if (result.summary?.normalizeFunctionPresent !== false
    || mismatchRows < 1 || mismatchRows > CAPTURE_LIMIT
    || mismatchBreakdown(result) !== mismatchRows
    || result.summary?.impactRowsCaptured !== mismatchRows
    || asCount(result.summary?.estimatedBackupBytes, 'Estimated backup bytes') < 1
    || result.impactRows.length !== mismatchRows) {
    throw new Error('Influencer-tag repair readiness evidence is incomplete.');
  }
  const ids = new Set();
  for (const row of result.impactRows) {
    if (!row?.id || !row.rowVersion || !Array.isArray(row.before?.tags)
      || !Array.isArray(row.expected?.tags) || row.beforeSha256?.length !== 64
      || row.expectedSha256?.length !== 64
      || JSON.stringify(row.before) === JSON.stringify(row.expected)
      || ids.has(row.id)) {
      throw new Error('Influencer-tag impact row evidence is invalid.');
    }
    ids.add(row.id);
  }
  return result;
}

export function validateQianchuanInfluencerTagPostrepairReadonlyProbe(result) {
  validateProbeEnvelopeAndPolicy(result);
  validateCommonCatalogEvidence(result);
  const normalizeRoutine = result.catalog.routines?.find((routine) => (
    routine.signature === NORMALIZE_SIGNATURE
  ));
  if (result.summary?.normalizeFunctionPresent !== true
    || !normalizeRoutine?.present || normalizeRoutine.routineKind !== 'f'
    || !/^[a-f0-9]{64}$/.test(normalizeRoutine.definitionSha256 ?? '')
    || asCount(normalizeRoutine.definitionBytes, 'Normalize function definition bytes') < 1
    || asCount(result.summary?.mismatchRows, 'Post-repair mismatch rows') !== 0
    || mismatchBreakdown(result) !== 0
    || result.summary?.impactRowsCaptured !== 0
    || asCount(result.summary?.estimatedBackupBytes, 'Post-repair estimated backup bytes') !== 0
    || result.impactRows.length !== 0) {
    throw new Error('Influencer-tag post-repair evidence is incomplete.');
  }
  return result;
}
