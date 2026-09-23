BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_live_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_live_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_trade_sale_live_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.douyin_trade_sale_live_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.douyin_trade_sale_live_metrics_week;

CREATE TABLE ads.douyin_trade_sale_live_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  shop_name VARCHAR(100) NOT NULL,
  shop_id VARCHAR(50) NOT NULL,
  anchor_nickname VARCHAR(100),
  anchor_douyin_id VARCHAR(100) NOT NULL,
  live_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  live_end_time TIMESTAMP WITHOUT TIME ZONE,
  curr_live_duration_minutes INTEGER NOT NULL DEFAULT 0,
  prev_live_duration_minutes NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  prev_live_exposure_user_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_watch_user_count BIGINT NOT NULL DEFAULT 0,
  prev_live_watch_user_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_product_exposure_user BIGINT NOT NULL DEFAULT 0,
  prev_live_product_exposure_user NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_product_click_user BIGINT NOT NULL DEFAULT 0,
  prev_live_product_click_user NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_live_buyer_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_order_count BIGINT NOT NULL DEFAULT 0,
  prev_live_order_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_live_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_gmv_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_live_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_live_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_comment_count BIGINT NOT NULL DEFAULT 0,
  prev_comment_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_new_follower_count BIGINT NOT NULL DEFAULT 0,
  prev_new_follower_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_product_count BIGINT NOT NULL DEFAULT 0,
  prev_product_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_live_metrics_week
    PRIMARY KEY (week_period, shop_id, anchor_douyin_id, live_start_time),
  CONSTRAINT chk_douyin_trade_sale_live_metrics_week_observed_days
    CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.douyin_trade_sale_live_metrics_week IS 'ADS-抖音直播场次周指标（用于周报直播场次定位与量化归因）。';
COMMENT ON COLUMN ads.douyin_trade_sale_live_metrics_week.week_period IS '周时间段，格式: 2026/2/7～2026/2/13';
COMMENT ON COLUMN ads.douyin_trade_sale_live_metrics_week.as_of_date IS '同期口径截止日期（与 ads.all_trade_week_platform 对齐）';
COMMENT ON COLUMN ads.douyin_trade_sale_live_metrics_week.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1）';
COMMENT ON COLUMN ads.douyin_trade_sale_live_metrics_week.live_gmv_delta IS '直播场次 GMV 增量（curr_live_gmv - prev_live_gmv）';

CREATE INDEX idx_douyin_trade_sale_live_metrics_week_anchor
  ON ads.douyin_trade_sale_live_metrics_week (anchor_douyin_id, live_start_time DESC);

CREATE FUNCTION ads.fn_touch_douyin_trade_sale_live_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_trade_sale_live_metrics_week_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_live_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_live_metrics_week_updated_at();

CREATE PROCEDURE ads.refresh_douyin_trade_sale_live_metrics_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_live_raw does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(as_of_date)),
    COALESCE(p_end_date, MAX(as_of_date))
  INTO v_start_date, v_end_date
  FROM ads.all_trade_week_platform
  WHERE platform = 'douyin'
    AND as_of_date IS NOT NULL
    AND observed_days IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ads.all_trade_week_platform has no douyin sync rows, skipped';
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_ads_douyin_live_week_scope ON COMMIT DROP AS
  SELECT
    p.week_period,
    p.as_of_date,
    p.observed_days,
    (p.as_of_date - (p.observed_days - 1))::DATE AS week_start
  FROM ads.all_trade_week_platform p
  WHERE p.platform = 'douyin'
    AND p.as_of_date IS NOT NULL
    AND p.observed_days IS NOT NULL
    AND p.as_of_date BETWEEN v_start_date AND v_end_date;

  CREATE TEMP TABLE tmp_ads_douyin_live_week_curr ON COMMIT DROP AS
  SELECT
    ws.week_period,
    ws.as_of_date,
    ws.observed_days,
    src.shop_name,
    src.shop_id,
    src.anchor_nickname,
    src.anchor_douyin_id,
    src.live_start_time,
    src.live_end_time,
    COALESCE(src.live_duration_minutes, 0)::INTEGER AS curr_live_duration_minutes,
    COALESCE(src.live_exposure_user_count, 0)::BIGINT AS curr_live_exposure_user_count,
    COALESCE(src.live_watch_user_count, 0)::BIGINT AS curr_live_watch_user_count,
    COALESCE(src.live_product_exposure_user, 0)::BIGINT AS curr_live_product_exposure_user,
    COALESCE(src.live_product_click_user, 0)::BIGINT AS curr_live_product_click_user,
    COALESCE(src.live_buyer_count, 0)::BIGINT AS curr_live_buyer_count,
    COALESCE(src.live_order_count, 0)::BIGINT AS curr_live_order_count,
    COALESCE(src.live_gmv, 0)::NUMERIC(18, 2) AS curr_live_gmv,
    COALESCE(src.live_user_pay_amount, 0)::NUMERIC(18, 2) AS curr_live_user_pay_amount,
    COALESCE(src.live_ad_cost, 0)::NUMERIC(18, 2) AS curr_live_ad_cost,
    COALESCE(src.comment_count, 0)::BIGINT AS curr_comment_count,
    COALESCE(src.new_follower_count, 0)::BIGINT AS curr_new_follower_count,
    COALESCE(src.product_count, 0)::BIGINT AS curr_product_count
  FROM ods.douyin_trade_sale_live_raw src
  JOIN tmp_ads_douyin_live_week_scope ws
    ON DATE(src.live_start_time) BETWEEN ws.week_start AND ws.as_of_date
  WHERE DATE(src.live_start_time) BETWEEN (v_start_date - 13) AND v_end_date;

  CREATE TEMP TABLE tmp_ads_douyin_live_week_prev_anchor ON COMMIT DROP AS
  SELECT
    ws.week_period,
    src.shop_id,
    src.anchor_douyin_id,
    AVG(COALESCE(src.live_duration_minutes, 0))::NUMERIC(18, 2) AS prev_live_duration_minutes,
    AVG(COALESCE(src.live_exposure_user_count, 0))::NUMERIC(18, 2) AS prev_live_exposure_user_count,
    AVG(COALESCE(src.live_watch_user_count, 0))::NUMERIC(18, 2) AS prev_live_watch_user_count,
    AVG(COALESCE(src.live_product_exposure_user, 0))::NUMERIC(18, 2) AS prev_live_product_exposure_user,
    AVG(COALESCE(src.live_product_click_user, 0))::NUMERIC(18, 2) AS prev_live_product_click_user,
    AVG(COALESCE(src.live_buyer_count, 0))::NUMERIC(18, 2) AS prev_live_buyer_count,
    AVG(COALESCE(src.live_order_count, 0))::NUMERIC(18, 2) AS prev_live_order_count,
    AVG(COALESCE(src.live_gmv, 0))::NUMERIC(18, 2) AS prev_live_gmv,
    AVG(COALESCE(src.live_user_pay_amount, 0))::NUMERIC(18, 2) AS prev_live_user_pay_amount,
    AVG(COALESCE(src.live_ad_cost, 0))::NUMERIC(18, 2) AS prev_live_ad_cost,
    AVG(COALESCE(src.comment_count, 0))::NUMERIC(18, 2) AS prev_comment_count,
    AVG(COALESCE(src.new_follower_count, 0))::NUMERIC(18, 2) AS prev_new_follower_count,
    AVG(COALESCE(src.product_count, 0))::NUMERIC(18, 2) AS prev_product_count
  FROM ods.douyin_trade_sale_live_raw src
  JOIN tmp_ads_douyin_live_week_scope ws
    ON DATE(src.live_start_time) BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)
  WHERE DATE(src.live_start_time) BETWEEN (v_start_date - 20) AND (v_end_date - 7)
  GROUP BY ws.week_period, src.shop_id, src.anchor_douyin_id;

  CREATE TEMP TABLE tmp_ads_douyin_live_week_new ON COMMIT DROP AS
  SELECT
    c.week_period,
    c.as_of_date,
    c.observed_days,
    c.shop_name,
    c.shop_id,
    c.anchor_nickname,
    c.anchor_douyin_id,
    c.live_start_time,
    c.live_end_time,
    c.curr_live_duration_minutes,
    COALESCE(p.prev_live_duration_minutes, 0)::NUMERIC(18, 2) AS prev_live_duration_minutes,
    c.curr_live_exposure_user_count,
    COALESCE(p.prev_live_exposure_user_count, 0)::NUMERIC(18, 2) AS prev_live_exposure_user_count,
    c.curr_live_watch_user_count,
    COALESCE(p.prev_live_watch_user_count, 0)::NUMERIC(18, 2) AS prev_live_watch_user_count,
    c.curr_live_product_exposure_user,
    COALESCE(p.prev_live_product_exposure_user, 0)::NUMERIC(18, 2) AS prev_live_product_exposure_user,
    c.curr_live_product_click_user,
    COALESCE(p.prev_live_product_click_user, 0)::NUMERIC(18, 2) AS prev_live_product_click_user,
    c.curr_live_buyer_count,
    COALESCE(p.prev_live_buyer_count, 0)::NUMERIC(18, 2) AS prev_live_buyer_count,
    c.curr_live_order_count,
    COALESCE(p.prev_live_order_count, 0)::NUMERIC(18, 2) AS prev_live_order_count,
    c.curr_live_gmv,
    COALESCE(p.prev_live_gmv, 0)::NUMERIC(18, 2) AS prev_live_gmv,
    (c.curr_live_gmv - COALESCE(p.prev_live_gmv, 0))::NUMERIC(18, 2) AS live_gmv_delta,
    c.curr_live_user_pay_amount,
    COALESCE(p.prev_live_user_pay_amount, 0)::NUMERIC(18, 2) AS prev_live_user_pay_amount,
    c.curr_live_ad_cost,
    COALESCE(p.prev_live_ad_cost, 0)::NUMERIC(18, 2) AS prev_live_ad_cost,
    c.curr_comment_count,
    COALESCE(p.prev_comment_count, 0)::NUMERIC(18, 2) AS prev_comment_count,
    c.curr_new_follower_count,
    COALESCE(p.prev_new_follower_count, 0)::NUMERIC(18, 2) AS prev_new_follower_count,
    c.curr_product_count,
    COALESCE(p.prev_product_count, 0)::NUMERIC(18, 2) AS prev_product_count
  FROM tmp_ads_douyin_live_week_curr c
  LEFT JOIN tmp_ads_douyin_live_week_prev_anchor p
    ON p.week_period = c.week_period
   AND p.shop_id = c.shop_id
   AND p.anchor_douyin_id = c.anchor_douyin_id;

  DELETE FROM ads.douyin_trade_sale_live_metrics_week t
  USING tmp_ads_douyin_live_week_scope ws
  WHERE t.week_period = ws.week_period;

  INSERT INTO ads.douyin_trade_sale_live_metrics_week (
    week_period,
    as_of_date,
    observed_days,
    shop_name,
    shop_id,
    anchor_nickname,
    anchor_douyin_id,
    live_start_time,
    live_end_time,
    curr_live_duration_minutes,
    prev_live_duration_minutes,
    curr_live_exposure_user_count,
    prev_live_exposure_user_count,
    curr_live_watch_user_count,
    prev_live_watch_user_count,
    curr_live_product_exposure_user,
    prev_live_product_exposure_user,
    curr_live_product_click_user,
    prev_live_product_click_user,
    curr_live_buyer_count,
    prev_live_buyer_count,
    curr_live_order_count,
    prev_live_order_count,
    curr_live_gmv,
    prev_live_gmv,
    live_gmv_delta,
    curr_live_user_pay_amount,
    prev_live_user_pay_amount,
    curr_live_ad_cost,
    prev_live_ad_cost,
    curr_comment_count,
    prev_comment_count,
    curr_new_follower_count,
    prev_new_follower_count,
    curr_product_count,
    prev_product_count
  )
  SELECT
    week_period,
    as_of_date,
    observed_days,
    shop_name,
    shop_id,
    anchor_nickname,
    anchor_douyin_id,
    live_start_time,
    live_end_time,
    curr_live_duration_minutes,
    prev_live_duration_minutes,
    curr_live_exposure_user_count,
    prev_live_exposure_user_count,
    curr_live_watch_user_count,
    prev_live_watch_user_count,
    curr_live_product_exposure_user,
    prev_live_product_exposure_user,
    curr_live_product_click_user,
    prev_live_product_click_user,
    curr_live_buyer_count,
    prev_live_buyer_count,
    curr_live_order_count,
    prev_live_order_count,
    curr_live_gmv,
    prev_live_gmv,
    live_gmv_delta,
    curr_live_user_pay_amount,
    prev_live_user_pay_amount,
    curr_live_ad_cost,
    prev_live_ad_cost,
    curr_comment_count,
    prev_comment_count,
    curr_new_follower_count,
    prev_new_follower_count,
    curr_product_count,
    prev_product_count
  FROM tmp_ads_douyin_live_week_new;

  RAISE NOTICE 'refresh_douyin_trade_sale_live_metrics_week completed, window: [% - %]', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_live_metrics_week(DATE, DATE)
IS '按周窗口刷新抖音直播场次指标，口径与 ads.all_trade_week_platform 的 as_of_date/observed_days 对齐。';

CREATE TABLE etl.douyin_trade_sale_live_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_trade_sale_live_metrics_week_refresh_state_id CHECK (id = 1)
);

INSERT INTO etl.douyin_trade_sale_live_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_douyin_trade_sale_live_metrics_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER := GREATEST(COALESCE(p_fallback_window_days, 14), 1);
  v_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_date DATE;
  v_refresh_start DATE;
  v_refresh_end DATE;
BEGIN
  INSERT INTO etl.douyin_trade_sale_live_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(MAX(updated_at), TIMESTAMP '1970-01-01')
  INTO v_source_updated_at
  FROM ods.douyin_trade_sale_live_raw;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_trade_sale_live_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_live_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;
    RETURN;
  END IF;

  PERFORM 1
  FROM ads.douyin_trade_sale_live_metrics_week
  LIMIT 1;

  IF NOT FOUND THEN
    CALL ads.refresh_douyin_trade_sale_live_metrics_week(NULL, NULL);

    SELECT
      MIN(as_of_date),
      MAX(as_of_date)
    INTO v_refresh_start, v_refresh_end
    FROM ads.douyin_trade_sale_live_metrics_week;

    UPDATE etl.douyin_trade_sale_live_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      last_refresh_start_date = v_refresh_start,
      last_refresh_end_date = v_refresh_end,
      updated_at = NOW()
    WHERE id = 1;
    RETURN;
  END IF;

  IF v_last_source_updated_at IS NOT NULL
     AND v_source_updated_at IS NOT NULL
     AND v_source_updated_at <= v_last_source_updated_at THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_live_metrics_week_incremental skipped, no source update';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(DATE(live_start_time)), DATE '1970-01-01')
  INTO v_source_max_date
  FROM ods.douyin_trade_sale_live_raw;

  IF v_source_max_date <= DATE '1970-01-01' THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_live_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_douyin_trade_sale_live_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.douyin_trade_sale_live_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_live_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按水位增量刷新抖音直播场次周指标，默认回刷近 N 天窗口。';

CALL ads.refresh_douyin_trade_sale_live_metrics_week_incremental(14, TRUE);

COMMIT;
