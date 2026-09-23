DO $$
DECLARE
  v_missing_columns TEXT[];
  v_platform_definition TEXT;
  v_douyin_definition TEXT;
BEGIN
  IF to_regprocedure(
    'etl.assert_all_trade_overview_source_ready(character varying,timestamp without time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION 'missing overview readiness function';
  END IF;

  SELECT ARRAY_AGG(required.column_name ORDER BY required.column_name)
  INTO v_missing_columns
  FROM (
    VALUES
      ('last_trade_updated_at'),
      ('last_cost_updated_at'),
      ('last_platform_updated_at')
  ) AS required(column_name)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'etl'
   AND actual.table_name = 'report_all_trade_week_platform_metrics_refresh_state'
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'missing report platform source checkpoints: %', v_missing_columns;
  END IF;

  SELECT pg_get_functiondef(
    'ads.refresh_report_all_trade_week_platform_metrics_incremental(integer,boolean)'::regprocedure
  ) INTO v_platform_definition;
  SELECT pg_get_functiondef(
    'ads.refresh_report_douyin_trade_sale_metrics_week_incremental(integer,boolean)'::regprocedure
  ) INTO v_douyin_definition;

  IF v_platform_definition NOT LIKE '%assert_all_trade_overview_source_ready(''taobao''%'
     OR v_platform_definition NOT LIKE '%last_trade_updated_at%'
     OR v_platform_definition NOT LIKE '%last_cost_updated_at%'
     OR v_platform_definition NOT LIKE '%last_platform_updated_at%' THEN
    RAISE EXCEPTION 'report platform dependency or per-source watermark contract is missing';
  END IF;

  IF v_douyin_definition NOT LIKE '%assert_all_trade_overview_source_ready(''douyin''%' THEN
    RAISE EXCEPTION 'douyin report overview dependency contract is missing';
  END IF;

  RAISE NOTICE 'report overview dependency checks passed';
END;
$$;
