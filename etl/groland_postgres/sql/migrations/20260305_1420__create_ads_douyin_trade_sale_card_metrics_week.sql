BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_card_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_card_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_trade_sale_card_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.douyin_trade_sale_card_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.douyin_trade_sale_card_metrics_week;

CREATE TABLE ads.douyin_trade_sale_card_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  metric_scope VARCHAR(16) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  product_title VARCHAR(500),
  source_level1 VARCHAR(64) NOT NULL DEFAULT 'ALL',
  product_url TEXT,
  curr_card_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  prev_card_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  curr_card_click_user_count BIGINT NOT NULL DEFAULT 0,
  prev_card_click_user_count BIGINT NOT NULL DEFAULT 0,
  curr_card_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_card_buyer_count BIGINT NOT NULL DEFAULT 0,
  curr_card_cart_user_count BIGINT NOT NULL DEFAULT 0,
  prev_card_cart_user_count BIGINT NOT NULL DEFAULT 0,
  curr_card_favorite_user_count BIGINT NOT NULL DEFAULT 0,
  prev_card_favorite_user_count BIGINT NOT NULL DEFAULT 0,
  curr_card_bounce_user_count BIGINT NOT NULL DEFAULT 0,
  prev_card_bounce_user_count BIGINT NOT NULL DEFAULT 0,
  curr_card_order_count BIGINT NOT NULL DEFAULT 0,
  prev_card_order_count BIGINT NOT NULL DEFAULT 0,
  curr_card_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_card_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  card_user_pay_amount_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_card_click_rate NUMERIC(10, 4),
  prev_card_click_rate NUMERIC(10, 4),
  curr_card_click_to_pay_rate NUMERIC(10, 4),
  prev_card_click_to_pay_rate NUMERIC(10, 4),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_card_metrics_week
    PRIMARY KEY (week_period, metric_scope, product_id, source_level1),
  CONSTRAINT chk_douyin_trade_sale_card_metrics_week_scope
    CHECK (metric_scope IN ('product', 'source')),
  CONSTRAINT chk_douyin_trade_sale_card_metrics_week_observed_days
    CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.douyin_trade_sale_card_metrics_week IS 'ADS-抖音商品卡周指标（商品定位 + 流量来源定位）。';
COMMENT ON COLUMN ads.douyin_trade_sale_card_metrics_week.metric_scope IS '指标范围：product（商品级）/source（商品来源级）';
COMMENT ON COLUMN ads.douyin_trade_sale_card_metrics_week.source_level1 IS '一级来源渠道（source 维度）；product 维度固定为 ALL';

CREATE INDEX idx_douyin_trade_sale_card_metrics_week_scope
  ON ads.douyin_trade_sale_card_metrics_week (metric_scope, product_id, source_level1);

CREATE FUNCTION ads.fn_touch_douyin_trade_sale_card_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_trade_sale_card_metrics_week_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_card_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_card_metrics_week_updated_at();

CREATE PROCEDURE ads.refresh_douyin_trade_sale_card_metrics_week(
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

  IF to_regclass('ods.douyin_trade_sale_card_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_card_detail_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_detail_raw does not exist';
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

  CREATE TEMP TABLE tmp_ads_douyin_card_week_scope ON COMMIT DROP AS
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

  CREATE TEMP TABLE tmp_ads_douyin_card_product_curr ON COMMIT DROP AS
  SELECT
    ws.week_period,
    ws.as_of_date,
    ws.observed_days,
    COALESCE(src.product_id, '') AS product_id,
    COALESCE(MAX(NULLIF(BTRIM(src.product_title), '')), '(未命名商品)') AS product_title,
    MAX(src.product_url) AS product_url,
    COALESCE(SUM(COALESCE(src.card_exposure_user_count, 0)), 0)::BIGINT AS curr_card_exposure_user_count,
    COALESCE(SUM(COALESCE(src.card_click_user_count, 0)), 0)::BIGINT AS curr_card_click_user_count,
    COALESCE(SUM(COALESCE(src.card_buyer_count, 0)), 0)::BIGINT AS curr_card_buyer_count,
    COALESCE(SUM(COALESCE(src.card_cart_user_count, 0)), 0)::BIGINT AS curr_card_cart_user_count,
    COALESCE(SUM(COALESCE(src.card_favorite_user_count, 0)), 0)::BIGINT AS curr_card_favorite_user_count,
    0::BIGINT AS curr_card_bounce_user_count,
    COALESCE(SUM(COALESCE(src.card_order_count, 0)), 0)::BIGINT AS curr_card_order_count,
    COALESCE(SUM(COALESCE(src.card_user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_card_user_pay_amount
  FROM ods.douyin_trade_sale_card_raw src
  JOIN tmp_ads_douyin_card_week_scope ws
    ON src."date" BETWEEN ws.week_start AND ws.as_of_date
  WHERE src."date" BETWEEN (v_start_date - 13) AND v_end_date
  GROUP BY ws.week_period, ws.as_of_date, ws.observed_days, COALESCE(src.product_id, '');

  CREATE TEMP TABLE tmp_ads_douyin_card_product_prev ON COMMIT DROP AS
  SELECT
    ws.week_period,
    COALESCE(src.product_id, '') AS product_id,
    COALESCE(SUM(COALESCE(src.card_exposure_user_count, 0)), 0)::BIGINT AS prev_card_exposure_user_count,
    COALESCE(SUM(COALESCE(src.card_click_user_count, 0)), 0)::BIGINT AS prev_card_click_user_count,
    COALESCE(SUM(COALESCE(src.card_buyer_count, 0)), 0)::BIGINT AS prev_card_buyer_count,
    COALESCE(SUM(COALESCE(src.card_cart_user_count, 0)), 0)::BIGINT AS prev_card_cart_user_count,
    COALESCE(SUM(COALESCE(src.card_favorite_user_count, 0)), 0)::BIGINT AS prev_card_favorite_user_count,
    0::BIGINT AS prev_card_bounce_user_count,
    COALESCE(SUM(COALESCE(src.card_order_count, 0)), 0)::BIGINT AS prev_card_order_count,
    COALESCE(SUM(COALESCE(src.card_user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_card_user_pay_amount
  FROM ods.douyin_trade_sale_card_raw src
  JOIN tmp_ads_douyin_card_week_scope ws
    ON src."date" BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)
  WHERE src."date" BETWEEN (v_start_date - 20) AND (v_end_date - 7)
  GROUP BY ws.week_period, COALESCE(src.product_id, '');

  CREATE TEMP TABLE tmp_ads_douyin_card_source_curr ON COMMIT DROP AS
  SELECT
    ws.week_period,
    ws.as_of_date,
    ws.observed_days,
    COALESCE(src.product_id, '') AS product_id,
    COALESCE(MAX(NULLIF(BTRIM(src.product_title), '')), '(未命名商品)') AS product_title,
    MAX(src.product_url) AS product_url,
    COALESCE(src.source_level1, '未知来源') AS source_level1,
    COALESCE(SUM(COALESCE(src.card_exposure_user_count, 0)), 0)::BIGINT AS curr_card_exposure_user_count,
    COALESCE(SUM(COALESCE(src.card_click_user_count, 0)), 0)::BIGINT AS curr_card_click_user_count,
    COALESCE(SUM(COALESCE(src.card_buyer_count, 0)), 0)::BIGINT AS curr_card_buyer_count,
    COALESCE(SUM(COALESCE(src.card_cart_user_count, 0)), 0)::BIGINT AS curr_card_cart_user_count,
    COALESCE(SUM(COALESCE(src.card_favorite_user_count, 0)), 0)::BIGINT AS curr_card_favorite_user_count,
    COALESCE(SUM(COALESCE(src.card_bounce_user_count, 0)), 0)::BIGINT AS curr_card_bounce_user_count,
    COALESCE(SUM(COALESCE(src.card_order_count, 0)), 0)::BIGINT AS curr_card_order_count,
    COALESCE(SUM(COALESCE(src.card_user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_card_user_pay_amount
  FROM ods.douyin_trade_sale_card_detail_raw src
  JOIN tmp_ads_douyin_card_week_scope ws
    ON src.stat_date BETWEEN ws.week_start AND ws.as_of_date
  WHERE src.stat_date BETWEEN (v_start_date - 13) AND v_end_date
  GROUP BY ws.week_period, ws.as_of_date, ws.observed_days, COALESCE(src.product_id, ''), COALESCE(src.source_level1, '未知来源');

  CREATE TEMP TABLE tmp_ads_douyin_card_source_prev ON COMMIT DROP AS
  SELECT
    ws.week_period,
    COALESCE(src.product_id, '') AS product_id,
    COALESCE(src.source_level1, '未知来源') AS source_level1,
    COALESCE(SUM(COALESCE(src.card_exposure_user_count, 0)), 0)::BIGINT AS prev_card_exposure_user_count,
    COALESCE(SUM(COALESCE(src.card_click_user_count, 0)), 0)::BIGINT AS prev_card_click_user_count,
    COALESCE(SUM(COALESCE(src.card_buyer_count, 0)), 0)::BIGINT AS prev_card_buyer_count,
    COALESCE(SUM(COALESCE(src.card_cart_user_count, 0)), 0)::BIGINT AS prev_card_cart_user_count,
    COALESCE(SUM(COALESCE(src.card_favorite_user_count, 0)), 0)::BIGINT AS prev_card_favorite_user_count,
    COALESCE(SUM(COALESCE(src.card_bounce_user_count, 0)), 0)::BIGINT AS prev_card_bounce_user_count,
    COALESCE(SUM(COALESCE(src.card_order_count, 0)), 0)::BIGINT AS prev_card_order_count,
    COALESCE(SUM(COALESCE(src.card_user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_card_user_pay_amount
  FROM ods.douyin_trade_sale_card_detail_raw src
  JOIN tmp_ads_douyin_card_week_scope ws
    ON src.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)
  WHERE src.stat_date BETWEEN (v_start_date - 20) AND (v_end_date - 7)
  GROUP BY ws.week_period, COALESCE(src.product_id, ''), COALESCE(src.source_level1, '未知来源');

  CREATE TEMP TABLE tmp_ads_douyin_card_week_new ON COMMIT DROP AS
  WITH product_scope AS (
    SELECT
      c.week_period,
      c.as_of_date,
      c.observed_days,
      'product'::VARCHAR(16) AS metric_scope,
      c.product_id,
      c.product_title,
      'ALL'::VARCHAR(64) AS source_level1,
      c.product_url,
      c.curr_card_exposure_user_count,
      COALESCE(p.prev_card_exposure_user_count, 0)::BIGINT AS prev_card_exposure_user_count,
      c.curr_card_click_user_count,
      COALESCE(p.prev_card_click_user_count, 0)::BIGINT AS prev_card_click_user_count,
      c.curr_card_buyer_count,
      COALESCE(p.prev_card_buyer_count, 0)::BIGINT AS prev_card_buyer_count,
      c.curr_card_cart_user_count,
      COALESCE(p.prev_card_cart_user_count, 0)::BIGINT AS prev_card_cart_user_count,
      c.curr_card_favorite_user_count,
      COALESCE(p.prev_card_favorite_user_count, 0)::BIGINT AS prev_card_favorite_user_count,
      c.curr_card_bounce_user_count,
      COALESCE(p.prev_card_bounce_user_count, 0)::BIGINT AS prev_card_bounce_user_count,
      c.curr_card_order_count,
      COALESCE(p.prev_card_order_count, 0)::BIGINT AS prev_card_order_count,
      c.curr_card_user_pay_amount,
      COALESCE(p.prev_card_user_pay_amount, 0)::NUMERIC(18, 2) AS prev_card_user_pay_amount
    FROM tmp_ads_douyin_card_product_curr c
    LEFT JOIN tmp_ads_douyin_card_product_prev p
      ON p.week_period = c.week_period
     AND p.product_id = c.product_id
  ),
  source_scope AS (
    SELECT
      c.week_period,
      c.as_of_date,
      c.observed_days,
      'source'::VARCHAR(16) AS metric_scope,
      c.product_id,
      c.product_title,
      c.source_level1,
      c.product_url,
      c.curr_card_exposure_user_count,
      COALESCE(p.prev_card_exposure_user_count, 0)::BIGINT AS prev_card_exposure_user_count,
      c.curr_card_click_user_count,
      COALESCE(p.prev_card_click_user_count, 0)::BIGINT AS prev_card_click_user_count,
      c.curr_card_buyer_count,
      COALESCE(p.prev_card_buyer_count, 0)::BIGINT AS prev_card_buyer_count,
      c.curr_card_cart_user_count,
      COALESCE(p.prev_card_cart_user_count, 0)::BIGINT AS prev_card_cart_user_count,
      c.curr_card_favorite_user_count,
      COALESCE(p.prev_card_favorite_user_count, 0)::BIGINT AS prev_card_favorite_user_count,
      c.curr_card_bounce_user_count,
      COALESCE(p.prev_card_bounce_user_count, 0)::BIGINT AS prev_card_bounce_user_count,
      c.curr_card_order_count,
      COALESCE(p.prev_card_order_count, 0)::BIGINT AS prev_card_order_count,
      c.curr_card_user_pay_amount,
      COALESCE(p.prev_card_user_pay_amount, 0)::NUMERIC(18, 2) AS prev_card_user_pay_amount
    FROM tmp_ads_douyin_card_source_curr c
    LEFT JOIN tmp_ads_douyin_card_source_prev p
      ON p.week_period = c.week_period
     AND p.product_id = c.product_id
     AND p.source_level1 = c.source_level1
  ),
  unified AS (
    SELECT * FROM product_scope
    UNION ALL
    SELECT * FROM source_scope
  )
  SELECT
    u.week_period,
    u.as_of_date,
    u.observed_days,
    u.metric_scope,
    u.product_id,
    u.product_title,
    u.source_level1,
    u.product_url,
    u.curr_card_exposure_user_count,
    u.prev_card_exposure_user_count,
    u.curr_card_click_user_count,
    u.prev_card_click_user_count,
    u.curr_card_buyer_count,
    u.prev_card_buyer_count,
    u.curr_card_cart_user_count,
    u.prev_card_cart_user_count,
    u.curr_card_favorite_user_count,
    u.prev_card_favorite_user_count,
    u.curr_card_bounce_user_count,
    u.prev_card_bounce_user_count,
    u.curr_card_order_count,
    u.prev_card_order_count,
    u.curr_card_user_pay_amount,
    u.prev_card_user_pay_amount,
    (u.curr_card_user_pay_amount - u.prev_card_user_pay_amount)::NUMERIC(18, 2) AS card_user_pay_amount_delta,
    CASE
      WHEN u.curr_card_exposure_user_count > 0
        THEN ROUND((u.curr_card_click_user_count::NUMERIC / u.curr_card_exposure_user_count::NUMERIC), 4)
      ELSE NULL
    END AS curr_card_click_rate,
    CASE
      WHEN u.prev_card_exposure_user_count > 0
        THEN ROUND((u.prev_card_click_user_count::NUMERIC / u.prev_card_exposure_user_count::NUMERIC), 4)
      ELSE NULL
    END AS prev_card_click_rate,
    CASE
      WHEN u.curr_card_click_user_count > 0
        THEN ROUND((u.curr_card_buyer_count::NUMERIC / u.curr_card_click_user_count::NUMERIC), 4)
      ELSE NULL
    END AS curr_card_click_to_pay_rate,
    CASE
      WHEN u.prev_card_click_user_count > 0
        THEN ROUND((u.prev_card_buyer_count::NUMERIC / u.prev_card_click_user_count::NUMERIC), 4)
      ELSE NULL
    END AS prev_card_click_to_pay_rate
  FROM unified u;

  DELETE FROM ads.douyin_trade_sale_card_metrics_week t
  USING tmp_ads_douyin_card_week_scope ws
  WHERE t.week_period = ws.week_period;

  INSERT INTO ads.douyin_trade_sale_card_metrics_week (
    week_period,
    as_of_date,
    observed_days,
    metric_scope,
    product_id,
    product_title,
    source_level1,
    product_url,
    curr_card_exposure_user_count,
    prev_card_exposure_user_count,
    curr_card_click_user_count,
    prev_card_click_user_count,
    curr_card_buyer_count,
    prev_card_buyer_count,
    curr_card_cart_user_count,
    prev_card_cart_user_count,
    curr_card_favorite_user_count,
    prev_card_favorite_user_count,
    curr_card_bounce_user_count,
    prev_card_bounce_user_count,
    curr_card_order_count,
    prev_card_order_count,
    curr_card_user_pay_amount,
    prev_card_user_pay_amount,
    card_user_pay_amount_delta,
    curr_card_click_rate,
    prev_card_click_rate,
    curr_card_click_to_pay_rate,
    prev_card_click_to_pay_rate
  )
  SELECT
    week_period,
    as_of_date,
    observed_days,
    metric_scope,
    product_id,
    product_title,
    source_level1,
    product_url,
    curr_card_exposure_user_count,
    prev_card_exposure_user_count,
    curr_card_click_user_count,
    prev_card_click_user_count,
    curr_card_buyer_count,
    prev_card_buyer_count,
    curr_card_cart_user_count,
    prev_card_cart_user_count,
    curr_card_favorite_user_count,
    prev_card_favorite_user_count,
    curr_card_bounce_user_count,
    prev_card_bounce_user_count,
    curr_card_order_count,
    prev_card_order_count,
    curr_card_user_pay_amount,
    prev_card_user_pay_amount,
    card_user_pay_amount_delta,
    curr_card_click_rate,
    prev_card_click_rate,
    curr_card_click_to_pay_rate,
    prev_card_click_to_pay_rate
  FROM tmp_ads_douyin_card_week_new;

  RAISE NOTICE 'refresh_douyin_trade_sale_card_metrics_week completed, window: [% - %]', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_card_metrics_week(DATE, DATE)
IS '按周窗口刷新抖音商品卡指标（商品级 + 来源级），口径与 ads.all_trade_week_platform 同步。';

CREATE TABLE etl.douyin_trade_sale_card_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_trade_sale_card_metrics_week_refresh_state_id CHECK (id = 1)
);

INSERT INTO etl.douyin_trade_sale_card_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_douyin_trade_sale_card_metrics_week_incremental(
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
  INSERT INTO etl.douyin_trade_sale_card_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM ods.douyin_trade_sale_card_raw), TIMESTAMP '1970-01-01'),
    COALESCE((SELECT MAX(updated_at) FROM ods.douyin_trade_sale_card_detail_raw), TIMESTAMP '1970-01-01')
  )
  INTO v_source_updated_at;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_trade_sale_card_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_card_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;
    RETURN;
  END IF;

  PERFORM 1
  FROM ads.douyin_trade_sale_card_metrics_week
  LIMIT 1;

  IF NOT FOUND THEN
    CALL ads.refresh_douyin_trade_sale_card_metrics_week(NULL, NULL);

    SELECT
      MIN(as_of_date),
      MAX(as_of_date)
    INTO v_refresh_start, v_refresh_end
    FROM ads.douyin_trade_sale_card_metrics_week;

    UPDATE etl.douyin_trade_sale_card_metrics_week_refresh_state
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
    RAISE NOTICE 'refresh_douyin_trade_sale_card_metrics_week_incremental skipped, no source update';
    RETURN;
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX("date") FROM ods.douyin_trade_sale_card_raw), DATE '1970-01-01'),
    COALESCE((SELECT MAX(stat_date) FROM ods.douyin_trade_sale_card_detail_raw), DATE '1970-01-01')
  )
  INTO v_source_max_date;

  IF v_source_max_date <= DATE '1970-01-01' THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_card_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_douyin_trade_sale_card_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.douyin_trade_sale_card_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_card_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按水位增量刷新抖音商品卡周指标，默认回刷近 N 天窗口。';

CALL ads.refresh_douyin_trade_sale_card_metrics_week_incremental(14, TRUE);

COMMIT;
