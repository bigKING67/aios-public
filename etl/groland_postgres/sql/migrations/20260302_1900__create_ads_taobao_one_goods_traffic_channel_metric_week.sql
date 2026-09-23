BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DO $$
BEGIN
  IF to_regclass('ads.taobao_one_goods_goods_traffic_channel_metric_week') IS NOT NULL
     AND to_regclass('ads.taobao_one_goods_traffic_channel_metric_week') IS NULL THEN
    ALTER TABLE ads.taobao_one_goods_goods_traffic_channel_metric_week
      RENAME TO taobao_one_goods_traffic_channel_metric_week;
  END IF;

  IF to_regclass('etl.taobao_one_goods_goods_traffic_channel_metric_week_refresh_state') IS NOT NULL
     AND to_regclass('etl.taobao_one_goods_traffic_channel_metric_week_refresh_state') IS NULL THEN
    ALTER TABLE etl.taobao_one_goods_goods_traffic_channel_metric_week_refresh_state
      RENAME TO taobao_one_goods_traffic_channel_metric_week_refresh_state;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ads.taobao_one_goods_traffic_channel_metric_week (
  week_period VARCHAR(50) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  traffic_channel VARCHAR(50) NOT NULL,
  product_name VARCHAR(500),
  as_of_date DATE,
  observed_days SMALLINT,
  curr_impression_count BIGINT NOT NULL DEFAULT 0,
  prev_impression_count BIGINT NOT NULL DEFAULT 0,
  curr_click_count BIGINT NOT NULL DEFAULT 0,
  prev_click_count BIGINT NOT NULL DEFAULT 0,
  curr_cart_count BIGINT NOT NULL DEFAULT 0,
  prev_cart_count BIGINT NOT NULL DEFAULT 0,
  curr_pay_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_pay_buyer_count BIGINT NOT NULL DEFAULT 0,
  curr_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gmv_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gmv_delta_contribution_rate NUMERIC(10, 4),
  curr_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cost_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_ctr NUMERIC(10, 6),
  prev_ctr NUMERIC(10, 6),
  curr_click_to_cart_rate NUMERIC(10, 6),
  prev_click_to_cart_rate NUMERIC(10, 6),
  curr_cart_to_pay_rate NUMERIC(10, 6),
  prev_cart_to_pay_rate NUMERIC(10, 6),
  curr_avg_order_value NUMERIC(18, 2),
  prev_avg_order_value NUMERIC(18, 2),
  curr_roi NUMERIC(12, 6),
  prev_roi NUMERIC(12, 6),
  curr_avg_click_cost NUMERIC(18, 2),
  prev_avg_click_cost NUMERIC(18, 2),
  curr_cpm NUMERIC(18, 2),
  prev_cpm NUMERIC(18, 2),
  curr_click_conversion_rate NUMERIC(10, 6),
  prev_click_conversion_rate NUMERIC(10, 6),
  curr_wangwang_consult_count BIGINT NOT NULL DEFAULT 0,
  prev_wangwang_consult_count BIGINT NOT NULL DEFAULT 0,
  curr_member_join_count BIGINT NOT NULL DEFAULT 0,
  prev_member_join_count BIGINT NOT NULL DEFAULT 0,
  curr_new_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_new_buyer_count BIGINT NOT NULL DEFAULT 0,
  curr_coupon_claim_count BIGINT NOT NULL DEFAULT 0,
  prev_coupon_claim_count BIGINT NOT NULL DEFAULT 0,
  curr_total_favorite_cart_count BIGINT NOT NULL DEFAULT 0,
  prev_total_favorite_cart_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_taobao_one_goods_traffic_channel_metric_week PRIMARY KEY (week_period, platform, product_id, traffic_channel),
  CONSTRAINT chk_taobao_one_goods_traffic_channel_metric_week_platform CHECK (platform IN ('taobao')),
  CONSTRAINT chk_taobao_one_goods_traffic_channel_metric_week_channel CHECK (
    traffic_channel IN ('搜索', '推荐', '关键词推广', '人群推广', '场景推广', '其他')
  ),
  CONSTRAINT chk_taobao_one_goods_traffic_channel_metric_week_observed_days CHECK (
    observed_days IS NULL OR observed_days BETWEEN 1 AND 7
  )
);

COMMENT ON TABLE ads.taobao_one_goods_traffic_channel_metric_week IS 'ADS-淘宝万相台商品流量渠道周漏斗与归因指标表（周六至周五）。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.curr_impression_count IS '本周同期窗口曝光量。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.curr_click_count IS '本周同期窗口点击量。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.curr_cart_count IS '本周同期窗口加购量。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.curr_pay_buyer_count IS '本周同期窗口支付人数。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.curr_pay_amount IS '本周同期窗口支付金额。';
COMMENT ON COLUMN ads.taobao_one_goods_traffic_channel_metric_week.gmv_delta_contribution_rate IS '渠道 GMV 增量贡献率（gmv_delta / 周总增量）。';

CREATE INDEX IF NOT EXISTS idx_taobao_one_goods_traffic_channel_metric_week_week_platform_delta
  ON ads.taobao_one_goods_traffic_channel_metric_week (week_period, platform, gmv_delta DESC);

CREATE INDEX IF NOT EXISTS idx_taobao_one_goods_traffic_channel_metric_week_product
  ON ads.taobao_one_goods_traffic_channel_metric_week (product_id);

CREATE INDEX IF NOT EXISTS idx_taobao_one_goods_traffic_channel_metric_week_channel
  ON ads.taobao_one_goods_traffic_channel_metric_week (traffic_channel);

DROP TRIGGER IF EXISTS trg_touch_taobao_one_goods_goods_traffic_channel_metric_week_updated_at
ON ads.taobao_one_goods_traffic_channel_metric_week;

DROP FUNCTION IF EXISTS ads.fn_touch_taobao_one_goods_goods_traffic_channel_metric_week_updated_at();

CREATE OR REPLACE FUNCTION ads.fn_touch_taobao_one_goods_traffic_channel_metric_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_taobao_one_goods_traffic_channel_metric_week_updated_at
ON ads.taobao_one_goods_traffic_channel_metric_week;

CREATE TRIGGER trg_touch_taobao_one_goods_traffic_channel_metric_week_updated_at
BEFORE UPDATE ON ads.taobao_one_goods_traffic_channel_metric_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_taobao_one_goods_traffic_channel_metric_week_updated_at();

DROP PROCEDURE IF EXISTS ads.refresh_taobao_one_goods_goods_traffic_channel_metric_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_one_goods_goods_traffic_channel_metric_week_incremental(INTEGER, BOOLEAN);

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_one_goods_traffic_channel_metric_week(
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

  IF to_regclass('ods.taobao_one_alimama_goods_marketingscenario') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_one_alimama_goods_marketingscenario does not exist';
  END IF;

  IF to_regclass('ads.taobao_one_goods_traffic_channel_metric_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_one_goods_traffic_channel_metric_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date)),
    MAX(stat_date)
  INTO v_start_date, v_end_date, v_data_max_date
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_one_alimama_goods_marketingscenario has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  CREATE TEMP TABLE tmp_taobao_one_goods_traffic_channel_metric_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_taobao_one_goods_traffic_channel_metric_week_new ON COMMIT DROP AS
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
    FROM tmp_taobao_one_goods_traffic_channel_metric_week_scope ws
    JOIN ads.all_trade_week_platform p
      ON p.week_period = ws.week_period
    WHERE p.platform = 'taobao'
  ),
  source_daily AS (
    SELECT
      s.week_period,
      s.platform,
      s.week_start,
      s.as_of_date,
      s.observed_days,
      src.product_id,
      src.stat_date,
      COALESCE(NULLIF(BTRIM(src.subject_name), ''), '(未命名商品)')::VARCHAR(500) AS product_name,
      CASE
        WHEN src.scene ILIKE '%关键词%' THEN '关键词推广'
        WHEN src.scene ILIKE '%搜索%' THEN '搜索'
        WHEN src.scene ILIKE '%人群%' THEN '人群推广'
        WHEN src.scene ILIKE '%场景%' THEN '场景推广'
        WHEN src.scene ILIKE '%推荐%' OR src.scene ILIKE '%全站%' THEN '推荐'
        ELSE '其他'
      END::VARCHAR(50) AS traffic_channel,
      COALESCE(src.impression_count, 0)::BIGINT AS impression_count,
      COALESCE(src.click_count, 0)::BIGINT AS click_count,
      COALESCE(src.total_cart_count, 0)::BIGINT AS cart_count,
      COALESCE(src.buyer_count, 0)::BIGINT AS pay_buyer_count,
      COALESCE(src.total_gmv, 0)::NUMERIC(18, 2) AS pay_amount,
      COALESCE(src.cost, 0)::NUMERIC(18, 2) AS cost,
      COALESCE(src.wangwang_consult_count, 0)::BIGINT AS wangwang_consult_count,
      COALESCE(src.member_join_count, 0)::BIGINT AS member_join_count,
      COALESCE(src.new_buyer_count, 0)::BIGINT AS new_buyer_count,
      COALESCE(src.coupon_claim_count, 0)::BIGINT AS coupon_claim_count,
      COALESCE(src.total_favorite_cart_count, 0)::BIGINT AS total_favorite_cart_count
    FROM taobao_scope s
    JOIN ods.taobao_one_alimama_goods_marketingscenario src
      ON src.stat_date BETWEEN (s.week_start - 7) AND s.as_of_date
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
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.impression_count ELSE 0 END)::BIGINT AS curr_impression_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.impression_count ELSE 0 END)::BIGINT AS prev_impression_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.click_count ELSE 0 END)::BIGINT AS curr_click_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.click_count ELSE 0 END)::BIGINT AS prev_click_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.cart_count ELSE 0 END)::BIGINT AS curr_cart_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.cart_count ELSE 0 END)::BIGINT AS prev_cart_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.pay_buyer_count ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.pay_buyer_count ELSE 0 END)::BIGINT AS prev_pay_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.pay_amount ELSE 0 END)::NUMERIC(18, 2) AS curr_pay_amount,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.pay_amount ELSE 0 END)::NUMERIC(18, 2) AS prev_pay_amount,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.cost ELSE 0 END)::NUMERIC(18, 2) AS curr_cost,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.cost ELSE 0 END)::NUMERIC(18, 2) AS prev_cost,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.wangwang_consult_count ELSE 0 END)::BIGINT AS curr_wangwang_consult_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.wangwang_consult_count ELSE 0 END)::BIGINT AS prev_wangwang_consult_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.member_join_count ELSE 0 END)::BIGINT AS curr_member_join_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.member_join_count ELSE 0 END)::BIGINT AS prev_member_join_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.new_buyer_count ELSE 0 END)::BIGINT AS curr_new_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.new_buyer_count ELSE 0 END)::BIGINT AS prev_new_buyer_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.coupon_claim_count ELSE 0 END)::BIGINT AS curr_coupon_claim_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.coupon_claim_count ELSE 0 END)::BIGINT AS prev_coupon_claim_count,
      SUM(CASE WHEN d.stat_date BETWEEN d.week_start AND d.as_of_date THEN d.total_favorite_cart_count ELSE 0 END)::BIGINT AS curr_total_favorite_cart_count,
      SUM(CASE WHEN d.stat_date BETWEEN (d.week_start - 7) AND (d.as_of_date - 7) THEN d.total_favorite_cart_count ELSE 0 END)::BIGINT AS prev_total_favorite_cart_count
    FROM source_daily d
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
      a.curr_impression_count,
      a.prev_impression_count,
      a.curr_click_count,
      a.prev_click_count,
      a.curr_cart_count,
      a.prev_cart_count,
      a.curr_pay_buyer_count,
      a.prev_pay_buyer_count,
      a.curr_pay_amount,
      a.prev_pay_amount,
      (a.curr_pay_amount - a.prev_pay_amount)::NUMERIC(18, 2) AS gmv_delta,
      a.curr_cost,
      a.prev_cost,
      (a.curr_cost - a.prev_cost)::NUMERIC(18, 2) AS cost_delta,
      CASE
        WHEN a.curr_impression_count > 0 THEN ROUND((a.curr_click_count::NUMERIC / a.curr_impression_count), 6)
        ELSE NULL
      END AS curr_ctr,
      CASE
        WHEN a.prev_impression_count > 0 THEN ROUND((a.prev_click_count::NUMERIC / a.prev_impression_count), 6)
        ELSE NULL
      END AS prev_ctr,
      CASE
        WHEN a.curr_click_count > 0 THEN ROUND((a.curr_cart_count::NUMERIC / a.curr_click_count), 6)
        ELSE NULL
      END AS curr_click_to_cart_rate,
      CASE
        WHEN a.prev_click_count > 0 THEN ROUND((a.prev_cart_count::NUMERIC / a.prev_click_count), 6)
        ELSE NULL
      END AS prev_click_to_cart_rate,
      CASE
        WHEN a.curr_cart_count > 0 THEN ROUND((a.curr_pay_buyer_count::NUMERIC / a.curr_cart_count), 6)
        ELSE NULL
      END AS curr_cart_to_pay_rate,
      CASE
        WHEN a.prev_cart_count > 0 THEN ROUND((a.prev_pay_buyer_count::NUMERIC / a.prev_cart_count), 6)
        ELSE NULL
      END AS prev_cart_to_pay_rate,
      CASE
        WHEN a.curr_pay_buyer_count > 0 THEN ROUND((a.curr_pay_amount / a.curr_pay_buyer_count), 2)
        ELSE NULL
      END AS curr_avg_order_value,
      CASE
        WHEN a.prev_pay_buyer_count > 0 THEN ROUND((a.prev_pay_amount / a.prev_pay_buyer_count), 2)
        ELSE NULL
      END AS prev_avg_order_value,
      CASE
        WHEN a.curr_cost > 0 THEN ROUND((a.curr_pay_amount / a.curr_cost), 6)
        ELSE NULL
      END AS curr_roi,
      CASE
        WHEN a.prev_cost > 0 THEN ROUND((a.prev_pay_amount / a.prev_cost), 6)
        ELSE NULL
      END AS prev_roi,
      CASE
        WHEN a.curr_click_count > 0 THEN ROUND((a.curr_cost / a.curr_click_count), 2)
        ELSE NULL
      END AS curr_avg_click_cost,
      CASE
        WHEN a.prev_click_count > 0 THEN ROUND((a.prev_cost / a.prev_click_count), 2)
        ELSE NULL
      END AS prev_avg_click_cost,
      CASE
        WHEN a.curr_impression_count > 0 THEN ROUND((a.curr_cost * 1000 / a.curr_impression_count), 2)
        ELSE NULL
      END AS curr_cpm,
      CASE
        WHEN a.prev_impression_count > 0 THEN ROUND((a.prev_cost * 1000 / a.prev_impression_count), 2)
        ELSE NULL
      END AS prev_cpm,
      CASE
        WHEN a.curr_click_count > 0 THEN ROUND((a.curr_pay_buyer_count::NUMERIC / a.curr_click_count), 6)
        ELSE NULL
      END AS curr_click_conversion_rate,
      CASE
        WHEN a.prev_click_count > 0 THEN ROUND((a.prev_pay_buyer_count::NUMERIC / a.prev_click_count), 6)
        ELSE NULL
      END AS prev_click_conversion_rate,
      a.curr_wangwang_consult_count,
      a.prev_wangwang_consult_count,
      a.curr_member_join_count,
      a.prev_member_join_count,
      a.curr_new_buyer_count,
      a.prev_new_buyer_count,
      a.curr_coupon_claim_count,
      a.prev_coupon_claim_count,
      a.curr_total_favorite_cart_count,
      a.prev_total_favorite_cart_count
    FROM channel_agg a
    WHERE
      a.curr_pay_amount <> 0
      OR a.prev_pay_amount <> 0
      OR a.curr_cost <> 0
      OR a.prev_cost <> 0
      OR a.curr_impression_count <> 0
      OR a.prev_impression_count <> 0
      OR a.curr_click_count <> 0
      OR a.prev_click_count <> 0
  )
  SELECT
    e.week_period,
    e.platform,
    e.product_id,
    e.traffic_channel,
    e.product_name,
    e.as_of_date,
    e.observed_days,
    e.curr_impression_count,
    e.prev_impression_count,
    e.curr_click_count,
    e.prev_click_count,
    e.curr_cart_count,
    e.prev_cart_count,
    e.curr_pay_buyer_count,
    e.prev_pay_buyer_count,
    e.curr_pay_amount,
    e.prev_pay_amount,
    e.gmv_delta,
    CASE
      WHEN SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform) <> 0
        THEN ROUND((e.gmv_delta / SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform)), 4)
      ELSE NULL
    END AS gmv_delta_contribution_rate,
    e.curr_cost,
    e.prev_cost,
    e.cost_delta,
    e.curr_ctr,
    e.prev_ctr,
    e.curr_click_to_cart_rate,
    e.prev_click_to_cart_rate,
    e.curr_cart_to_pay_rate,
    e.prev_cart_to_pay_rate,
    e.curr_avg_order_value,
    e.prev_avg_order_value,
    e.curr_roi,
    e.prev_roi,
    e.curr_avg_click_cost,
    e.prev_avg_click_cost,
    e.curr_cpm,
    e.prev_cpm,
    e.curr_click_conversion_rate,
    e.prev_click_conversion_rate,
    e.curr_wangwang_consult_count,
    e.prev_wangwang_consult_count,
    e.curr_member_join_count,
    e.prev_member_join_count,
    e.curr_new_buyer_count,
    e.prev_new_buyer_count,
    e.curr_coupon_claim_count,
    e.prev_coupon_claim_count,
    e.curr_total_favorite_cart_count,
    e.prev_total_favorite_cart_count
  FROM enriched e;

  DELETE FROM ads.taobao_one_goods_traffic_channel_metric_week t
  USING tmp_taobao_one_goods_traffic_channel_metric_week_scope ws
  WHERE t.week_period = ws.week_period
    AND t.platform = 'taobao';

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.taobao_one_goods_traffic_channel_metric_week (
    week_period,
    platform,
    product_id,
    traffic_channel,
    product_name,
    as_of_date,
    observed_days,
    curr_impression_count,
    prev_impression_count,
    curr_click_count,
    prev_click_count,
    curr_cart_count,
    prev_cart_count,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_pay_amount,
    prev_pay_amount,
    gmv_delta,
    gmv_delta_contribution_rate,
    curr_cost,
    prev_cost,
    cost_delta,
    curr_ctr,
    prev_ctr,
    curr_click_to_cart_rate,
    prev_click_to_cart_rate,
    curr_cart_to_pay_rate,
    prev_cart_to_pay_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    curr_roi,
    prev_roi,
    curr_avg_click_cost,
    prev_avg_click_cost,
    curr_cpm,
    prev_cpm,
    curr_click_conversion_rate,
    prev_click_conversion_rate,
    curr_wangwang_consult_count,
    prev_wangwang_consult_count,
    curr_member_join_count,
    prev_member_join_count,
    curr_new_buyer_count,
    prev_new_buyer_count,
    curr_coupon_claim_count,
    prev_coupon_claim_count,
    curr_total_favorite_cart_count,
    prev_total_favorite_cart_count
  )
  SELECT
    week_period,
    platform,
    product_id,
    traffic_channel,
    product_name,
    as_of_date,
    observed_days,
    curr_impression_count,
    prev_impression_count,
    curr_click_count,
    prev_click_count,
    curr_cart_count,
    prev_cart_count,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_pay_amount,
    prev_pay_amount,
    gmv_delta,
    gmv_delta_contribution_rate,
    curr_cost,
    prev_cost,
    cost_delta,
    curr_ctr,
    prev_ctr,
    curr_click_to_cart_rate,
    prev_click_to_cart_rate,
    curr_cart_to_pay_rate,
    prev_cart_to_pay_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    curr_roi,
    prev_roi,
    curr_avg_click_cost,
    prev_avg_click_cost,
    curr_cpm,
    prev_cpm,
    curr_click_conversion_rate,
    prev_click_conversion_rate,
    curr_wangwang_consult_count,
    prev_wangwang_consult_count,
    curr_member_join_count,
    prev_member_join_count,
    curr_new_buyer_count,
    prev_new_buyer_count,
    curr_coupon_claim_count,
    prev_coupon_claim_count,
    curr_total_favorite_cart_count,
    prev_total_favorite_cart_count
  FROM tmp_taobao_one_goods_traffic_channel_metric_week_new;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_one_goods_traffic_channel_metric_week completed, inserted: %, deleted: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_one_goods_traffic_channel_metric_week(DATE, DATE)
IS '按周窗口刷新淘宝万相台商品流量渠道漏斗指标，面向周报淘宝流量渠道归因诊断。';

CREATE TABLE IF NOT EXISTS etl.taobao_one_goods_traffic_channel_metric_week_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_one_goods_traffic_channel_metric_week_refresh_state_id CHECK (id = 1)
);

INSERT INTO etl.taobao_one_goods_traffic_channel_metric_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_one_goods_traffic_channel_metric_week_incremental(
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

  INSERT INTO etl.taobao_one_goods_traffic_channel_metric_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.taobao_one_goods_traffic_channel_metric_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_goods_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_platform_max_updated_at
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao';

  v_source_max_updated_at := GREATEST(
    COALESCE(v_goods_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );

  IF p_init_watermark_only THEN
    UPDATE etl.taobao_one_goods_traffic_channel_metric_week_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    UPDATE etl.taobao_one_goods_traffic_channel_metric_week_refresh_state
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
  FROM ads.all_trade_week_platform
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

  CALL ads.refresh_taobao_one_goods_traffic_channel_metric_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.taobao_one_goods_traffic_channel_metric_week_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_taobao_one_goods_traffic_channel_metric_week_incremental(INTEGER, BOOLEAN)
IS '按增量水位刷新淘宝万相台商品流量渠道周漏斗指标，支持仅初始化水位。';

COMMIT;
