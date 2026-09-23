BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_channel_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_trade_sale_channel_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.douyin_trade_sale_channel_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.douyin_trade_sale_channel_metrics_week;

CREATE TABLE ads.douyin_trade_sale_channel_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  channel_type VARCHAR(20) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  curr_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_channel_metrics_week PRIMARY KEY (week_period, channel_type),
  CONSTRAINT chk_douyin_trade_sale_channel_metrics_week_channel
    CHECK (channel_type IN ('live', 'shortvideo', 'card')),
  CONSTRAINT chk_douyin_trade_sale_channel_metrics_week_observed_days
    CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.douyin_trade_sale_channel_metrics_week IS 'ADS-抖音渠道周GMV指标（直播/短视频/商品卡），与 all_trade_week_platform 同期口径对齐。';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.week_period IS '周时间段，格式: 2026/2/7～2026/2/13';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.channel_type IS '渠道类型：live（直播）/shortvideo（短视频）/card（商品卡）';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.as_of_date IS '同期口径截止日期（与 ads.all_trade_week_platform 对齐）';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1）';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.curr_gmv IS '本周同期窗口渠道 GMV';
COMMENT ON COLUMN ads.douyin_trade_sale_channel_metrics_week.prev_gmv IS '上周同期窗口渠道 GMV（向前平移 7 天）';

CREATE INDEX idx_douyin_trade_sale_channel_metrics_week_channel
  ON ads.douyin_trade_sale_channel_metrics_week (channel_type);

CREATE FUNCTION ads.fn_touch_douyin_trade_sale_channel_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_trade_sale_channel_metrics_week_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_channel_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_channel_metrics_week_updated_at();

CREATE PROCEDURE ads.refresh_douyin_trade_sale_channel_metrics_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_affected_weeks INTEGER := 0;
  v_rebuilt_rows INTEGER := 0;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_live_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_card_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_raw does not exist';
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

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  IF to_regclass('pg_temp.tmp_ads_douyin_channel_week_scope') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_channel_week_scope';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_douyin_channel_week_daily') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_channel_week_daily';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_douyin_channel_week_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_channel_week_new';
  END IF;

  CREATE TEMP TABLE tmp_ads_douyin_channel_week_scope ON COMMIT DROP AS
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

  GET DIAGNOSTICS v_affected_weeks = ROW_COUNT;

  IF v_affected_weeks = 0 THEN
    RAISE NOTICE 'no douyin week scope rows in window [% - %], skipped', v_start_date, v_end_date;
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_ads_douyin_channel_week_daily ON COMMIT DROP AS
  SELECT
    src.channel_type,
    src.stat_date,
    SUM(src.gmv)::NUMERIC(18, 2) AS gmv
  FROM (
    SELECT
      'live'::VARCHAR(20) AS channel_type,
      DATE(live_src.live_start_time)::DATE AS stat_date,
      COALESCE(live_src.live_gmv, 0)::NUMERIC(18, 2) AS gmv
    FROM ods.douyin_trade_sale_live_raw live_src
    WHERE live_src.live_start_time IS NOT NULL
      AND DATE(live_src.live_start_time) BETWEEN (v_start_date - 13) AND v_end_date

    UNION ALL

    SELECT
      'shortvideo'::VARCHAR(20) AS channel_type,
      short_src.stat_date::DATE AS stat_date,
      COALESCE(short_src.user_pay_amount, 0)::NUMERIC(18, 2) AS gmv
    FROM ods.douyin_trade_sale_shortvideo_raw short_src
    WHERE short_src.stat_date BETWEEN (v_start_date - 13) AND v_end_date

    UNION ALL

    SELECT
      'card'::VARCHAR(20) AS channel_type,
      card_src."date"::DATE AS stat_date,
      COALESCE(card_src.card_user_pay_amount, 0)::NUMERIC(18, 2) AS gmv
    FROM ods.douyin_trade_sale_card_raw card_src
    WHERE card_src."date" BETWEEN (v_start_date - 13) AND v_end_date
  ) src
  GROUP BY src.channel_type, src.stat_date;

  CREATE TEMP TABLE tmp_ads_douyin_channel_week_new ON COMMIT DROP AS
  WITH channel_list AS (
    SELECT UNNEST(ARRAY['live', 'shortvideo', 'card']::VARCHAR[]) AS channel_type
  )
  SELECT
    ws.week_period,
    cl.channel_type,
    ws.as_of_date,
    ws.observed_days,
    COALESCE((
      SELECT SUM(d.gmv)::NUMERIC(18, 2)
      FROM tmp_ads_douyin_channel_week_daily d
      WHERE d.channel_type = cl.channel_type
        AND d.stat_date BETWEEN ws.week_start AND ws.as_of_date
    ), 0)::NUMERIC(18, 2) AS curr_gmv,
    COALESCE((
      SELECT SUM(d.gmv)::NUMERIC(18, 2)
      FROM tmp_ads_douyin_channel_week_daily d
      WHERE d.channel_type = cl.channel_type
        AND d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)
    ), 0)::NUMERIC(18, 2) AS prev_gmv
  FROM tmp_ads_douyin_channel_week_scope ws
  CROSS JOIN channel_list cl;

  DELETE FROM ads.douyin_trade_sale_channel_metrics_week tgt
  USING tmp_ads_douyin_channel_week_scope scope
  WHERE tgt.week_period = scope.week_period;

  INSERT INTO ads.douyin_trade_sale_channel_metrics_week (
    week_period,
    channel_type,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv
  )
  SELECT
    week_period,
    channel_type,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv
  FROM tmp_ads_douyin_channel_week_new;

  GET DIAGNOSTICS v_rebuilt_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_douyin_trade_sale_channel_metrics_week completed, rebuilt_rows: %, affected_weeks: %, window: [% - %]',
    v_rebuilt_rows,
    v_affected_weeks,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_channel_metrics_week(DATE, DATE)
IS '按周窗口刷新抖音渠道 GMV 周指标（live/shortvideo/card），与 ads.all_trade_week_platform 的 as_of_date 同步口径对齐。';

CREATE TABLE etl.douyin_trade_sale_channel_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_trade_sale_channel_metrics_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_trade_sale_channel_metrics_week_refresh_state IS '抖音渠道周 GMV 指标增量刷新水位状态表。';

INSERT INTO etl.douyin_trade_sale_channel_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(
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
  IF to_regclass('etl.douyin_trade_sale_channel_metrics_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.douyin_trade_sale_channel_metrics_week_refresh_state does not exist';
  END IF;

  INSERT INTO etl.douyin_trade_sale_channel_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    GREATEST(
      COALESCE((SELECT MAX(updated_at) FROM ods.douyin_trade_sale_live_raw), TIMESTAMP '1970-01-01'),
      COALESCE((SELECT MAX(updated_at) FROM ods.douyin_trade_sale_shortvideo_raw), TIMESTAMP '1970-01-01'),
      COALESCE((SELECT MAX(updated_at) FROM ods.douyin_trade_sale_card_raw), TIMESTAMP '1970-01-01')
    )
  INTO v_source_updated_at;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_trade_sale_channel_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_channel_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;

    RAISE NOTICE 'refresh_douyin_trade_sale_channel_metrics_week_incremental watermark initialized, source_updated_at: %',
      v_source_updated_at;
    RETURN;
  END IF;

  IF v_last_source_updated_at IS NOT NULL
     AND v_source_updated_at IS NOT NULL
     AND v_source_updated_at <= v_last_source_updated_at THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_channel_metrics_week_incremental skipped, no source update (last: %, current: %)',
      v_last_source_updated_at,
      v_source_updated_at;
    RETURN;
  END IF;

  SELECT
    GREATEST(
      COALESCE((SELECT MAX(DATE(live_start_time)) FROM ods.douyin_trade_sale_live_raw), DATE '1970-01-01'),
      COALESCE((SELECT MAX(stat_date) FROM ods.douyin_trade_sale_shortvideo_raw), DATE '1970-01-01'),
      COALESCE((SELECT MAX("date") FROM ods.douyin_trade_sale_card_raw), DATE '1970-01-01')
    )
  INTO v_source_max_date;

  IF v_source_max_date <= DATE '1970-01-01' THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_channel_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_douyin_trade_sale_channel_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.douyin_trade_sale_channel_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;

  RAISE NOTICE 'refresh_douyin_trade_sale_channel_metrics_week_incremental completed, source_updated_at: %, window: [% - %]',
    v_source_updated_at,
    v_refresh_start,
    v_refresh_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按水位增量刷新抖音渠道周 GMV 指标，默认回刷近 N 天窗口。';

CALL ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(14, TRUE);

COMMIT;
