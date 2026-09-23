BEGIN;

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_product_metrics_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_data_max_date DATE;
  v_effective_start DATE;
  v_effective_end DATE;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_goods_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_goods_raw does not exist';
  END IF;

  IF to_regclass('ads.taobao_trade_product_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_trade_product_metrics_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date)),
    MAX(stat_date)
  INTO v_start_date, v_end_date, v_data_max_date
  FROM ods.taobao_trade_sale_goods_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_trade_sale_goods_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  CREATE TEMP TABLE tmp_ads_taobao_trade_product_metrics_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_taobao_trade_product_metrics_week_new ON COMMIT DROP AS
  WITH taobao_scope AS (
    SELECT
      ws.week_period,
      ws.week_start,
      ws.week_end,
      'taobao'::VARCHAR(20) AS platform,
      COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date))::DATE AS as_of_date,
      COALESCE(
        p.observed_days,
        (COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date)) - ws.week_start + 1)::SMALLINT
      )::SMALLINT AS observed_days
    FROM tmp_ads_taobao_trade_product_metrics_week_scope ws
    JOIN ads.all_trade_week_platform p
      ON p.week_period = ws.week_period
    WHERE p.platform = 'taobao'
  ),
  product_agg AS (
    SELECT
      s.week_period,
      s.platform,
      s.as_of_date,
      s.observed_days,
      src.product_id,
      COALESCE(
        MAX(CASE
          WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date
            AND NULLIF(BTRIM(src.product_name), '') IS NOT NULL
            THEN src.product_name
        END),
        MAX(CASE
          WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7)
            AND NULLIF(BTRIM(src.product_name), '') IS NOT NULL
            THEN src.product_name
        END),
        '(未命名商品)'
      )::VARCHAR(500) AS product_name,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::NUMERIC(18, 2) AS curr_gmv,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::NUMERIC(18, 2) AS prev_gmv,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.pay_buyer_count, 0) ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.pay_buyer_count, 0) ELSE 0 END)::BIGINT AS prev_pay_buyer_count,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.product_visitor_count, 0) ELSE 0 END)::BIGINT AS curr_visitor_count,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.product_visitor_count, 0) ELSE 0 END)::BIGINT AS prev_visitor_count
    FROM taobao_scope s
    JOIN ods.taobao_trade_sale_goods_raw src
      ON src.stat_date BETWEEN (s.week_start - 7) AND s.as_of_date
    GROUP BY
      s.week_period,
      s.platform,
      s.as_of_date,
      s.observed_days,
      src.product_id
  ),
  enriched AS (
    SELECT
      p.week_period,
      p.platform,
      p.product_id,
      p.product_name,
      p.as_of_date,
      p.observed_days,
      p.curr_gmv,
      p.prev_gmv,
      (p.curr_gmv - p.prev_gmv)::NUMERIC(18, 2) AS gmv_delta,
      p.curr_pay_buyer_count,
      p.prev_pay_buyer_count,
      p.curr_visitor_count,
      p.prev_visitor_count,
      CASE
        WHEN p.curr_visitor_count > 0 THEN ROUND((p.curr_pay_buyer_count::NUMERIC / p.curr_visitor_count), 4)
        ELSE NULL
      END AS curr_pay_conversion_rate,
      CASE
        WHEN p.prev_visitor_count > 0 THEN ROUND((p.prev_pay_buyer_count::NUMERIC / p.prev_visitor_count), 4)
        ELSE NULL
      END AS prev_pay_conversion_rate,
      CASE
        WHEN p.curr_pay_buyer_count > 0 THEN ROUND((p.curr_gmv / p.curr_pay_buyer_count), 2)
        ELSE NULL
      END AS curr_avg_order_value,
      CASE
        WHEN p.prev_pay_buyer_count > 0 THEN ROUND((p.prev_gmv / p.prev_pay_buyer_count), 2)
        ELSE NULL
      END AS prev_avg_order_value
    FROM product_agg p
    WHERE
      p.curr_gmv <> 0
      OR p.prev_gmv <> 0
      OR p.curr_pay_buyer_count <> 0
      OR p.prev_pay_buyer_count <> 0
      OR p.curr_visitor_count <> 0
      OR p.prev_visitor_count <> 0
  )
  SELECT
    e.week_period,
    e.platform,
    e.product_id,
    e.product_name,
    e.as_of_date,
    e.observed_days,
    e.curr_gmv,
    e.prev_gmv,
    e.gmv_delta,
    e.curr_pay_buyer_count,
    e.prev_pay_buyer_count,
    e.curr_visitor_count,
    e.prev_visitor_count,
    e.curr_pay_conversion_rate,
    e.prev_pay_conversion_rate,
    e.curr_avg_order_value,
    e.prev_avg_order_value,
    CASE
      WHEN SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform) <> 0
        THEN ROUND((e.gmv_delta / SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform)), 4)
      ELSE NULL
    END AS gmv_delta_contribution_rate
  FROM enriched e;

  DELETE FROM ads.taobao_trade_product_metrics_week t
  USING tmp_ads_taobao_trade_product_metrics_week_scope ws
  WHERE t.week_period = ws.week_period
    AND t.platform = 'taobao';
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.taobao_trade_product_metrics_week (
    week_period,
    platform,
    product_id,
    product_name,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv,
    gmv_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    gmv_delta_contribution_rate
  )
  SELECT
    week_period,
    platform,
    product_id,
    product_name,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv,
    gmv_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    gmv_delta_contribution_rate
  FROM tmp_ads_taobao_trade_product_metrics_week_new;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_trade_product_metrics_week completed, inserted: %, deleted: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week(DATE, DATE)
IS '按周窗口刷新天猫商品周归因指标（GMV/成交人数/访客/转化率/客单价/增量贡献），并与 ads.all_trade_week_platform 同期口径对齐。';

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_product_metrics_week_incremental(
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

  INSERT INTO etl.taobao_trade_product_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.taobao_trade_product_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_goods_max_updated_at
  FROM ods.taobao_trade_sale_goods_raw;

  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_platform_max_updated_at
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao';

  v_source_max_updated_at := GREATEST(
    COALESCE(v_goods_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );

  IF p_init_watermark_only THEN
    UPDATE etl.taobao_trade_product_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    UPDATE etl.taobao_trade_product_metrics_week_refresh_state
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
  FROM ods.taobao_trade_sale_goods_raw
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
    > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT
    MIN(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')) - 13),
    MAX(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')))
  INTO v_platform_min_date, v_platform_max_date
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao'
    AND COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00')
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(stat_date) INTO v_fallback_end_date FROM ods.taobao_trade_sale_goods_raw;
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

  CALL ads.refresh_taobao_trade_product_metrics_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.taobao_trade_product_metrics_week_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按增量水位刷新 ADS 天猫商品周归因指标，支持仅初始化水位。';

COMMIT;
