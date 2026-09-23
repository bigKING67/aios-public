BEGIN;

DO $$
DECLARE
  ddl TEXT;
BEGIN
  IF to_regprocedure('ads.refresh_all_trade_overview_platform(character varying, date, date)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_all_trade_overview_platform(character varying, date, date) is missing; apply 20260303_2300 first';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'carrier_type'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.carrier_type is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'promotion_period'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.promotion_period is missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('ads.refresh_all_trade_overview_platform(character varying, date, date)')) INTO ddl;

  IF ddl NOT LIKE '%''carrier_type''%' THEN
    ddl := replace(
      ddl,
      '''trade_refund_amount_refund_time''
      ]',
      '''trade_refund_amount_refund_time'',
        ''carrier_type'',
        ''promotion_period''
      ]'
    );
  END IF;

  IF ddl NOT LIKE '%src.carrier_type = ''全部''%'
     OR ddl NOT LIKE '%src.promotion_period = ''不限''%' THEN
    ddl := regexp_replace(
      ddl,
      'FROM ods\.douyin_trade_sale_raw src[[:space:]]+WHERE src\.stat_date BETWEEN p_start_date AND p_end_date',
      'FROM ods.douyin_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
        AND src.carrier_type = ''全部''
        AND src.promotion_period = ''不限'''
    );
  END IF;

  IF ddl NOT LIKE '%src.carrier_type = ''全部''%'
     OR ddl NOT LIKE '%src.promotion_period = ''不限''%' THEN
    RAISE EXCEPTION 'failed to patch ads.refresh_all_trade_overview_platform with douyin total-row filter';
  END IF;

  EXECUTE ddl;
END $$;

COMMENT ON PROCEDURE ads.refresh_all_trade_overview_platform(VARCHAR, DATE, DATE)
IS '按平台刷新经营总览 ADS；抖音来源 ods.douyin_trade_sale_raw 的 carrier_type=全部 且 promotion_period=不限 总计行。';

DO $$
DECLARE
  ddl TEXT;
BEGIN
  IF to_regprocedure('ads.refresh_report_douyin_trade_sale_metrics_week(date, date)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_report_douyin_trade_sale_metrics_week(date, date) is missing; apply 20260430_1200 first';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'carrier_type'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.carrier_type is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'promotion_period'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.promotion_period is missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('ads.refresh_report_douyin_trade_sale_metrics_week(date, date)')) INTO ddl;

  IF ddl NOT LIKE '%src.carrier_type = ''全部''%'
     OR ddl NOT LIKE '%src.promotion_period = ''不限''%' THEN
    ddl := regexp_replace(
      ddl,
      'FROM ods\.douyin_trade_sale_raw src[[:space:]]+WHERE src\.stat_date BETWEEN \(v_start_date - 13\) AND v_end_date',
      'FROM ods.douyin_trade_sale_raw src
  WHERE src.stat_date BETWEEN (v_start_date - 13) AND v_end_date
    AND src.carrier_type = ''全部''
    AND src.promotion_period = ''不限'''
    );
  END IF;

  IF ddl NOT LIKE '%src.carrier_type = ''全部''%'
     OR ddl NOT LIKE '%src.promotion_period = ''不限''%' THEN
    RAISE EXCEPTION 'failed to patch ads.refresh_report_douyin_trade_sale_metrics_week with douyin total-row filter';
  END IF;

  EXECUTE ddl;
END $$;

COMMENT ON PROCEDURE ads.refresh_report_douyin_trade_sale_metrics_week(DATE, DATE)
IS '按周窗口刷新 report 抖音交易周指标表；来源 ods.douyin_trade_sale_raw 的 carrier_type=全部 且 promotion_period=不限 总计行；trade_refund_amount_* 来源兼容生产 ODS 的 refund_amount_* 字段。';

COMMIT;
