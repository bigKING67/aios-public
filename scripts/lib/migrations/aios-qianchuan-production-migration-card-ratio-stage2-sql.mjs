import { QIANCHUAN_CARD_RATIO_PARITY_SQL } from './aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';
import {
  QIANCHUAN_CARD_RATIO_BACKUP_TABLE,
  QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE,
  QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE,
} from './aios-qianchuan-production-migration-card-ratio-stage1-sql.mjs';

export const QIANCHUAN_CARD_RATIO_STAGE2_ADVISORY_LOCK =
  'aios:qianchuan:card-ratio-stage2-batch';

export const STAGE2_LOCK_TARGETS_SQL = `/* aios_qianchuan_card_ratio_stage2:lock_targets */
LOCK TABLE ads.douyin_trade_sale_card, ads.douyin_trade_sale_card_detail
IN ROW EXCLUSIVE MODE`;

export const STAGE2_LOCK_BACKUP_SQL = `/* aios_qianchuan_card_ratio_stage2:lock_backup */
LOCK TABLE ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} IN SHARE MODE`;

export const STAGE2_GUARD_CATALOG_SQL = `/* aios_qianchuan_card_ratio_stage2:guard_catalog */
WITH user_triggers AS (
  SELECT
    namespace.nspname || '.' || relation.relname AS table_name,
    trigger_record.tgname AS trigger_name,
    trigger_record.tgenabled,
    pg_get_triggerdef(trigger_record.oid, TRUE) AS definition
  FROM pg_trigger trigger_record
  JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE NOT trigger_record.tgisinternal
    AND namespace.nspname = 'ads'
    AND relation.relname IN ('douyin_trade_sale_card', 'douyin_trade_sale_card_detail')
)
SELECT
  COUNT(*) FILTER (WHERE routine.oid IS NOT NULL)::TEXT AS functions_present,
  (SELECT COUNT(*)::TEXT FROM user_triggers) AS user_triggers_present,
  (
    SELECT COUNT(*)::TEXT
    FROM user_triggers trigger_row
    WHERE trigger_row.tgenabled = 'O'
      AND (
        (trigger_row.table_name = 'ads.douyin_trade_sale_card'
          AND trigger_row.trigger_name = 'trg_recompute_douyin_trade_sale_card_ratio_fields')
        OR
        (trigger_row.table_name = 'ads.douyin_trade_sale_card_detail'
          AND trigger_row.trigger_name = 'trg_recompute_douyin_trade_sale_card_detail_ratio_fields')
      )
  ) AS enabled_triggers_present,
  pg_get_functiondef(to_regprocedure('ads.fn_recompute_douyin_trade_sale_card_ratio_fields()'))
    AS main_function_definition,
  pg_get_functiondef(to_regprocedure('ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()'))
    AS detail_function_definition,
  (
    SELECT definition
    FROM user_triggers
    WHERE table_name = 'ads.douyin_trade_sale_card'
      AND trigger_name = 'trg_recompute_douyin_trade_sale_card_ratio_fields'
  ) AS main_trigger_definition,
  (
    SELECT definition
    FROM user_triggers
    WHERE table_name = 'ads.douyin_trade_sale_card_detail'
      AND trigger_name = 'trg_recompute_douyin_trade_sale_card_detail_ratio_fields'
  ) AS detail_trigger_definition
FROM unnest(ARRAY[
  'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
  'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()'
]::TEXT[]) AS requested(signature)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)`;

export const STAGE2_BACKUP_RUN_SQL = `/* aios_qianchuan_card_ratio_stage2:backup_run */
SELECT
  requested.source_table,
  COUNT(backup.backup_run_id)::TEXT AS rows,
  COUNT(backup.backup_run_id) FILTER (
    WHERE backup.source_probe_sha256 IS DISTINCT FROM $2
  )::TEXT AS source_probe_mismatch_rows
FROM unnest(ARRAY[
  'ads.douyin_trade_sale_card',
  'ads.douyin_trade_sale_card_detail'
]::TEXT[]) WITH ORDINALITY AS requested(source_table, position)
LEFT JOIN ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} backup
  ON backup.backup_run_id = $1
 AND backup.source_table = requested.source_table
GROUP BY requested.source_table, requested.position
ORDER BY requested.position`;

export const STAGE2_MISMATCH_COUNTS_SQL = `/* aios_qianchuan_card_ratio_stage2:mismatch_counts */
SELECT
  'ads.douyin_trade_sale_card'::TEXT AS table_name,
  COUNT(*)::TEXT AS mismatch_rows
FROM ads.douyin_trade_sale_card row_data
WHERE ${QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE}
UNION ALL
SELECT
  'ads.douyin_trade_sale_card_detail',
  COUNT(*)::TEXT
FROM ads.douyin_trade_sale_card_detail row_data
WHERE ${QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE}
ORDER BY table_name`;

export const STAGE2_PARITY_SQL = QIANCHUAN_CARD_RATIO_PARITY_SQL;

export const STAGE2_MAIN_CONFLICTS_SQL = `/* aios_qianchuan_card_ratio_stage2:main_conflicts */
SELECT
  COUNT(*) FILTER (WHERE backup.backup_run_id IS NULL)::TEXT AS outside_backup_rows,
  COUNT(*) FILTER (
    WHERE backup.backup_run_id IS NOT NULL
      AND (
        row_data.xmin::TEXT IS DISTINCT FROM backup.source_xmin
        OR row_data.updated_at IS DISTINCT FROM backup.source_updated_at
      )
  )::TEXT AS version_conflict_rows,
  COUNT(*) FILTER (
    WHERE $2::BOOLEAN
      AND (row_data."date", row_data.shop_name, row_data.shop_id, row_data.product_id)
        <= ($3::DATE, $4::TEXT, $5::TEXT, $6::TEXT)
  )::TEXT AS cursor_gap_rows
FROM ads.douyin_trade_sale_card row_data
LEFT JOIN ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} backup
  ON backup.backup_run_id = $1
 AND backup.source_table = 'ads.douyin_trade_sale_card'
 AND backup.row_key = jsonb_build_object(
   'shop_name', row_data.shop_name,
   'shop_id', row_data.shop_id,
   'date', row_data."date",
   'product_id', row_data.product_id
 )
WHERE ${QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE}`;

export const STAGE2_DETAIL_CONFLICTS_SQL = `/* aios_qianchuan_card_ratio_stage2:detail_conflicts */
SELECT
  COUNT(*) FILTER (WHERE backup.backup_run_id IS NULL)::TEXT AS outside_backup_rows,
  COUNT(*) FILTER (
    WHERE backup.backup_run_id IS NOT NULL
      AND (
        row_data.xmin::TEXT IS DISTINCT FROM backup.source_xmin
        OR row_data.updated_at IS DISTINCT FROM backup.source_updated_at
      )
  )::TEXT AS version_conflict_rows,
  COUNT(*) FILTER (
    WHERE $2::BOOLEAN
      AND (row_data.stat_date, row_data.shop_id, row_data.product_id, row_data.source_level1)
        <= ($3::DATE, $4::TEXT, $5::TEXT, $6::TEXT)
  )::TEXT AS cursor_gap_rows
FROM ads.douyin_trade_sale_card_detail row_data
LEFT JOIN ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} backup
  ON backup.backup_run_id = $1
 AND backup.source_table = 'ads.douyin_trade_sale_card_detail'
 AND backup.row_key = jsonb_build_object(
   'shop_id', row_data.shop_id,
   'stat_date', row_data.stat_date,
   'product_id', row_data.product_id,
   'source_level1', row_data.source_level1
 )
WHERE ${QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE}`;

const MAIN_UPDATE_PREDICATE = QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE
  .replaceAll('row_data.', 'target.');
const DETAIL_UPDATE_PREDICATE = QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE
  .replaceAll('row_data.', 'target.');

export const STAGE2_MAIN_BATCH_SQL = `/* aios_qianchuan_card_ratio_stage2:main_batch */
WITH selected AS (
  SELECT
    row_data.shop_name,
    row_data.shop_id,
    row_data."date",
    row_data.product_id
  FROM ads.douyin_trade_sale_card row_data
  JOIN ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} backup
    ON backup.backup_run_id = $1
   AND backup.source_table = 'ads.douyin_trade_sale_card'
   AND backup.row_key = jsonb_build_object(
     'shop_name', row_data.shop_name,
     'shop_id', row_data.shop_id,
     'date', row_data."date",
     'product_id', row_data.product_id
   )
  WHERE ${QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE}
    AND row_data.xmin::TEXT = backup.source_xmin
    AND row_data.updated_at IS NOT DISTINCT FROM backup.source_updated_at
    AND (
      NOT $2::BOOLEAN
      OR (row_data."date", row_data.shop_name, row_data.shop_id, row_data.product_id)
        > ($3::DATE, $4::TEXT, $5::TEXT, $6::TEXT)
    )
  ORDER BY row_data."date", row_data.shop_name, row_data.shop_id, row_data.product_id
  LIMIT $7
  FOR UPDATE OF row_data
), updated AS (
  UPDATE ads.douyin_trade_sale_card AS target
  SET card_click_rate_user = target.card_click_rate_user
  FROM selected
  WHERE target.shop_name = selected.shop_name
    AND target.shop_id = selected.shop_id
    AND target."date" = selected."date"
    AND target.product_id = selected.product_id
  RETURNING
    target."date"::TEXT AS cursor_1,
    target.shop_name::TEXT AS cursor_2,
    target.shop_id::TEXT AS cursor_3,
    target.product_id::TEXT AS cursor_4,
    NOT (${MAIN_UPDATE_PREDICATE}) AS formula_ok
)
SELECT cursor_1, cursor_2, cursor_3, cursor_4, formula_ok
FROM updated
ORDER BY cursor_1, cursor_2, cursor_3, cursor_4`;

export const STAGE2_DETAIL_BATCH_SQL = `/* aios_qianchuan_card_ratio_stage2:detail_batch */
WITH selected AS (
  SELECT
    row_data.stat_date,
    row_data.shop_id,
    row_data.product_id,
    row_data.source_level1
  FROM ads.douyin_trade_sale_card_detail row_data
  JOIN ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} backup
    ON backup.backup_run_id = $1
   AND backup.source_table = 'ads.douyin_trade_sale_card_detail'
   AND backup.row_key = jsonb_build_object(
     'shop_id', row_data.shop_id,
     'stat_date', row_data.stat_date,
     'product_id', row_data.product_id,
     'source_level1', row_data.source_level1
   )
  WHERE ${QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE}
    AND row_data.xmin::TEXT = backup.source_xmin
    AND row_data.updated_at IS NOT DISTINCT FROM backup.source_updated_at
    AND (
      NOT $2::BOOLEAN
      OR (row_data.stat_date, row_data.shop_id, row_data.product_id, row_data.source_level1)
        > ($3::DATE, $4::TEXT, $5::TEXT, $6::TEXT)
    )
  ORDER BY row_data.stat_date, row_data.shop_id, row_data.product_id, row_data.source_level1
  LIMIT $7
  FOR UPDATE OF row_data
), updated AS (
  UPDATE ads.douyin_trade_sale_card_detail AS target
  SET card_click_rate_user = target.card_click_rate_user
  FROM selected
  WHERE target.shop_id = selected.shop_id
    AND target.stat_date = selected.stat_date
    AND target.product_id = selected.product_id
    AND target.source_level1 = selected.source_level1
  RETURNING
    target.stat_date::TEXT AS cursor_1,
    target.shop_id::TEXT AS cursor_2,
    target.product_id::TEXT AS cursor_3,
    target.source_level1::TEXT AS cursor_4,
    NOT (${DETAIL_UPDATE_PREDICATE}) AS formula_ok
)
SELECT cursor_1, cursor_2, cursor_3, cursor_4, formula_ok
FROM updated
ORDER BY cursor_1, cursor_2, cursor_3, cursor_4`;
