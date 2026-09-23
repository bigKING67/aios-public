DO $$
DECLARE
  v_missing INTEGER;
  v_entrypoint_definition TEXT;
  v_mapping_definition TEXT;
  v_unchecked_procedure REGPROCEDURE;
BEGIN
  IF to_regclass('ads.taobao_trade_sale_goods_daily') IS NULL THEN
    RAISE EXCEPTION 'table ads.taobao_trade_sale_goods_daily not found';
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM (
    SELECT shop_id, stat_date, product_id, COUNT(*) AS row_count
    FROM ads.taobao_trade_sale_goods_daily
    GROUP BY shop_id, stat_date, product_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'primary key uniqueness failed, duplicate groups: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM ads.taobao_trade_sale_goods_daily
  WHERE COALESCE(pay_amount, 0) < 0
     OR COALESCE(refund_amount, 0) < 0
     OR COALESCE(pay_buyer_count, 0) < 0
     OR COALESCE(product_visitor_count, 0) < 0;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'non-negative metric check failed, rows: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM ads.taobao_trade_sale_goods_daily
  WHERE etl_loaded_at IS NULL;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'etl_loaded_at null check failed, rows: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM (
    SELECT
      COALESCE(ods.column_name, ads.column_name) AS column_name,
      ods.data_type AS ods_data_type,
      ads.data_type AS ads_data_type,
      ods.udt_name AS ods_udt_name,
      ads.udt_name AS ads_udt_name
    FROM (
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'taobao_trade_sale_goods_raw'
    ) ods
    FULL OUTER JOIN (
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'taobao_trade_sale_goods_daily'
        AND column_name <> 'etl_loaded_at'
    ) ads USING (column_name)
    WHERE ods.column_name IS NULL
       OR ads.column_name IS NULL
       OR ods.data_type IS DISTINCT FROM ads.data_type
       OR ods.udt_name IS DISTINCT FROM ads.udt_name
  ) mismatched_columns;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'ODS/ADS business column contract mismatch, columns: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'taobao_trade_sale_goods_daily'
    AND column_name = 'etl_loaded_at'
    AND data_type = 'timestamp without time zone'
    AND is_nullable = 'NO';

  IF v_missing <> 1 THEN
    RAISE EXCEPTION 'ADS operational column contract mismatch';
  END IF;

  SELECT pg_get_functiondef(
    'ads.refresh_taobao_trade_sale_goods_daily(date,date)'::regprocedure
  )
  INTO v_entrypoint_definition;

  v_unchecked_procedure := to_regprocedure(
    'ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)'
  );
  v_mapping_definition := v_entrypoint_definition;

  IF v_unchecked_procedure IS NOT NULL THEN
    IF v_entrypoint_definition !~* 'assert_taobao_trade_sale_goods_daily_schema_contract'
       OR v_entrypoint_definition !~* 'refresh_taobao_trade_sale_goods_daily_unchecked' THEN
      RAISE EXCEPTION 'refresh wrapper does not assert before delegating';
    END IF;

    SELECT pg_get_functiondef(v_unchecked_procedure)
    INTO v_mapping_definition;
  END IF;

  IF v_mapping_definition ~* 'SELECT[[:space:]]+src\.\*' THEN
    RAISE EXCEPTION 'refresh procedure must not use SELECT src.*';
  END IF;

  IF v_mapping_definition !~* 'src\.crowd_ad_favorite_cart_cost' THEN
    RAISE EXCEPTION 'refresh procedure is missing crowd_ad_favorite_cart_cost mapping';
  END IF;

  RAISE NOTICE 'taobao_trade_sale_goods_daily checks passed';
END;
$$;
