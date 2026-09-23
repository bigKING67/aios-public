BEGIN;

COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.product_name
IS '商品名称（按 product_id 取全局最新非空标题；若最新为空则回退最近非空）。';

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
  latest_product_name AS (
    SELECT
      p.week_period,
      p.platform,
      p.as_of_date,
      p.observed_days,
      p.product_id,
      COALESCE(latest_non_empty.product_name, '(未命名商品)')::VARCHAR(500) AS product_name
    FROM product_agg p
    LEFT JOIN LATERAL (
      SELECT src_latest.product_name
      FROM ods.taobao_trade_sale_goods_raw src_latest
      WHERE src_latest.product_id = p.product_id
        AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
      ORDER BY
        src_latest.stat_date DESC,
        COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
      LIMIT 1
    ) AS latest_non_empty ON TRUE
  ),
  enriched AS (
    SELECT
      p.week_period,
      p.platform,
      p.product_id,
      lpn.product_name,
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
    LEFT JOIN latest_product_name lpn
      ON lpn.week_period = p.week_period
     AND lpn.platform = p.platform
     AND lpn.as_of_date = p.as_of_date
     AND lpn.observed_days = p.observed_days
     AND lpn.product_id = p.product_id
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
IS '按周窗口刷新天猫商品周归因指标，并将 product_name 统一为按 product_id 的全局最新非空标题。';

COMMIT;
