import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';

export const QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE =
  'etl.aios_influencer_tag_repair_backup';
export const QIANCHUAN_INFLUENCER_TAG_STAGE1_ADVISORY_LOCK =
  'aios:qianchuan:influencer-tag-stage1';

export const STAGE1_FUNCTION_CATALOG_SQL = `/* aios_qianchuan_influencer_tag_stage1:function_catalog */
SELECT
  routine.oid::TEXT AS oid,
  routine.prokind::TEXT AS routine_kind,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_functiondef(routine.oid) END AS definition,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE obj_description(routine.oid, 'pg_proc') END AS description
FROM (VALUES ('ads.fn_influencer_library_normalize_anchor_tag(text)'::TEXT)) AS requested(signature)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)`;

export const STAGE1_BACKUP_TABLE_SQL = `/* aios_qianchuan_influencer_tag_stage1:backup_table */
CREATE TABLE IF NOT EXISTS ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE} (
  repair_run_id TEXT NOT NULL,
  backed_up_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  id BIGINT NOT NULL,
  source_xmin TEXT NOT NULL,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  tags TEXT[] NOT NULL,
  anchor_desc TEXT,
  before_sha256 TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL,
  CONSTRAINT pk_aios_influencer_tag_repair_backup
    PRIMARY KEY (repair_run_id, id),
  CONSTRAINT chk_aios_influencer_tag_repair_backup_xmin
    CHECK (source_xmin ~ '^[0-9]+$'),
  CONSTRAINT chk_aios_influencer_tag_repair_backup_before_sha
    CHECK (before_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT chk_aios_influencer_tag_repair_backup_expected_sha
    CHECK (expected_sha256 ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE}
  IS 'Exact pre-repair influencer tag rows retained for guarded forward repair and rollback.'`;

export const STAGE1_BACKUP_TABLE_SHAPE_SQL = `/* aios_qianchuan_influencer_tag_stage1:backup_shape */
SELECT
  COUNT(*)::TEXT AS column_count,
  jsonb_object_agg(column_name, udt_name ORDER BY ordinal_position) AS column_types,
  (
    SELECT pg_get_constraintdef(constraint_record.oid, TRUE)
    FROM pg_constraint constraint_record
    WHERE constraint_record.conrelid = to_regclass($1)
      AND constraint_record.contype = 'p'
  ) AS primary_key
FROM information_schema.columns
WHERE table_schema = split_part($1, '.', 1)
  AND table_name = split_part($1, '.', 2)`;

export const STAGE1_EXISTING_BACKUP_RUN_SQL = `/* aios_qianchuan_influencer_tag_stage1:existing_backup_run */
SELECT COUNT(*)::TEXT AS rows
FROM ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE}
WHERE repair_run_id = $1`;

export const STAGE1_EXACT_BACKUP_SQL = `/* aios_qianchuan_influencer_tag_stage1:exact_backup */
WITH planned AS (
  SELECT
    (change ->> 'id')::BIGINT AS id,
    change ->> 'sourceRowVersion' AS source_xmin,
    (change ->> 'sourceUpdatedAt')::TIMESTAMP WITHOUT TIME ZONE AS source_updated_at,
    ARRAY(SELECT jsonb_array_elements_text(change -> 'before' -> 'tags'))::TEXT[] AS before_tags,
    change -> 'before' ->> 'anchorDesc' AS before_anchor_desc,
    change ->> 'beforeSha256' AS before_sha256,
    change ->> 'expectedSha256' AS expected_sha256
  FROM jsonb_array_elements($2::JSONB) AS input(change)
)
INSERT INTO ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE} (
  repair_run_id,
  id,
  source_xmin,
  source_updated_at,
  tags,
  anchor_desc,
  before_sha256,
  expected_sha256
)
SELECT
  $1,
  library.id,
  library.xmin::TEXT,
  library.updated_at,
  library.tags,
  library.anchor_desc,
  planned.before_sha256,
  planned.expected_sha256
FROM planned
JOIN ads.influencer_library library ON library.id = planned.id
WHERE library.is_deleted = FALSE
  AND library.xmin::TEXT = planned.source_xmin
  AND library.updated_at IS NOT DISTINCT FROM planned.source_updated_at
  AND library.tags IS NOT DISTINCT FROM planned.before_tags
  AND library.anchor_desc IS NOT DISTINCT FROM planned.before_anchor_desc
ORDER BY library.id`;

export const STAGE1_BACKUP_ROWS_SQL = `/* aios_qianchuan_influencer_tag_stage1:backup_rows */
SELECT
  id::TEXT AS id,
  source_xmin,
  source_updated_at::TEXT AS source_updated_at,
  tags,
  anchor_desc,
  before_sha256,
  expected_sha256
FROM ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE}
WHERE repair_run_id = $1
ORDER BY id`;

export const STAGE1_CANARY_UPDATE_SQL = `/* aios_qianchuan_influencer_tag_stage1:canary_update */
WITH planned AS (
  SELECT
    ($1::JSONB ->> 'id')::BIGINT AS id,
    $1::JSONB ->> 'sourceRowVersion' AS source_xmin,
    ($1::JSONB ->> 'sourceUpdatedAt')::TIMESTAMP WITHOUT TIME ZONE AS source_updated_at,
    ARRAY(SELECT jsonb_array_elements_text($1::JSONB -> 'before' -> 'tags'))::TEXT[] AS before_tags,
    $1::JSONB -> 'before' ->> 'anchorDesc' AS before_anchor_desc,
    ARRAY(SELECT jsonb_array_elements_text($1::JSONB -> 'expected' -> 'tags'))::TEXT[] AS expected_tags,
    $1::JSONB -> 'expected' ->> 'anchorDesc' AS expected_anchor_desc
)
UPDATE ads.influencer_library library
SET
  tags = planned.expected_tags,
  anchor_desc = planned.expected_anchor_desc
FROM planned
WHERE library.id = planned.id
  AND library.is_deleted = FALSE
  AND library.xmin::TEXT = planned.source_xmin
  AND library.updated_at IS NOT DISTINCT FROM planned.source_updated_at
  AND library.tags IS NOT DISTINCT FROM planned.before_tags
  AND library.anchor_desc IS NOT DISTINCT FROM planned.before_anchor_desc
RETURNING
  library.id::TEXT AS id,
  library.xmin::TEXT AS row_version,
  library.updated_at::TEXT AS updated_at,
  library.tags,
  library.anchor_desc`;

export const STAGE1_POSTCHECK_SUMMARY_SQL = `/* aios_qianchuan_influencer_tag_stage1:postcheck_summary */
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
  (
    SELECT COUNT(*)::TEXT
    FROM pg_locks lock
    WHERE lock.relation = to_regclass('ads.influencer_library')
      AND NOT lock.granted
  ) AS waiting_locks
FROM mismatches`;

export const STAGE1_POSTCHECK_IMPACT_ROWS_SQL = `/* aios_qianchuan_influencer_tag_stage1:postcheck_impact_rows */
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
ORDER BY id::BIGINT`;

export const STAGE1_POSTCHECK_CANARY_SQL = `/* aios_qianchuan_influencer_tag_stage1:postcheck_canary */
SELECT
  id::TEXT AS id,
  xmin::TEXT AS row_version,
  updated_at::TEXT AS updated_at,
  tags,
  anchor_desc
FROM ads.influencer_library
WHERE id = $1::BIGINT
  AND is_deleted = FALSE`;
