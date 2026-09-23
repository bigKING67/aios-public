BEGIN;

COMMENT ON COLUMN ads.taobao_goods_traffic_channel_metrics_week.traffic_channel IS '流量渠道枚举（搜索/推荐/关键词推广/人群推广/场景推广）。';

ALTER TABLE ads.taobao_goods_traffic_channel_metrics_week
  DROP CONSTRAINT IF EXISTS chk_taobao_goods_traffic_channel_metrics_week_channel;

UPDATE ads.taobao_goods_traffic_channel_metrics_week
SET traffic_channel = CASE traffic_channel
  WHEN 'search' THEN '搜索'
  WHEN 'recommend' THEN '推荐'
  WHEN 'keyword_ad' THEN '关键词推广'
  WHEN 'crowd_ad' THEN '人群推广'
  WHEN 'scene_ad' THEN '场景推广'
  ELSE traffic_channel
END
WHERE traffic_channel IN ('search', 'recommend', 'keyword_ad', 'crowd_ad', 'scene_ad');

ALTER TABLE ads.taobao_goods_traffic_channel_metrics_week
  ADD CONSTRAINT chk_taobao_goods_traffic_channel_metrics_week_channel CHECK (
    traffic_channel IN ('搜索', '推荐', '关键词推广', '人群推广', '场景推广')
  );

COMMENT ON CONSTRAINT chk_taobao_goods_traffic_channel_metrics_week_channel
  ON ads.taobao_goods_traffic_channel_metrics_week IS '流量渠道枚举约束（中文渠道值）。';

DROP PROCEDURE IF EXISTS ads.refresh_taobao_goods_traffic_channel_metrics_week(DATE, DATE);

CREATE PROCEDURE ads.refresh_taobao_goods_traffic_channel_metrics_week(
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

  IF to_regclass('dwd.taobao_goods_sale_traffic') IS NULL THEN
    RAISE EXCEPTION 'source table dwd.taobao_goods_sale_traffic does not exist';
  END IF;

  IF to_regclass('ads.taobao_goods_traffic_channel_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_goods_traffic_channel_metrics_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date)),
    MAX(stat_date)
  INTO v_start_date, v_end_date, v_data_max_date
  FROM dwd.taobao_goods_sale_traffic;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dwd.taobao_goods_sale_traffic has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  CREATE TEMP TABLE tmp_ads_taobao_goods_traffic_channel_metrics_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_taobao_goods_traffic_channel_metrics_week_new ON COMMIT DROP AS
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
    FROM tmp_ads_taobao_goods_traffic_channel_metrics_week_scope ws
    JOIN ads.all_trade_week_platform p
      ON p.week_period = ws.week_period
    WHERE p.platform = 'taobao'
  ),
  channel_daily AS (
    SELECT
      s.week_period,
      s.platform,
      s.week_start,
      s.week_end,
      s.as_of_date,
      s.observed_days,
      src.product_id,
      src.stat_date,
      COALESCE(NULLIF(BTRIM(src.product_name), ''), '(未命名商品)')::VARCHAR(500) AS product_name,
      channel.traffic_channel,
      channel.pay_amount,
      channel.pay_buyer_count,
      channel.visitor_count,
      channel.cart_buyer_count
    FROM taobao_scope s
    JOIN dwd.taobao_goods_sale_traffic src
      ON src.stat_date BETWEEN (s.week_start - 7) AND s.as_of_date
    CROSS JOIN LATERAL (
      VALUES
        ('搜索'::VARCHAR(50), COALESCE(src.search_pay_amount, 0)::NUMERIC(18, 2), COALESCE(src.search_pay_buyer_count, 0)::BIGINT, COALESCE(src.search_visitor_count, 0)::BIGINT, COALESCE(src.search_cart_buyer_count, 0)::BIGINT),
        ('推荐'::VARCHAR(50), COALESCE(src.recommend_pay_amount, 0)::NUMERIC(18, 2), COALESCE(src.recommend_pay_buyer_count, 0)::BIGINT, COALESCE(src.recommend_visitor_count, 0)::BIGINT, COALESCE(src.recommend_cart_buyer_count, 0)::BIGINT),
        ('关键词推广'::VARCHAR(50), COALESCE(src.keyword_ad_pay_amount, 0)::NUMERIC(18, 2), COALESCE(src.keyword_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.keyword_ad_visitor_count, 0)::BIGINT, COALESCE(src.keyword_ad_cart_buyer_count, 0)::BIGINT),
        ('人群推广'::VARCHAR(50), COALESCE(src.crowd_ad_pay_amount, 0)::NUMERIC(18, 2), COALESCE(src.crowd_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.crowd_ad_visitor_count, 0)::BIGINT, COALESCE(src.crowd_ad_cart_buyer_count, 0)::BIGINT),
        ('场景推广'::VARCHAR(50), COALESCE(src.scene_ad_pay_amount, 0)::NUMERIC(18, 2), COALESCE(src.scene_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.scene_ad_visitor_count, 0)::BIGINT, COALESCE(src.scene_ad_cart_buyer_count, 0)::BIGINT)
    ) AS channel(traffic_channel, pay_amount, pay_buyer_count, visitor_count, cart_buyer_count)
  ),
  channel_agg AS (
    SELECT
      d.week_period,
      d.platform,
      d.as_of_date,
      d.observed_days,
      d.product_id,
      COALESCE(
        MAX(CASE
          WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date
            AND NULLIF(BTRIM(d.product_name), '') IS NOT NULL
            THEN d.product_name
        END),
        MAX(CASE
          WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7)
            AND NULLIF(BTRIM(d.product_name), '') IS NOT NULL
            THEN d.product_name
        END),
        '(未命名商品)'
      )::VARCHAR(500) AS product_name,
      d.traffic_channel,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.pay_amount ELSE 0 END)::NUMERIC(18, 2) AS curr_pay_amount,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.pay_amount ELSE 0 END)::NUMERIC(18, 2) AS prev_pay_amount,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.pay_buyer_count ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.pay_buyer_count ELSE 0 END)::BIGINT AS prev_pay_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.visitor_count ELSE 0 END)::BIGINT AS curr_visitor_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.visitor_count ELSE 0 END)::BIGINT AS prev_visitor_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.cart_buyer_count ELSE 0 END)::BIGINT AS curr_cart_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.cart_buyer_count ELSE 0 END)::BIGINT AS prev_cart_buyer_count
    FROM channel_daily d
    GROUP BY
      d.week_period,
      d.platform,
      d.as_of_date,
      d.observed_days,
      d.product_id,
      d.traffic_channel
  ),
  enriched AS (
    SELECT
      a.week_period,
      a.platform,
      a.product_id,
      a.traffic_channel,
      a.product_name,
      a.as_of_date,
      a.observed_days,
      a.curr_pay_amount,
      a.prev_pay_amount,
      (a.curr_pay_amount - a.prev_pay_amount)::NUMERIC(18, 2) AS pay_amount_delta,
      a.curr_pay_buyer_count,
      a.prev_pay_buyer_count,
      a.curr_visitor_count,
      a.prev_visitor_count,
      a.curr_cart_buyer_count,
      a.prev_cart_buyer_count,
      CASE
        WHEN a.curr_visitor_count > 0 THEN ROUND((a.curr_pay_buyer_count::NUMERIC / a.curr_visitor_count), 4)
        ELSE NULL
      END AS curr_pay_conversion_rate,
      CASE
        WHEN a.prev_visitor_count > 0 THEN ROUND((a.prev_pay_buyer_count::NUMERIC / a.prev_visitor_count), 4)
        ELSE NULL
      END AS prev_pay_conversion_rate,
      CASE
        WHEN a.curr_visitor_count > 0 THEN ROUND((a.curr_cart_buyer_count::NUMERIC / a.curr_visitor_count), 4)
        ELSE NULL
      END AS curr_cart_rate,
      CASE
        WHEN a.prev_visitor_count > 0 THEN ROUND((a.prev_cart_buyer_count::NUMERIC / a.prev_visitor_count), 4)
        ELSE NULL
      END AS prev_cart_rate
    FROM channel_agg a
    WHERE
      a.curr_pay_amount <> 0
      OR a.prev_pay_amount <> 0
      OR a.curr_pay_buyer_count <> 0
      OR a.prev_pay_buyer_count <> 0
      OR a.curr_visitor_count <> 0
      OR a.prev_visitor_count <> 0
      OR a.curr_cart_buyer_count <> 0
      OR a.prev_cart_buyer_count <> 0
  )
  SELECT
    e.week_period,
    e.platform,
    e.product_id,
    e.traffic_channel,
    e.product_name,
    e.as_of_date,
    e.observed_days,
    e.curr_pay_amount,
    e.prev_pay_amount,
    e.pay_amount_delta,
    e.curr_pay_buyer_count,
    e.prev_pay_buyer_count,
    e.curr_visitor_count,
    e.prev_visitor_count,
    e.curr_cart_buyer_count,
    e.prev_cart_buyer_count,
    e.curr_pay_conversion_rate,
    e.prev_pay_conversion_rate,
    e.curr_cart_rate,
    e.prev_cart_rate,
    CASE
      WHEN SUM(e.pay_amount_delta) OVER (PARTITION BY e.week_period, e.platform) <> 0
        THEN ROUND((e.pay_amount_delta / SUM(e.pay_amount_delta) OVER (PARTITION BY e.week_period, e.platform)), 4)
      ELSE NULL
    END AS pay_amount_delta_contribution_rate
  FROM enriched e;

  DELETE FROM ads.taobao_goods_traffic_channel_metrics_week t
  USING tmp_ads_taobao_goods_traffic_channel_metrics_week_scope ws
  WHERE t.week_period = ws.week_period
    AND t.platform = 'taobao';
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.taobao_goods_traffic_channel_metrics_week (
    week_period,
    platform,
    product_id,
    traffic_channel,
    product_name,
    as_of_date,
    observed_days,
    curr_pay_amount,
    prev_pay_amount,
    pay_amount_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_cart_buyer_count,
    prev_cart_buyer_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_cart_rate,
    prev_cart_rate,
    pay_amount_delta_contribution_rate
  )
  SELECT
    week_period,
    platform,
    product_id,
    traffic_channel,
    product_name,
    as_of_date,
    observed_days,
    curr_pay_amount,
    prev_pay_amount,
    pay_amount_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_cart_buyer_count,
    prev_cart_buyer_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_cart_rate,
    prev_cart_rate,
    pay_amount_delta_contribution_rate
  FROM tmp_ads_taobao_goods_traffic_channel_metrics_week_new;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_goods_traffic_channel_metrics_week completed, inserted: %, deleted: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_goods_traffic_channel_metrics_week(DATE, DATE)
IS '按周窗口刷新天猫商品流量渠道周归因指标（支付金额/支付人数/访客/加购/转化率/增量贡献），并与 ads.all_trade_week_platform 同期口径对齐。';

COMMIT;
