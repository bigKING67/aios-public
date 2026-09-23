CREATE OR REPLACE FUNCTION ads.assert_taobao_trade_sale_goods_daily_schema_contract()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, information_schema, ads, ods, etl
AS $$
DECLARE
  v_mismatched_columns TEXT;
BEGIN
  IF to_regclass('ods.taobao_trade_sale_goods_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_goods_raw does not exist';
  END IF;

  IF to_regclass('ads.taobao_trade_sale_goods_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_trade_sale_goods_daily does not exist';
  END IF;

  SELECT string_agg(column_name, ', ' ORDER BY column_name)
  INTO v_mismatched_columns
  FROM (
    SELECT COALESCE(source.column_name, target.column_name) AS column_name
    FROM (
      SELECT
        column_name,
        data_type,
        udt_schema,
        udt_name,
        is_nullable,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'taobao_trade_sale_goods_raw'
    ) source
    FULL OUTER JOIN (
      SELECT
        column_name,
        data_type,
        udt_schema,
        udt_name,
        is_nullable,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'taobao_trade_sale_goods_daily'
        AND column_name <> 'etl_loaded_at'
    ) target USING (column_name)
    WHERE source.column_name IS NULL
       OR target.column_name IS NULL
       OR source.data_type IS DISTINCT FROM target.data_type
       OR source.udt_schema IS DISTINCT FROM target.udt_schema
       OR source.udt_name IS DISTINCT FROM target.udt_name
       OR source.is_nullable IS DISTINCT FROM target.is_nullable
       OR source.character_maximum_length IS DISTINCT FROM target.character_maximum_length
       OR source.numeric_precision IS DISTINCT FROM target.numeric_precision
       OR source.numeric_scale IS DISTINCT FROM target.numeric_scale
       OR source.datetime_precision IS DISTINCT FROM target.datetime_precision
  ) mismatches;

  IF v_mismatched_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'ODS/ADS business column contract mismatch: %',
      v_mismatched_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'etl_loaded_at'
      AND data_type = 'timestamp without time zone'
      AND udt_schema = 'pg_catalog'
      AND udt_name = 'timestamp'
      AND is_nullable = 'NO'
      AND lower(regexp_replace(COALESCE(column_default, ''), '[[:space:]]', '', 'g'))
        IN ('now()', 'current_timestamp')
  ) THEN
    RAISE EXCEPTION 'ADS operational column contract mismatch: etl_loaded_at';
  END IF;
END;
$$;

COMMENT ON FUNCTION ads.assert_taobao_trade_sale_goods_daily_schema_contract()
IS 'Fails closed when Taobao goods ODS/ADS business metadata or the ADS load timestamp contract drifts.';

ALTER PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(DATE, DATE)
  RENAME TO refresh_taobao_trade_sale_goods_daily_unchecked;

ALTER PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(INTEGER, BOOLEAN)
  RENAME TO refresh_taobao_trade_sale_goods_daily_incremental_unchecked;

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ads, ods, etl
AS $$
BEGIN
  PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
  CALL ads.refresh_taobao_trade_sale_goods_daily_unchecked(p_start_date, p_end_date);
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(DATE, DATE)
IS 'Validates the ODS/ADS schema contract before delegating to the full/window refresh implementation.';

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ads, ods, etl
AS $$
BEGIN
  PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
  CALL ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(
    p_fallback_window_days,
    p_init_watermark_only
  );
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(INTEGER, BOOLEAN)
IS 'Validates the ODS/ADS schema contract before watermark initialization, no-op checks, or incremental writes.';

REVOKE ALL
ON FUNCTION ads.assert_taobao_trade_sale_goods_daily_schema_contract()
FROM PUBLIC;

REVOKE ALL
ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_unchecked(DATE, DATE)
FROM PUBLIC;

REVOKE ALL
ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(INTEGER, BOOLEAN)
FROM PUBLIC;
