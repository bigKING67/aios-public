BEGIN;

-- 20260430 的 report 数据模型迁移把周报过程统一改名为 refresh_report_*。
-- 这里修复由 pg_get_functiondef + replace 迁移留下的过程体旧调用，避免继续调用已删除的旧 refresh_* 过程。
DO $$
DECLARE
  rec RECORD;
  ddl TEXT;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        (
          'ads.refresh_report_all_trade_week_platform_metrics_incremental(integer, boolean)',
          'CALL ads.refresh_all_trade_week_platform_metrics(',
          'CALL ads.refresh_report_all_trade_week_platform_metrics('
        ),
        (
          'ads.refresh_report_douyin_trade_sale_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_douyin_trade_sale_metrics_week(',
          'CALL ads.refresh_report_douyin_trade_sale_metrics_week('
        ),
        (
          'ads.refresh_report_douyin_trade_sale_channel_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_douyin_trade_sale_channel_metrics_week(',
          'CALL ads.refresh_report_douyin_trade_sale_channel_metrics_week('
        ),
        (
          'ads.refresh_report_douyin_trade_sale_live_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_douyin_trade_sale_live_metrics_week(',
          'CALL ads.refresh_report_douyin_trade_sale_live_metrics_week('
        ),
        (
          'ads.refresh_report_douyin_trade_sale_shortvideo_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_douyin_trade_sale_shortvideo_metrics_week(',
          'CALL ads.refresh_report_douyin_trade_sale_shortvideo_metrics_week('
        ),
        (
          'ads.refresh_report_douyin_trade_sale_card_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_douyin_trade_sale_card_metrics_week(',
          'CALL ads.refresh_report_douyin_trade_sale_card_metrics_week('
        ),
        (
          'ads.refresh_report_taobao_trade_product_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_taobao_trade_product_metrics_week(',
          'CALL ads.refresh_report_taobao_trade_product_metrics_week('
        ),
        (
          'ads.refresh_report_taobao_goods_traffic_channel_metrics_week_incremental(integer, boolean)',
          'CALL ads.refresh_taobao_goods_traffic_channel_metrics_week(',
          'CALL ads.refresh_report_taobao_goods_traffic_channel_metrics_week('
        )
    ) AS t(signature, old_call, new_call)
  LOOP
    IF to_regprocedure(rec.signature) IS NULL THEN
      RAISE NOTICE 'skip missing report incremental procedure: %', rec.signature;
      CONTINUE;
    END IF;

    SELECT pg_get_functiondef(to_regprocedure(rec.signature)) INTO ddl;
    ddl := replace(ddl, rec.old_call, rec.new_call);
    EXECUTE ddl;

    RAISE NOTICE 'repaired report incremental procedure body: %', rec.signature;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('ads.report_taobao_one_goods_traffic_channel_metric_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.report_taobao_one_goods_traffic_channel_metric_week is missing; apply 20260430_1200 first';
  END IF;

  IF to_regclass('etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state is missing; apply 20260430_1200 first';
  END IF;

  IF to_regprocedure('ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(date, date)') IS NULL THEN
    RAISE EXCEPTION 'base procedure ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(date, date) is missing; apply 20260430_1200 first';
  END IF;
END $$;

CREATE OR REPLACE PROCEDURE ads.refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_goods_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_platform_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_goods_min_date DATE;
  v_goods_max_date DATE;
  v_platform_min_date DATE;
  v_platform_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_goods_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_platform_max_updated_at
  FROM ads.report_all_trade_week_platform
  WHERE platform = 'taobao';

  v_source_max_updated_at := GREATEST(
    COALESCE(v_goods_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );

  IF p_init_watermark_only THEN
    UPDATE etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    UPDATE etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state
    SET
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'incremental refresh skipped, no upstream changes (last=%)', v_last_source_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date)
  INTO v_goods_min_date, v_goods_max_date
  FROM ods.taobao_one_alimama_goods_marketingscenario
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
    > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT
    MIN(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')) - 13),
    MAX(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')))
  INTO v_platform_min_date, v_platform_max_date
  FROM ads.report_all_trade_week_platform
  WHERE platform = 'taobao'
    AND COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00')
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(stat_date) INTO v_fallback_end_date FROM ods.taobao_one_alimama_goods_marketingscenario;
  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_goods_min_date, v_fallback_start_date),
    COALESCE(v_platform_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_goods_max_date, v_fallback_end_date),
    COALESCE(v_platform_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental(INTEGER, BOOLEAN)
IS '按增量水位刷新 report 淘宝万相台商品流量渠道周漏斗指标，支持仅初始化水位。';

COMMIT;
