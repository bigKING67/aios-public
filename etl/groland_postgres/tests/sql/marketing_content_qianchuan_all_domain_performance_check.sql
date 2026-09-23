-- 千川全域素材表现链路迁移健康检查
-- 用法：
-- psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f tests/sql/marketing_content_qianchuan_all_domain_performance_check.sql

DO $$
DECLARE
  v_missing_count INTEGER;
  v_function_body TEXT;
BEGIN
  WITH required_tables AS (
    SELECT *
    FROM (
      VALUES
        ('dwd', 'marketing_content_qianchuan_material_performance_di'),
        ('dws', 'marketing_content_qianchuan_live_room_acceptance_di'),
        ('dws', 'marketing_content_qianchuan_material_summary'),
        ('dws', 'marketing_content_asset_qianchuan_summary'),
        ('ads', 'marketing_content_asset_video_understanding_jobs'),
        ('ads', 'marketing_content_asset_video_understanding_results'),
        ('ods', 'douyin_qianchuan_shortvideo_raw'),
        ('ods', 'douyin_qianchuan_live_video_raw'),
        ('ods', 'douyin_trade_sale_live_raw')
    ) AS t(table_schema, table_name)
  )
  SELECT COUNT(*)
  INTO v_missing_count
  FROM required_tables t
  LEFT JOIN information_schema.tables tbl
    ON tbl.table_schema = t.table_schema
   AND tbl.table_name = t.table_name
  WHERE tbl.table_name IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'qianchuan all-domain required table missing count: %', v_missing_count;
  END IF;

  WITH required_columns AS (
    SELECT *
    FROM (
      VALUES
        ('ads', 'marketing_content_ad_materials', 'delivery_mode'),
        ('ads', 'marketing_content_ad_materials', 'objective'),
        ('ads', 'marketing_content_ad_materials', 'objective_source'),
        ('ads', 'marketing_content_ad_materials', 'performance_source_table'),
        ('ads', 'marketing_content_ad_materials', 'last_performance_seen_at'),
        ('ads', 'marketing_content_ad_materials', 'data_quality_status'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'delivery_mode'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'objective'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'source_table'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'overall_cost'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'net_gmv'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'boost_cost'),
        ('dwd', 'marketing_content_qianchuan_material_performance_di', 'boost_net_gmv'),
        ('dws', 'marketing_content_qianchuan_material_summary', 'latest_metrics'),
        ('dws', 'marketing_content_qianchuan_material_summary', 'latest_live_acceptance_status'),
        ('dws', 'marketing_content_asset_qianchuan_summary', 'material_count'),
        ('dws', 'marketing_content_asset_qianchuan_summary', 'objective_breakdown'),
        ('dws', 'marketing_content_asset_qianchuan_summary', 'material_ids'),
        ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'acceptance_quality_status'),
        ('ads', 'marketing_content_asset_video_understanding_jobs', 'analysis_schema_version'),
        ('ads', 'marketing_content_asset_video_understanding_results', 'input_snapshot_hash'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'douyin_account_display_id'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'live_room_name'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_roi_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_amount_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_count_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_cost_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_gmv_settlement_rate_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_order_settlement_rate_14d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_roi_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_amount_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_count_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_cost_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_gmv_settlement_rate_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_order_settlement_rate_30d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_roi_90d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_amount_90d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_count_90d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_settlement_order_cost_90d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_gmv_settlement_rate_90d'),
        ('ods', 'douyin_qianchuan_live_video_raw', 'boost_order_settlement_rate_90d')
    ) AS t(table_schema, table_name, column_name)
  )
  SELECT COUNT(*)
  INTO v_missing_count
  FROM required_columns c
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = c.table_schema
   AND actual.table_name = c.table_name
   AND actual.column_name = c.column_name
  WHERE actual.column_name IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'qianchuan all-domain required column missing count: %', v_missing_count;
  END IF;

  IF to_regprocedure('ads.refresh_marketing_content_qianchuan_all_domain_performance(uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'refresh_marketing_content_qianchuan_all_domain_performance(uuid,date,date) not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'dwd'
      AND rel.relname = 'marketing_content_qianchuan_material_performance_di'
      AND con.contype = 'p'
      AND pg_get_constraintdef(con.oid) = 'PRIMARY KEY (material_id, stat_date)'
  ) THEN
    RAISE EXCEPTION 'material performance primary key must stay material_id + stat_date';
  END IF;

  SELECT pg_get_functiondef('ads.refresh_marketing_content_qianchuan_all_domain_performance(uuid,date,date)'::regprocedure)
  INTO v_function_body;

  IF POSITION('boost metrics are explanatory only; do not add to overall metrics' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'refresh function is missing boost/overall policy marker';
  END IF;

  IF POSITION('ROW_NUMBER() OVER' IN v_function_body) = 0
    OR POSITION('material_date_rank = 1' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'product source refresh must dedupe duplicate material/date rows before upsert';
  END IF;

  IF POSITION('flagged_conflicts AS' IN v_function_body) = 0
    OR POSITION('crossSourceConflict' IN v_function_body) = 0
    OR POSITION('WHERE dwd.marketing_content_qianchuan_material_performance_di.objective = EXCLUDED.objective' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'cross-source conflicts must be flagged without replacing the primary objective/source row';
  END IF;

  IF POSITION('ON CONFLICT (material_id) DO UPDATE' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'material summary refresh must be idempotent across repeated fixture runs';
  END IF;

  IF POSITION('dws.marketing_content_asset_qianchuan_summary' IN v_function_body) = 0
    OR POSITION('ON CONFLICT (asset_id) DO UPDATE' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'asset qianchuan summary refresh must be idempotent at asset_id grain';
  END IF;

  IF POSITION('ods.douyin_qianchuan_shortvideo_raw' IN v_function_body) = 0
    OR POSITION('product_all_domain_shortvideo' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'refresh function is missing product all-domain source/objective mapping';
  END IF;

  IF POSITION('ods.douyin_qianchuan_live_video_raw' IN v_function_body) = 0
    OR POSITION('live_all_domain_shortvideo' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'refresh function is missing live all-domain source/objective mapping';
  END IF;

  IF POSITION('dws.marketing_content_qianchuan_live_room_acceptance_di' IN v_function_body) = 0 THEN
    RAISE EXCEPTION 'refresh function is missing account/date live acceptance rollup';
  END IF;

  RAISE NOTICE 'qianchuan all-domain material performance checks passed';
END;
$$;
