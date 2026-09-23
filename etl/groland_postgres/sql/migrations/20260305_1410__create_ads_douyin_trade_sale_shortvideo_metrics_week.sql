BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_shortvideo_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_trade_sale_shortvideo_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.douyin_trade_sale_shortvideo_metrics_week;

CREATE TABLE ads.douyin_trade_sale_shortvideo_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  video_id VARCHAR(100) NOT NULL,
  author_douyin_id VARCHAR(100) NOT NULL,
  video_title VARCHAR(500),
  author_nickname VARCHAR(200),
  product_id VARCHAR(100),
  publish_time TIMESTAMP WITHOUT TIME ZONE,
  is_promoted VARCHAR(10),
  play_url TEXT,
  curr_video_view_count BIGINT NOT NULL DEFAULT 0,
  prev_video_view_count BIGINT NOT NULL DEFAULT 0,
  curr_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  user_pay_amount_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_shortvideo_metrics_week
    PRIMARY KEY (week_period, video_id, author_douyin_id),
  CONSTRAINT chk_douyin_trade_sale_shortvideo_metrics_week_observed_days
    CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.douyin_trade_sale_shortvideo_metrics_week IS 'ADS-抖音短视频内容周指标（用于周报短视频内容定位）。';
COMMENT ON COLUMN ads.douyin_trade_sale_shortvideo_metrics_week.user_pay_amount_delta IS '短视频 GMV 增量（curr_user_pay_amount - prev_user_pay_amount）';

CREATE INDEX idx_douyin_trade_sale_shortvideo_metrics_week_author
  ON ads.douyin_trade_sale_shortvideo_metrics_week (author_douyin_id, curr_user_pay_amount DESC);

CREATE FUNCTION ads.fn_touch_douyin_trade_sale_shortvideo_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_trade_sale_shortvideo_metrics_week_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_shortvideo_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_shortvideo_metrics_week_updated_at();

CREATE PROCEDURE ads.refresh_douyin_trade_sale_shortvideo_metrics_week(
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

  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
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

  CREATE TEMP TABLE tmp_ads_douyin_shortvideo_week_scope ON COMMIT DROP AS
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

  CREATE TEMP TABLE tmp_ads_douyin_shortvideo_week_curr ON COMMIT DROP AS
  SELECT
    ws.week_period,
    ws.as_of_date,
    ws.observed_days,
    COALESCE(src.video_id, '') AS video_id,
    COALESCE(src.author_douyin_id, '') AS author_douyin_id,
    COALESCE(MAX(NULLIF(BTRIM(src.video_title), '')), '(未命名短视频)') AS video_title,
    COALESCE(MAX(NULLIF(BTRIM(src.author_nickname), '')), '(未知达人)') AS author_nickname,
    COALESCE(MAX(src.product_id), '--') AS product_id,
    MAX(src.publish_time) AS publish_time,
    COALESCE(MAX(src.is_promoted), '') AS is_promoted,
    MAX(src.play_url) AS play_url,
    COALESCE(SUM(COALESCE(src.video_view_count, 0)), 0)::BIGINT AS curr_video_view_count,
    COALESCE(SUM(COALESCE(src.user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_user_pay_amount,
    COALESCE(SUM(COALESCE(src.refund_amount, 0)), 0)::NUMERIC(18, 2) AS curr_refund_amount,
    COALESCE(SUM(COALESCE(src.live_room_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_live_room_pay_amount,
    COALESCE(SUM(COALESCE(src.search_after_view_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_search_after_view_pay_amount,
    COALESCE(SUM(COALESCE(src.shop_page_pay_amount, 0)), 0)::NUMERIC(18, 2) AS curr_shop_page_pay_amount
  FROM ods.douyin_trade_sale_shortvideo_raw src
  JOIN tmp_ads_douyin_shortvideo_week_scope ws
    ON src.stat_date BETWEEN ws.week_start AND ws.as_of_date
  WHERE src.stat_date BETWEEN (v_start_date - 13) AND v_end_date
  GROUP BY ws.week_period, ws.as_of_date, ws.observed_days, COALESCE(src.video_id, ''), COALESCE(src.author_douyin_id, '');

  CREATE TEMP TABLE tmp_ads_douyin_shortvideo_week_prev ON COMMIT DROP AS
  SELECT
    ws.week_period,
    COALESCE(src.video_id, '') AS video_id,
    COALESCE(src.author_douyin_id, '') AS author_douyin_id,
    COALESCE(SUM(COALESCE(src.video_view_count, 0)), 0)::BIGINT AS prev_video_view_count,
    COALESCE(SUM(COALESCE(src.user_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_user_pay_amount,
    COALESCE(SUM(COALESCE(src.refund_amount, 0)), 0)::NUMERIC(18, 2) AS prev_refund_amount,
    COALESCE(SUM(COALESCE(src.live_room_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_live_room_pay_amount,
    COALESCE(SUM(COALESCE(src.search_after_view_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_search_after_view_pay_amount,
    COALESCE(SUM(COALESCE(src.shop_page_pay_amount, 0)), 0)::NUMERIC(18, 2) AS prev_shop_page_pay_amount
  FROM ods.douyin_trade_sale_shortvideo_raw src
  JOIN tmp_ads_douyin_shortvideo_week_scope ws
    ON src.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)
  WHERE src.stat_date BETWEEN (v_start_date - 20) AND (v_end_date - 7)
  GROUP BY ws.week_period, COALESCE(src.video_id, ''), COALESCE(src.author_douyin_id, '');

  CREATE TEMP TABLE tmp_ads_douyin_shortvideo_week_new ON COMMIT DROP AS
  SELECT
    c.week_period,
    c.as_of_date,
    c.observed_days,
    c.video_id,
    c.author_douyin_id,
    c.video_title,
    c.author_nickname,
    c.product_id,
    c.publish_time,
    c.is_promoted,
    c.play_url,
    c.curr_video_view_count,
    COALESCE(p.prev_video_view_count, 0)::BIGINT AS prev_video_view_count,
    c.curr_user_pay_amount,
    COALESCE(p.prev_user_pay_amount, 0)::NUMERIC(18, 2) AS prev_user_pay_amount,
    (c.curr_user_pay_amount - COALESCE(p.prev_user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount_delta,
    c.curr_refund_amount,
    COALESCE(p.prev_refund_amount, 0)::NUMERIC(18, 2) AS prev_refund_amount,
    c.curr_live_room_pay_amount,
    COALESCE(p.prev_live_room_pay_amount, 0)::NUMERIC(18, 2) AS prev_live_room_pay_amount,
    c.curr_search_after_view_pay_amount,
    COALESCE(p.prev_search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS prev_search_after_view_pay_amount,
    c.curr_shop_page_pay_amount,
    COALESCE(p.prev_shop_page_pay_amount, 0)::NUMERIC(18, 2) AS prev_shop_page_pay_amount
  FROM tmp_ads_douyin_shortvideo_week_curr c
  LEFT JOIN tmp_ads_douyin_shortvideo_week_prev p
    ON p.week_period = c.week_period
   AND p.video_id = c.video_id
   AND p.author_douyin_id = c.author_douyin_id;

  DELETE FROM ads.douyin_trade_sale_shortvideo_metrics_week t
  USING tmp_ads_douyin_shortvideo_week_scope ws
  WHERE t.week_period = ws.week_period;

  INSERT INTO ads.douyin_trade_sale_shortvideo_metrics_week (
    week_period,
    as_of_date,
    observed_days,
    video_id,
    author_douyin_id,
    video_title,
    author_nickname,
    product_id,
    publish_time,
    is_promoted,
    play_url,
    curr_video_view_count,
    prev_video_view_count,
    curr_user_pay_amount,
    prev_user_pay_amount,
    user_pay_amount_delta,
    curr_refund_amount,
    prev_refund_amount,
    curr_live_room_pay_amount,
    prev_live_room_pay_amount,
    curr_search_after_view_pay_amount,
    prev_search_after_view_pay_amount,
    curr_shop_page_pay_amount,
    prev_shop_page_pay_amount
  )
  SELECT
    week_period,
    as_of_date,
    observed_days,
    video_id,
    author_douyin_id,
    video_title,
    author_nickname,
    product_id,
    publish_time,
    is_promoted,
    play_url,
    curr_video_view_count,
    prev_video_view_count,
    curr_user_pay_amount,
    prev_user_pay_amount,
    user_pay_amount_delta,
    curr_refund_amount,
    prev_refund_amount,
    curr_live_room_pay_amount,
    prev_live_room_pay_amount,
    curr_search_after_view_pay_amount,
    prev_search_after_view_pay_amount,
    curr_shop_page_pay_amount,
    prev_shop_page_pay_amount
  FROM tmp_ads_douyin_shortvideo_week_new;

  RAISE NOTICE 'refresh_douyin_trade_sale_shortvideo_metrics_week completed, window: [% - %]', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_shortvideo_metrics_week(DATE, DATE)
IS '按周窗口刷新抖音短视频内容指标，口径与 ads.all_trade_week_platform 的 as_of_date/observed_days 对齐。';

CREATE TABLE etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_trade_sale_shortvideo_metrics_week_refresh_state_id CHECK (id = 1)
);

INSERT INTO etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(
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
  INSERT INTO etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(MAX(updated_at), TIMESTAMP '1970-01-01')
  INTO v_source_updated_at
  FROM ods.douyin_trade_sale_shortvideo_raw;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;
    RETURN;
  END IF;

  PERFORM 1
  FROM ads.douyin_trade_sale_shortvideo_metrics_week
  LIMIT 1;

  IF NOT FOUND THEN
    CALL ads.refresh_douyin_trade_sale_shortvideo_metrics_week(NULL, NULL);

    SELECT
      MIN(as_of_date),
      MAX(as_of_date)
    INTO v_refresh_start, v_refresh_end
    FROM ads.douyin_trade_sale_shortvideo_metrics_week;

    UPDATE etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state
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
    RAISE NOTICE 'refresh_douyin_trade_sale_shortvideo_metrics_week_incremental skipped, no source update';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(stat_date), DATE '1970-01-01')
  INTO v_source_max_date
  FROM ods.douyin_trade_sale_shortvideo_raw;

  IF v_source_max_date <= DATE '1970-01-01' THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_shortvideo_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_douyin_trade_sale_shortvideo_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按水位增量刷新抖音短视频内容周指标，默认回刷近 N 天窗口。';

CALL ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(14, TRUE);

COMMIT;
