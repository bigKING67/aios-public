import {
  QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
} from './aios-qianchuan-production-migration-influencer-tag-stage1-sql.mjs';

export const QIANCHUAN_INFLUENCER_TAG_STAGE2_ADVISORY_LOCK =
  'aios:qianchuan:influencer-tag-stage2';

const PLANNED_ROWS_CTE_SQL = `planned AS (
  SELECT
    (change ->> 'id')::BIGINT AS id,
    change ->> 'sourceRowVersion' AS source_xmin,
    (change ->> 'sourceUpdatedAt')::TIMESTAMP WITHOUT TIME ZONE AS source_updated_at,
    ARRAY(SELECT jsonb_array_elements_text(change -> 'before' -> 'tags'))::TEXT[] AS before_tags,
    change -> 'before' ->> 'anchorDesc' AS before_anchor_desc,
    ARRAY(SELECT jsonb_array_elements_text(change -> 'expected' -> 'tags'))::TEXT[] AS expected_tags,
    change -> 'expected' ->> 'anchorDesc' AS expected_anchor_desc,
    change ->> 'beforeSha256' AS before_sha256,
    change ->> 'expectedSha256' AS expected_sha256
  FROM jsonb_array_elements($1::JSONB) AS input(change)
)`;

export const STAGE2_CURRENT_PLANNED_ROWS_SQL = `/* aios_qianchuan_influencer_tag_stage2:current_planned_rows */
WITH ${PLANNED_ROWS_CTE_SQL}
SELECT
  planned.id::TEXT AS planned_id,
  planned.source_xmin,
  planned.source_updated_at::TEXT AS source_updated_at,
  planned.before_tags,
  planned.before_anchor_desc,
  planned.expected_tags,
  planned.expected_anchor_desc,
  planned.before_sha256,
  planned.expected_sha256,
  library.id::TEXT AS current_id,
  library.xmin::TEXT AS current_xmin,
  library.updated_at::TEXT AS current_updated_at,
  library.tags AS current_tags,
  library.anchor_desc AS current_anchor_desc,
  library.is_deleted
FROM planned
LEFT JOIN ads.influencer_library library ON library.id = planned.id
ORDER BY planned.id`;

export const STAGE2_BATCH_UPDATE_SQL = `/* aios_qianchuan_influencer_tag_stage2:batch_update */
WITH ${PLANNED_ROWS_CTE_SQL},
selected AS MATERIALIZED (
  SELECT
    library.ctid,
    planned.expected_tags,
    planned.expected_anchor_desc
  FROM planned
  JOIN ads.influencer_library library ON library.id = planned.id
  WHERE library.is_deleted = FALSE
    AND library.xmin::TEXT = planned.source_xmin
    AND library.updated_at IS NOT DISTINCT FROM planned.source_updated_at
    AND library.tags IS NOT DISTINCT FROM planned.before_tags
    AND library.anchor_desc IS NOT DISTINCT FROM planned.before_anchor_desc
    AND EXISTS (
      SELECT 1
      FROM ${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE} backup
      WHERE backup.repair_run_id = $2
        AND backup.id = planned.id
        AND backup.source_xmin = planned.source_xmin
        AND backup.source_updated_at IS NOT DISTINCT FROM planned.source_updated_at
        AND backup.tags IS NOT DISTINCT FROM planned.before_tags
        AND backup.anchor_desc IS NOT DISTINCT FROM planned.before_anchor_desc
        AND backup.before_sha256 = planned.before_sha256
        AND backup.expected_sha256 = planned.expected_sha256
    )
  ORDER BY library.id
  FOR UPDATE OF library
)
UPDATE ads.influencer_library library
SET
  tags = selected.expected_tags,
  anchor_desc = selected.expected_anchor_desc
FROM selected
WHERE library.ctid = selected.ctid
RETURNING
  library.id::TEXT AS id,
  library.xmin::TEXT AS row_version,
  library.updated_at::TEXT AS updated_at,
  library.tags,
  library.anchor_desc`;
