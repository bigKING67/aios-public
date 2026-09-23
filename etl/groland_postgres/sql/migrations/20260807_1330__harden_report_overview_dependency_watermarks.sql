BEGIN;

DO $$
BEGIN
  IF to_regclass('etl.all_trade_overview_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.all_trade_overview_refresh_state does not exist';
  END IF;

  IF to_regclass('etl.report_all_trade_week_platform_metrics_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.report_all_trade_week_platform_metrics_refresh_state does not exist';
  END IF;

  IF to_regclass('etl.report_douyin_trade_sale_metrics_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.report_douyin_trade_sale_metrics_week_refresh_state does not exist';
  END IF;

  IF to_regprocedure('ads.refresh_report_all_trade_week_platform_metrics(date,date)') IS NULL THEN
    RAISE EXCEPTION 'base procedure ads.refresh_report_all_trade_week_platform_metrics(date,date) does not exist';
  END IF;

  IF to_regprocedure('ads.refresh_report_douyin_trade_sale_metrics_week(date,date)') IS NULL THEN
    RAISE EXCEPTION 'base procedure ads.refresh_report_douyin_trade_sale_metrics_week(date,date) does not exist';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION etl.assert_all_trade_overview_source_ready(
  p_platform VARCHAR,
  p_source_updated_at TIMESTAMP WITHOUT TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_overview_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
BEGIN
  IF p_platform NOT IN ('douyin', 'jd', 'taobao', 'wx', 'xhs') THEN
    RAISE EXCEPTION 'unsupported all_trade_overview platform: %', p_platform;
  END IF;

  IF p_source_updated_at IS NULL THEN
    RETURN;
  END IF;

  SELECT last_ods_updated_at
  INTO v_overview_source_updated_at
  FROM etl.all_trade_overview_refresh_state
  WHERE platform = p_platform;

  IF NOT FOUND OR v_overview_source_updated_at IS NULL THEN
    RAISE EXCEPTION 'all_trade_overview readiness state is missing for platform %', p_platform
      USING ERRCODE = '55000';
  END IF;

  IF v_overview_source_updated_at < p_source_updated_at THEN
    RAISE EXCEPTION
      'all_trade_overview is stale for platform %: consumed ODS watermark %, current ODS watermark %',
      p_platform,
      v_overview_source_updated_at,
      p_source_updated_at
      USING
        ERRCODE = '55000',
        HINT = 'Wait for ads-01-overview-daily-inc to complete; the Prefect task will retry.';
  END IF;
END;
$$;

COMMENT ON FUNCTION etl.assert_all_trade_overview_source_ready(VARCHAR, TIMESTAMP WITHOUT TIME ZONE)
IS '下游 report 刷新前校验指定平台 ODS 最新水位已被 ads.all_trade_overview 消费；未就绪时失败并交由 Prefect 重试。';

ALTER TABLE etl.report_all_trade_week_platform_metrics_refresh_state
  ADD COLUMN IF NOT EXISTS last_trade_updated_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_cost_updated_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_platform_updated_at TIMESTAMP WITHOUT TIME ZONE;

COMMENT ON COLUMN etl.report_all_trade_week_platform_metrics_refresh_state.last_trade_updated_at
IS '最近一次已处理的 ods.taobao_trade_sale_raw 更新时间水位。';
COMMENT ON COLUMN etl.report_all_trade_week_platform_metrics_refresh_state.last_cost_updated_at
IS '最近一次已处理的万相台场景消耗来源更新时间水位。';
COMMENT ON COLUMN etl.report_all_trade_week_platform_metrics_refresh_state.last_platform_updated_at
IS '最近一次已处理的 ads.report_all_trade_week_platform 更新时间水位。';

CREATE OR REPLACE PROCEDURE ads.refresh_report_all_trade_week_platform_metrics_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_trade_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_cost_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_platform_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_trade_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_cost_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_platform_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;

  v_trade_min_date DATE;
  v_trade_max_date DATE;
  v_cost_min_date DATE;
  v_cost_max_date DATE;
  v_platform_min_date DATE;
  v_platform_max_date DATE;
  v_trade_source_max_date DATE;
  v_cost_source_max_date DATE;
  v_platform_source_max_date DATE;

  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('ads.report_all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.report_all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_raw does not exist';
  END IF;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NULL
     AND to_regclass('ods.taobao_one_alimama_goods_marketingscenario') IS NULL THEN
    RAISE EXCEPTION 'cost source table missing: ods.taobao_one_alimama_marketingscenario / ods.taobao_one_alimama_goods_marketingscenario';
  END IF;

  IF to_regclass('ads.report_all_trade_week_platform_metrics') IS NULL THEN
    RAISE EXCEPTION 'target table ads.report_all_trade_week_platform_metrics does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ads.refresh_report_all_trade_week_platform_metrics_incremental'));

  INSERT INTO etl.report_all_trade_week_platform_metrics_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    last_trade_updated_at,
    last_cost_updated_at,
    last_platform_updated_at
  INTO
    v_last_trade_updated_at,
    v_last_cost_updated_at,
    v_last_platform_updated_at
  FROM etl.report_all_trade_week_platform_metrics_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')),
    MAX(stat_date)
  INTO v_trade_max_updated_at, v_trade_source_max_date
  FROM ods.taobao_trade_sale_raw;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NOT NULL THEN
    SELECT
      MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')),
      MAX(stat_date)
    INTO v_cost_max_updated_at, v_cost_source_max_date
    FROM ods.taobao_one_alimama_marketingscenario;
  ELSE
    SELECT
      MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')),
      MAX(stat_date)
    INTO v_cost_max_updated_at, v_cost_source_max_date
    FROM ods.taobao_one_alimama_goods_marketingscenario;
  END IF;

  SELECT
    MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00')),
    MAX(as_of_date)
  INTO v_platform_max_updated_at, v_platform_source_max_date
  FROM ads.report_all_trade_week_platform
  WHERE platform = 'taobao';

  PERFORM etl.assert_all_trade_overview_source_ready('taobao', v_trade_max_updated_at);

  v_source_max_updated_at := GREATEST(
    COALESCE(v_trade_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_cost_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );
  IF p_init_watermark_only THEN
    UPDATE etl.report_all_trade_week_platform_metrics_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_trade_updated_at = COALESCE(v_trade_max_updated_at, last_trade_updated_at),
      last_cost_updated_at = COALESCE(v_cost_max_updated_at, last_cost_updated_at),
      last_platform_updated_at = COALESCE(v_platform_max_updated_at, last_platform_updated_at),
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE
      'init watermark completed, trade %, cost %, platform %',
      v_trade_max_updated_at,
      v_cost_max_updated_at,
      v_platform_max_updated_at;
    RETURN;
  END IF;

  SELECT MIN(stat_date), MAX(stat_date)
  INTO v_trade_min_date, v_trade_max_date
  FROM ods.taobao_trade_sale_raw
  WHERE v_last_trade_updated_at IS NULL
     OR COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
        > v_last_trade_updated_at;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NOT NULL THEN
    SELECT MIN(stat_date), MAX(stat_date)
    INTO v_cost_min_date, v_cost_max_date
    FROM ods.taobao_one_alimama_marketingscenario
    WHERE v_last_cost_updated_at IS NULL
       OR COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
          > v_last_cost_updated_at;
  ELSE
    SELECT MIN(stat_date), MAX(stat_date)
    INTO v_cost_min_date, v_cost_max_date
    FROM ods.taobao_one_alimama_goods_marketingscenario
    WHERE v_last_cost_updated_at IS NULL
       OR COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
          > v_last_cost_updated_at;
  END IF;

  SELECT
    MIN(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')) - 13),
    MAX(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')))
  INTO v_platform_min_date, v_platform_max_date
  FROM ads.report_all_trade_week_platform
  WHERE platform = 'taobao'
    AND (
      v_last_platform_updated_at IS NULL
      OR COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00')
         > v_last_platform_updated_at
    );

  v_fallback_end_date := GREATEST(
    COALESCE(v_trade_source_max_date, DATE '1970-01-01'),
    COALESCE(v_cost_source_max_date, DATE '1970-01-01'),
    COALESCE(v_platform_source_max_date, DATE '1970-01-01')
  );
  IF v_fallback_end_date = DATE '1970-01-01' THEN
    v_fallback_end_date := CURRENT_DATE;
  END IF;
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_trade_min_date, v_fallback_start_date),
    COALESCE(v_cost_min_date, v_fallback_start_date),
    COALESCE(v_platform_min_date, v_fallback_start_date),
    v_fallback_start_date
  );
  v_refresh_end_date := GREATEST(
    COALESCE(v_trade_max_date, v_fallback_end_date),
    COALESCE(v_cost_max_date, v_fallback_end_date),
    COALESCE(v_platform_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  CALL ads.refresh_report_all_trade_week_platform_metrics(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.report_all_trade_week_platform_metrics_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_trade_updated_at = COALESCE(v_trade_max_updated_at, last_trade_updated_at),
    last_cost_updated_at = COALESCE(v_cost_max_updated_at, last_cost_updated_at),
    last_platform_updated_at = COALESCE(v_platform_max_updated_at, last_platform_updated_at),
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, window [% - %], trade watermark %, cost watermark %, platform watermark %',
    v_refresh_start_date,
    v_refresh_end_date,
    v_trade_max_updated_at,
    v_cost_max_updated_at,
    v_platform_max_updated_at;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_report_all_trade_week_platform_metrics_incremental(INTEGER, BOOLEAN)
IS '按独立来源水位刷新 report 平台扩展指标；先校验天猫 ODS 已被 all_trade_overview 消费，并始终重算回看窗口。';

CREATE OR REPLACE PROCEDURE ads.refresh_report_douyin_trade_sale_metrics_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER := GREATEST(COALESCE(p_fallback_window_days, 14), 1);
  v_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_date DATE;
  v_refresh_start DATE;
  v_refresh_end DATE;
BEGIN
  IF to_regclass('etl.report_douyin_trade_sale_metrics_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.report_douyin_trade_sale_metrics_week_refresh_state does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ads.refresh_report_douyin_trade_sale_metrics_week_incremental'));

  INSERT INTO etl.report_douyin_trade_sale_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  PERFORM 1
  FROM etl.report_douyin_trade_sale_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')),
    MAX(stat_date)
  INTO v_source_updated_at, v_source_max_date
  FROM ods.douyin_trade_sale_raw;

  PERFORM etl.assert_all_trade_overview_source_ready('douyin', v_source_updated_at);

  IF p_init_watermark_only THEN
    UPDATE etl.report_douyin_trade_sale_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;

    RAISE NOTICE
      'refresh_report_douyin_trade_sale_metrics_week_incremental watermark initialized, source_updated_at: %',
      v_source_updated_at;
    RETURN;
  END IF;

  IF v_source_max_date IS NULL THEN
    RAISE NOTICE 'refresh_report_douyin_trade_sale_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_report_douyin_trade_sale_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.report_douyin_trade_sale_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;

  RAISE NOTICE
    'refresh_report_douyin_trade_sale_metrics_week_incremental completed, source_updated_at: %, window: [% - %]',
    v_source_updated_at,
    v_refresh_start,
    v_refresh_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_report_douyin_trade_sale_metrics_week_incremental(INTEGER, BOOLEAN)
IS '重算抖音周经营回看窗口；刷新前要求 douyin ODS 最新水位已被 ads.all_trade_overview 消费。';

COMMIT;
