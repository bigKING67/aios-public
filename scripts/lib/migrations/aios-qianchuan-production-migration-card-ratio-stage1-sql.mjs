export const QIANCHUAN_CARD_RATIO_BACKUP_TABLE = 'etl.aios_goods_card_ratio_repair_backup';
export const QIANCHUAN_CARD_RATIO_STAGE1_ADVISORY_LOCK = 'aios:qianchuan:card-ratio-stage1';

export const QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE = `ROW(
  row_data.card_click_rate_user,
  row_data.card_avg_click_per_user,
  row_data.new_customer_click_rate,
  row_data.old_customer_click_rate,
  row_data.card_avg_order_value,
  row_data.card_click_to_pay_rate_user,
  row_data.first_buy_new_rate,
  row_data.rebuy_old_rate,
  row_data.card_exposure_to_pay_rate_user,
  row_data.card_exposure_to_pay_rate_count,
  row_data.card_gpm,
  row_data.card_click_rate_count,
  row_data.card_click_to_pay_rate_count
) IS DISTINCT FROM ROW(
  CASE WHEN COALESCE(row_data.card_exposure_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_click_user_count, 0)::NUMERIC / row_data.card_exposure_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_click_count, 0)::NUMERIC / row_data.card_click_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_count, 0) > 0
    THEN ROUND(COALESCE(row_data.new_customer_click_count, 0)::NUMERIC / row_data.card_click_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_count, 0) > 0
    THEN ROUND(COALESCE(row_data.old_customer_click_count, 0)::NUMERIC / row_data.card_click_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_buyer_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_user_pay_amount, 0)::NUMERIC / row_data.card_buyer_count::NUMERIC, 2)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_buyer_count, 0)::NUMERIC / row_data.card_click_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_buyer_count, 0) > 0
    THEN ROUND(COALESCE(row_data.first_buy_user_count, 0)::NUMERIC / row_data.card_buyer_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_buyer_count, 0) > 0
    THEN ROUND(COALESCE(row_data.rebuy_user_count, 0)::NUMERIC / row_data.card_buyer_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_exposure_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_buyer_count, 0)::NUMERIC / row_data.card_exposure_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_exposure_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_order_count, 0)::NUMERIC / row_data.card_exposure_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_exposure_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_user_pay_amount, 0)::NUMERIC / row_data.card_exposure_count::NUMERIC * 1000, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_exposure_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_click_count, 0)::NUMERIC / row_data.card_exposure_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_order_count, 0)::NUMERIC / row_data.card_click_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END
)`;

export const QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE = `ROW(
  row_data.card_exposure_to_pay_rate_user,
  row_data.card_click_rate_user,
  row_data.card_click_to_pay_rate_user
) IS DISTINCT FROM ROW(
  CASE WHEN COALESCE(row_data.card_exposure_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_buyer_count, 0)::NUMERIC / row_data.card_exposure_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_exposure_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_click_user_count, 0)::NUMERIC / row_data.card_exposure_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END,
  CASE WHEN COALESCE(row_data.card_click_user_count, 0) > 0
    THEN ROUND(COALESCE(row_data.card_buyer_count, 0)::NUMERIC / row_data.card_click_user_count::NUMERIC, 6)
    ELSE NULL::NUMERIC END
)`;

export const STAGE1_BACKUP_TABLE_SQL = `/* aios_qianchuan_card_ratio_stage1:backup_table */
CREATE TABLE IF NOT EXISTS ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} (
  backup_run_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  row_key JSONB NOT NULL,
  ratio_values JSONB NOT NULL,
  source_xmin TEXT NOT NULL,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  backed_up_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  source_probe_sha256 TEXT NOT NULL,
  CONSTRAINT pk_aios_goods_card_ratio_repair_backup
    PRIMARY KEY (backup_run_id, source_table, row_key),
  CONSTRAINT chk_aios_goods_card_ratio_repair_backup_source
    CHECK (source_table IN ('ads.douyin_trade_sale_card', 'ads.douyin_trade_sale_card_detail')),
  CONSTRAINT chk_aios_goods_card_ratio_repair_backup_sha
    CHECK (source_probe_sha256 ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE}
  IS 'Pinned pre-repair ratio values for the atomic goods-card Stage 1 canary and later rollback.'`;

export const STAGE1_BACKUP_TABLE_SHAPE_SQL = `/* aios_qianchuan_card_ratio_stage1:backup_shape */
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

export const STAGE1_EXISTING_BACKUP_RUN_SQL = `/* aios_qianchuan_card_ratio_stage1:existing_backup_run */
SELECT COUNT(*)::TEXT AS rows
FROM ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE}
WHERE backup_run_id = $1`;

export const STAGE1_MAIN_BACKUP_SQL = `/* aios_qianchuan_card_ratio_stage1:backup_main */
INSERT INTO ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} (
  backup_run_id,
  source_table,
  row_key,
  ratio_values,
  source_xmin,
  source_updated_at,
  source_probe_sha256
)
SELECT
  $1,
  'ads.douyin_trade_sale_card',
  jsonb_build_object(
    'shop_name', row_data.shop_name,
    'shop_id', row_data.shop_id,
    'date', row_data."date",
    'product_id', row_data.product_id
  ),
  jsonb_build_object(
    'card_click_rate_user', row_data.card_click_rate_user,
    'card_avg_click_per_user', row_data.card_avg_click_per_user,
    'new_customer_click_rate', row_data.new_customer_click_rate,
    'old_customer_click_rate', row_data.old_customer_click_rate,
    'card_avg_order_value', row_data.card_avg_order_value,
    'card_click_to_pay_rate_user', row_data.card_click_to_pay_rate_user,
    'first_buy_new_rate', row_data.first_buy_new_rate,
    'rebuy_old_rate', row_data.rebuy_old_rate,
    'card_exposure_to_pay_rate_user', row_data.card_exposure_to_pay_rate_user,
    'card_exposure_to_pay_rate_count', row_data.card_exposure_to_pay_rate_count,
    'card_gpm', row_data.card_gpm,
    'card_click_rate_count', row_data.card_click_rate_count,
    'card_click_to_pay_rate_count', row_data.card_click_to_pay_rate_count
  ),
  row_data.xmin::TEXT,
  row_data.updated_at,
  $2
FROM ads.douyin_trade_sale_card row_data
WHERE ${QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE}`;

export const STAGE1_DETAIL_BACKUP_SQL = `/* aios_qianchuan_card_ratio_stage1:backup_detail */
INSERT INTO ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} (
  backup_run_id,
  source_table,
  row_key,
  ratio_values,
  source_xmin,
  source_updated_at,
  source_probe_sha256
)
SELECT
  $1,
  'ads.douyin_trade_sale_card_detail',
  jsonb_build_object(
    'shop_id', row_data.shop_id,
    'stat_date', row_data.stat_date,
    'product_id', row_data.product_id,
    'source_level1', row_data.source_level1
  ),
  jsonb_build_object(
    'card_exposure_to_pay_rate_user', row_data.card_exposure_to_pay_rate_user,
    'card_click_rate_user', row_data.card_click_rate_user,
    'card_click_to_pay_rate_user', row_data.card_click_to_pay_rate_user
  ),
  row_data.xmin::TEXT,
  row_data.updated_at,
  $2
FROM ads.douyin_trade_sale_card_detail row_data
WHERE ${QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE}`;

export const STAGE1_BACKUP_COUNTS_SQL = `/* aios_qianchuan_card_ratio_stage1:backup_counts */
SELECT source_table, COUNT(*)::TEXT AS rows
FROM ${QIANCHUAN_CARD_RATIO_BACKUP_TABLE}
WHERE backup_run_id = $1
GROUP BY source_table
ORDER BY source_table`;

export const STAGE1_GUARD_CATALOG_SQL = `/* aios_qianchuan_card_ratio_stage1:guard_catalog */
SELECT
  COUNT(*) FILTER (WHERE routine.oid IS NOT NULL)::TEXT AS functions_present,
  (
    SELECT COUNT(*)::TEXT
    FROM pg_trigger trigger_record
    JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger_record.tgisinternal
      AND trigger_record.tgenabled = 'O'
      AND namespace.nspname = 'ads'
      AND (
        (relation.relname = 'douyin_trade_sale_card'
          AND trigger_record.tgname = 'trg_recompute_douyin_trade_sale_card_ratio_fields')
        OR
        (relation.relname = 'douyin_trade_sale_card_detail'
          AND trigger_record.tgname = 'trg_recompute_douyin_trade_sale_card_detail_ratio_fields')
      )
  ) AS enabled_triggers_present
FROM unnest(ARRAY[
  'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
  'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()'
]::TEXT[]) AS requested(signature)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)`;

export const STAGE1_CANARY_SNAPSHOT_SQL = `/* aios_qianchuan_card_ratio_stage1:canary_snapshot */
WITH main_formula AS (
  SELECT COUNT(*)::BIGINT AS formula_mismatch_rows
  FROM ads.douyin_trade_sale_card row_data
  WHERE row_data."date" = $1::DATE
    AND ${QIANCHUAN_CARD_RATIO_MAIN_MISMATCH_PREDICATE}
), main_parity AS (
  SELECT
    (SELECT COUNT(*) FROM ods.douyin_trade_sale_card_raw WHERE "date" = $1::DATE)::BIGINT AS source_rows,
    (SELECT COUNT(*) FROM ads.douyin_trade_sale_card WHERE "date" = $1::DATE)::BIGINT AS target_rows,
    COUNT(*) FILTER (WHERE source.source_present AND NOT COALESCE(target.target_present, FALSE))::BIGINT AS missing_target_rows,
    COUNT(*) FILTER (WHERE target.target_present AND NOT COALESCE(source.source_present, FALSE))::BIGINT AS extra_target_rows,
    COUNT(*) FILTER (WHERE source.source_present AND target.target_present AND (
      source.card_exposure_user_count IS DISTINCT FROM target.card_exposure_user_count OR
      source.card_click_user_count IS DISTINCT FROM target.card_click_user_count OR
      source.card_buyer_count IS DISTINCT FROM target.card_buyer_count OR
      source.card_order_count IS DISTINCT FROM target.card_order_count OR
      source.card_user_pay_amount IS DISTINCT FROM target.card_user_pay_amount
    ))::BIGINT AS base_metric_mismatch_rows
  FROM (
    SELECT row_data.*, TRUE AS source_present
    FROM ods.douyin_trade_sale_card_raw row_data
    WHERE row_data."date" = $1::DATE
  ) source
  FULL JOIN (
    SELECT row_data.*, TRUE AS target_present
    FROM ads.douyin_trade_sale_card row_data
    WHERE row_data."date" = $1::DATE
  ) target
    ON target.shop_name = source.shop_name
   AND target.shop_id = source.shop_id
   AND target."date" = source."date"
   AND target.product_id = source.product_id
), detail_formula AS (
  SELECT COUNT(*)::BIGINT AS formula_mismatch_rows
  FROM ads.douyin_trade_sale_card_detail row_data
  WHERE row_data.stat_date = $1::DATE
    AND ${QIANCHUAN_CARD_RATIO_DETAIL_MISMATCH_PREDICATE}
), detail_parity AS (
  SELECT
    (SELECT COUNT(*) FROM ods.douyin_trade_sale_card_detail_raw WHERE stat_date = $1::DATE)::BIGINT AS source_rows,
    (SELECT COUNT(*) FROM ads.douyin_trade_sale_card_detail WHERE stat_date = $1::DATE)::BIGINT AS target_rows,
    COUNT(*) FILTER (WHERE source.source_present AND NOT COALESCE(target.target_present, FALSE))::BIGINT AS missing_target_rows,
    COUNT(*) FILTER (WHERE target.target_present AND NOT COALESCE(source.source_present, FALSE))::BIGINT AS extra_target_rows,
    COUNT(*) FILTER (WHERE source.source_present AND target.target_present AND (
      source.card_exposure_user_count IS DISTINCT FROM target.card_exposure_user_count OR
      source.card_click_user_count IS DISTINCT FROM target.card_click_user_count OR
      source.card_buyer_count IS DISTINCT FROM target.card_buyer_count OR
      source.card_order_count IS DISTINCT FROM target.card_order_count OR
      source.card_user_pay_amount IS DISTINCT FROM target.card_user_pay_amount
    ))::BIGINT AS base_metric_mismatch_rows
  FROM (
    SELECT row_data.*, TRUE AS source_present
    FROM ods.douyin_trade_sale_card_detail_raw row_data
    WHERE row_data.stat_date = $1::DATE
  ) source
  FULL JOIN (
    SELECT row_data.*, TRUE AS target_present
    FROM ads.douyin_trade_sale_card_detail row_data
    WHERE row_data.stat_date = $1::DATE
  ) target
    ON target.shop_id = source.shop_id
   AND target.stat_date = source.stat_date
   AND target.product_id = source.product_id
   AND target.source_level1 = source.source_level1
)
SELECT
  'ads.douyin_trade_sale_card'::TEXT AS table_name,
  main_parity.source_rows::TEXT,
  main_parity.target_rows::TEXT,
  main_parity.missing_target_rows::TEXT,
  main_parity.extra_target_rows::TEXT,
  main_parity.base_metric_mismatch_rows::TEXT,
  main_formula.formula_mismatch_rows::TEXT
FROM main_parity CROSS JOIN main_formula
UNION ALL
SELECT
  'ads.douyin_trade_sale_card_detail',
  detail_parity.source_rows::TEXT,
  detail_parity.target_rows::TEXT,
  detail_parity.missing_target_rows::TEXT,
  detail_parity.extra_target_rows::TEXT,
  detail_parity.base_metric_mismatch_rows::TEXT,
  detail_formula.formula_mismatch_rows::TEXT
FROM detail_parity CROSS JOIN detail_formula
ORDER BY table_name`;

export const STAGE1_CALL_MAIN_REFRESH_SQL = `/* aios_qianchuan_card_ratio_stage1:refresh_main */
CALL ads.refresh_douyin_trade_sale_card($1::DATE, $1::DATE)`;

export const STAGE1_CALL_DETAIL_REFRESH_SQL = `/* aios_qianchuan_card_ratio_stage1:refresh_detail */
CALL ads.refresh_douyin_trade_sale_card_detail($1::DATE, $1::DATE)`;
