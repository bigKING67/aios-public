DO $$
DECLARE
  v_full_wrapper TEXT;
  v_incremental_wrapper TEXT;
BEGIN
  IF to_regprocedure('ads.assert_taobao_trade_sale_goods_daily_schema_contract()') IS NULL THEN
    RAISE EXCEPTION 'Taobao goods schema assertion function is missing';
  END IF;

  IF to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)') IS NULL
     OR to_regprocedure(
       'ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(integer,boolean)'
     ) IS NULL THEN
    RAISE EXCEPTION 'Taobao goods internal refresh implementations are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    WHERE procedure.oid IN (
      'ads.assert_taobao_trade_sale_goods_daily_schema_contract()'::regprocedure,
      'ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)'::regprocedure,
      'ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(integer,boolean)'::regprocedure
    )
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Taobao goods internal schema/refresh entrypoints remain PUBLIC executable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid IN (
      'ads.refresh_taobao_trade_sale_goods_daily(date,date)'::regprocedure,
      'ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)'::regprocedure
    )
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'Taobao goods guarded wrappers are not SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef(
    'ads.refresh_taobao_trade_sale_goods_daily(date,date)'::regprocedure
  )
  INTO v_full_wrapper;

  SELECT pg_get_functiondef(
    'ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)'::regprocedure
  )
  INTO v_incremental_wrapper;

  IF position(
    'assert_taobao_trade_sale_goods_daily_schema_contract' IN v_full_wrapper
  ) = 0 OR position(
    'assert_taobao_trade_sale_goods_daily_schema_contract' IN v_full_wrapper
  ) > position(
    'refresh_taobao_trade_sale_goods_daily_unchecked' IN v_full_wrapper
  ) THEN
    RAISE EXCEPTION 'Taobao goods full refresh wrapper does not assert before delegating';
  END IF;

  IF position(
    'assert_taobao_trade_sale_goods_daily_schema_contract' IN v_incremental_wrapper
  ) = 0 OR position(
    'assert_taobao_trade_sale_goods_daily_schema_contract' IN v_incremental_wrapper
  ) > position(
    'refresh_taobao_trade_sale_goods_daily_incremental_unchecked' IN v_incremental_wrapper
  ) THEN
    RAISE EXCEPTION 'Taobao goods incremental wrapper does not assert before delegating';
  END IF;

  PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
  RAISE NOTICE 'Taobao goods runtime schema contract checks passed';
END;
$$;
