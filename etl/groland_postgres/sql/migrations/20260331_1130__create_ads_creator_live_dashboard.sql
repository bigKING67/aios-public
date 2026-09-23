BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_creator_live_dashboard_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_creator_live_dashboard(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_live_trade_daily(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_live_influencer_roster();
DROP FUNCTION IF EXISTS ads.fn_touch_creator_live_trade_daily_updated_at();
DROP FUNCTION IF EXISTS ads.fn_touch_creator_live_influencer_roster_updated_at();
DROP TABLE IF EXISTS etl.creator_live_dashboard_refresh_state;
DROP TABLE IF EXISTS ads.creator_live_trade_daily;
DROP TABLE IF EXISTS ads.creator_live_influencer_roster;

CREATE TABLE ads.creator_live_influencer_roster (
  id BIGSERIAL PRIMARY KEY,
  sequence_no INTEGER,
  influencer_name TEXT NOT NULL,
  influencer_id TEXT,
  influencer_id_norm TEXT,
  anchor_desc TEXT,
  anchor_level TEXT,
  platform TEXT,
  main_platform_fans TEXT,
  sales_30d TEXT,
  sales_90d TEXT,
  cooperation_status TEXT,
  cooperation_status_norm TEXT NOT NULL DEFAULT '未分类',
  cooperation_desc TEXT,
  owner_name TEXT,
  source_file_name TEXT NOT NULL,
  source_etl_loaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ads.creator_live_influencer_roster IS '直播达人看板名册快照（来自 ods.feishu_influencer_live 最新批次）。';
COMMENT ON COLUMN ads.creator_live_influencer_roster.influencer_id_norm IS '达人 ID 规范化字段：LOWER(BTRIM(influencer_id))。';
COMMENT ON COLUMN ads.creator_live_influencer_roster.cooperation_status_norm IS '合作状态规范化字段：空值统一为 未分类。';
COMMENT ON COLUMN ads.creator_live_influencer_roster.source_etl_loaded_at IS 'ODS 源批次 etl_loaded_at。';

CREATE INDEX idx_creator_live_influencer_roster_status
  ON ads.creator_live_influencer_roster (cooperation_status_norm, sequence_no, id);

CREATE INDEX idx_creator_live_influencer_roster_influencer_id_norm
  ON ads.creator_live_influencer_roster (influencer_id_norm);

CREATE FUNCTION ads.fn_touch_creator_live_influencer_roster_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_creator_live_influencer_roster_updated_at
BEFORE UPDATE ON ads.creator_live_influencer_roster
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_creator_live_influencer_roster_updated_at();

CREATE TABLE ads.creator_live_trade_daily (
  stat_date DATE NOT NULL,
  anchor_douyin_id TEXT NOT NULL,
  anchor_douyin_id_norm TEXT NOT NULL,
  anchor_nickname TEXT,
  shop_id TEXT,
  shop_name TEXT,
  live_session_count INTEGER NOT NULL DEFAULT 0,
  live_duration_minutes BIGINT NOT NULL DEFAULT 0,
  live_watch_user_count BIGINT NOT NULL DEFAULT 0,
  live_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  live_product_click_user BIGINT NOT NULL DEFAULT 0,
  live_order_count BIGINT NOT NULL DEFAULT 0,
  live_buyer_count BIGINT NOT NULL DEFAULT 0,
  live_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_max_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_creator_live_trade_daily PRIMARY KEY (stat_date, anchor_douyin_id),
  CONSTRAINT chk_creator_live_trade_daily_non_negative CHECK (
    live_session_count >= 0
    AND live_duration_minutes >= 0
    AND live_watch_user_count >= 0
    AND live_exposure_user_count >= 0
    AND live_product_click_user >= 0
    AND live_order_count >= 0
    AND live_buyer_count >= 0
    AND live_gmv >= 0
    AND live_user_pay_amount >= 0
    AND live_refund_amount >= 0
    AND live_ad_cost >= 0
  )
);

COMMENT ON TABLE ads.creator_live_trade_daily IS '直播达人看板日事实表（由 ods.douyin_trade_sale_live_raw 按达人+日期聚合）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.anchor_douyin_id_norm IS '直播主播 ID 规范化字段：LOWER(BTRIM(anchor_douyin_id))。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_session_count IS '当日达人直播场次数（按 ODS 行计数）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.source_max_updated_at IS '当日该达人聚合行覆盖的最大 ODS.updated_at。';

CREATE INDEX idx_creator_live_trade_daily_anchor_norm_date
  ON ads.creator_live_trade_daily (anchor_douyin_id_norm, stat_date DESC);

CREATE INDEX idx_creator_live_trade_daily_date
  ON ads.creator_live_trade_daily (stat_date);

CREATE FUNCTION ads.fn_touch_creator_live_trade_daily_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_creator_live_trade_daily_updated_at
BEFORE UPDATE ON ads.creator_live_trade_daily
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_creator_live_trade_daily_updated_at();

CREATE TABLE etl.creator_live_dashboard_refresh_state (
  state_key TEXT PRIMARY KEY,
  last_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE,
  last_live_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE etl.creator_live_dashboard_refresh_state IS '直播达人看板增量刷新水位状态（名册批次 + 直播事实双水位）。';

INSERT INTO etl.creator_live_dashboard_refresh_state (state_key)
VALUES ('default');

CREATE PROCEDURE ads.refresh_creator_live_influencer_roster()
LANGUAGE plpgsql
AS $$
DECLARE
  v_latest_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_inserted_rows INTEGER;
BEGIN
  IF to_regclass('ods.feishu_influencer_live') IS NULL THEN
    RAISE EXCEPTION 'source table ods.feishu_influencer_live does not exist';
  END IF;

  SELECT MAX(etl_loaded_at)
  INTO v_latest_loaded_at
  FROM ods.feishu_influencer_live;

  TRUNCATE TABLE ads.creator_live_influencer_roster;

  IF v_latest_loaded_at IS NULL THEN
    RAISE NOTICE 'refresh_creator_live_influencer_roster skipped, source table is empty';
    RETURN;
  END IF;

  INSERT INTO ads.creator_live_influencer_roster (
    sequence_no,
    influencer_name,
    influencer_id,
    influencer_id_norm,
    anchor_desc,
    anchor_level,
    platform,
    main_platform_fans,
    sales_30d,
    sales_90d,
    cooperation_status,
    cooperation_status_norm,
    cooperation_desc,
    owner_name,
    source_file_name,
    source_etl_loaded_at
  )
  SELECT
    src.sequence_no,
    COALESCE(NULLIF(BTRIM(src.influencer_name), ''), '(未命名达人)') AS influencer_name,
    NULLIF(BTRIM(src.influencer_id), '') AS influencer_id,
    NULLIF(LOWER(BTRIM(src.influencer_id)), '') AS influencer_id_norm,
    NULLIF(BTRIM(src.anchor_desc), '') AS anchor_desc,
    NULLIF(BTRIM(src.anchor_level), '') AS anchor_level,
    NULLIF(BTRIM(src.platform), '') AS platform,
    NULLIF(BTRIM(src.main_platform_fans), '') AS main_platform_fans,
    NULLIF(BTRIM(src.sales_30d), '') AS sales_30d,
    NULLIF(BTRIM(src.sales_90d), '') AS sales_90d,
    NULLIF(BTRIM(src.cooperation_status), '') AS cooperation_status,
    COALESCE(NULLIF(BTRIM(src.cooperation_status), ''), '未分类') AS cooperation_status_norm,
    NULLIF(BTRIM(src.cooperation_desc), '') AS cooperation_desc,
    NULLIF(BTRIM(src.owner_name), '') AS owner_name,
    src.source_file_name,
    src.etl_loaded_at
  FROM ods.feishu_influencer_live src
  WHERE src.etl_loaded_at = v_latest_loaded_at;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_live_influencer_roster completed, source_etl_loaded_at: %, inserted_rows: %',
    v_latest_loaded_at,
    v_inserted_rows;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_influencer_roster()
IS '刷新直播达人名册快照：仅保留 ods.feishu_influencer_live 最新批次。';

CREATE PROCEDURE ads.refresh_creator_live_trade_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_live_raw does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(DATE(src.live_start_time))),
    COALESCE(p_end_date, MAX(DATE(src.live_start_time)))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'refresh_creator_live_trade_daily skipped, source table has no live_start_time rows';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'invalid date range, start_date % is after end_date %', v_start_date, v_end_date;
  END IF;

  CREATE TEMP TABLE tmp_creator_live_trade_daily_new ON COMMIT DROP AS
  SELECT
    DATE(src.live_start_time) AS stat_date,
    BTRIM(src.anchor_douyin_id) AS anchor_douyin_id,
    LOWER(BTRIM(src.anchor_douyin_id)) AS anchor_douyin_id_norm,
    MAX(NULLIF(BTRIM(src.anchor_nickname), '')) AS anchor_nickname,
    MAX(NULLIF(BTRIM(src.shop_id), '')) AS shop_id,
    MAX(NULLIF(BTRIM(src.shop_name), '')) AS shop_name,
    COUNT(*)::INTEGER AS live_session_count,
    SUM(COALESCE(src.live_duration_minutes, 0))::BIGINT AS live_duration_minutes,
    SUM(COALESCE(src.live_watch_user_count, 0))::BIGINT AS live_watch_user_count,
    SUM(COALESCE(src.live_exposure_user_count, 0))::BIGINT AS live_exposure_user_count,
    SUM(COALESCE(src.live_product_click_user, 0))::BIGINT AS live_product_click_user,
    SUM(COALESCE(src.live_order_count, 0))::BIGINT AS live_order_count,
    SUM(COALESCE(src.live_buyer_count, 0))::BIGINT AS live_buyer_count,
    SUM(COALESCE(src.live_gmv, 0))::NUMERIC(18, 2) AS live_gmv,
    SUM(COALESCE(src.live_user_pay_amount, 0))::NUMERIC(18, 2) AS live_user_pay_amount,
    SUM(COALESCE(src.live_refund_amount, 0))::NUMERIC(18, 2) AS live_refund_amount,
    SUM(COALESCE(src.live_ad_cost, 0))::NUMERIC(18, 2) AS live_ad_cost,
    MAX(src.updated_at) AS source_max_updated_at
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL
    AND NULLIF(BTRIM(src.anchor_douyin_id), '') IS NOT NULL
    AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  GROUP BY DATE(src.live_start_time), BTRIM(src.anchor_douyin_id), LOWER(BTRIM(src.anchor_douyin_id));

  DELETE FROM ads.creator_live_trade_daily t
  WHERE t.stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.creator_live_trade_daily (
    stat_date,
    anchor_douyin_id,
    anchor_douyin_id_norm,
    anchor_nickname,
    shop_id,
    shop_name,
    live_session_count,
    live_duration_minutes,
    live_watch_user_count,
    live_exposure_user_count,
    live_product_click_user,
    live_order_count,
    live_buyer_count,
    live_gmv,
    live_user_pay_amount,
    live_refund_amount,
    live_ad_cost,
    source_max_updated_at
  )
  SELECT
    n.stat_date,
    n.anchor_douyin_id,
    n.anchor_douyin_id_norm,
    n.anchor_nickname,
    n.shop_id,
    n.shop_name,
    n.live_session_count,
    n.live_duration_minutes,
    n.live_watch_user_count,
    n.live_exposure_user_count,
    n.live_product_click_user,
    n.live_order_count,
    n.live_buyer_count,
    n.live_gmv,
    n.live_user_pay_amount,
    n.live_refund_amount,
    n.live_ad_cost,
    n.source_max_updated_at
  FROM tmp_creator_live_trade_daily_new n;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_live_trade_daily completed, deleted_rows: %, inserted_rows: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_trade_daily(DATE, DATE)
IS '刷新直播达人日事实：按窗口重建 ads.creator_live_trade_daily。';

CREATE PROCEDURE ads.refresh_creator_live_dashboard(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
  CALL ads.refresh_creator_live_influencer_roster();
  CALL ads.refresh_creator_live_trade_daily(p_start_date, p_end_date);
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_dashboard(DATE, DATE)
IS '刷新直播达人看板底表：先刷新名册，再刷新日事实窗口。';

CREATE PROCEDURE ads.refresh_creator_live_dashboard_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER;
  v_lock_acquired BOOLEAN := FALSE;
  v_latest_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_latest_live_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_live_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_need_refresh_roster BOOLEAN := FALSE;
  v_need_refresh_trade BOOLEAN := FALSE;
  v_changed_min_date DATE;
  v_changed_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
BEGIN
  IF to_regclass('etl.creator_live_dashboard_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.creator_live_dashboard_refresh_state does not exist';
  END IF;

  v_fallback_window_days := GREATEST(COALESCE(p_fallback_window_days, 14), 1);

  v_lock_acquired := pg_try_advisory_lock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'refresh_creator_live_dashboard_incremental skipped, advisory lock busy';
    RETURN;
  END IF;

  BEGIN
    SELECT
      s.last_feishu_loaded_at,
      s.last_live_updated_at
    INTO v_prev_feishu_loaded_at, v_prev_live_updated_at
    FROM etl.creator_live_dashboard_refresh_state s
    WHERE s.state_key = 'default'
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO etl.creator_live_dashboard_refresh_state (state_key)
      VALUES ('default')
      ON CONFLICT (state_key) DO NOTHING;

      SELECT
        s.last_feishu_loaded_at,
        s.last_live_updated_at
      INTO v_prev_feishu_loaded_at, v_prev_live_updated_at
      FROM etl.creator_live_dashboard_refresh_state s
      WHERE s.state_key = 'default'
      FOR UPDATE;
    END IF;

    SELECT MAX(src.etl_loaded_at)
    INTO v_latest_feishu_loaded_at
    FROM ods.feishu_influencer_live src;

    SELECT MAX(src.updated_at)
    INTO v_latest_live_updated_at
    FROM ods.douyin_trade_sale_live_raw src;

    IF p_init_watermark_only THEN
      UPDATE etl.creator_live_dashboard_refresh_state
      SET
        last_feishu_loaded_at = v_latest_feishu_loaded_at,
        last_live_updated_at = v_latest_live_updated_at,
        last_refresh_at = NOW(),
        updated_at = NOW()
      WHERE state_key = 'default';

      RAISE NOTICE
        'refresh_creator_live_dashboard_incremental watermark initialized, last_feishu_loaded_at: %, last_live_updated_at: %',
        v_latest_feishu_loaded_at,
        v_latest_live_updated_at;

      PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
      RETURN;
    END IF;

    v_need_refresh_roster :=
      v_latest_feishu_loaded_at IS NOT NULL
      AND (v_prev_feishu_loaded_at IS NULL OR v_latest_feishu_loaded_at > v_prev_feishu_loaded_at);

    v_need_refresh_trade :=
      v_latest_live_updated_at IS NOT NULL
      AND (v_prev_live_updated_at IS NULL OR v_latest_live_updated_at > v_prev_live_updated_at);

    IF v_need_refresh_trade THEN
      IF v_prev_live_updated_at IS NULL THEN
        SELECT
          MIN(DATE(src.live_start_time)),
          MAX(DATE(src.live_start_time))
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_live_raw src
        WHERE src.live_start_time IS NOT NULL;
      ELSE
        SELECT
          MIN(DATE(src.live_start_time)),
          MAX(DATE(src.live_start_time))
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_live_raw src
        WHERE src.live_start_time IS NOT NULL
          AND src.updated_at > v_prev_live_updated_at;
      END IF;

      IF v_changed_max_date IS NOT NULL THEN
        v_refresh_end_date := v_changed_max_date;
        v_refresh_start_date := LEAST(v_changed_min_date, v_changed_max_date - (v_fallback_window_days - 1));
      END IF;

      IF v_refresh_start_date IS NOT NULL AND v_refresh_end_date IS NOT NULL THEN
        CALL ads.refresh_creator_live_trade_daily(v_refresh_start_date, v_refresh_end_date);
      END IF;
    END IF;

    IF v_need_refresh_roster THEN
      CALL ads.refresh_creator_live_influencer_roster();
    END IF;

    UPDATE etl.creator_live_dashboard_refresh_state
    SET
      last_feishu_loaded_at = COALESCE(v_latest_feishu_loaded_at, last_feishu_loaded_at),
      last_live_updated_at = COALESCE(v_latest_live_updated_at, last_live_updated_at),
      last_refresh_at = NOW(),
      last_refresh_start_date = v_refresh_start_date,
      last_refresh_end_date = v_refresh_end_date,
      updated_at = NOW()
    WHERE state_key = 'default';

    RAISE NOTICE
      'refresh_creator_live_dashboard_incremental completed, roster_refreshed: %, trade_refreshed: %, window: [% - %], fallback_window_days: %',
      v_need_refresh_roster,
      v_need_refresh_trade,
      COALESCE(v_refresh_start_date::TEXT, 'N/A'),
      COALESCE(v_refresh_end_date::TEXT, 'N/A'),
      v_fallback_window_days;

    PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
  EXCEPTION
    WHEN OTHERS THEN
      IF v_lock_acquired THEN
        PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
      END IF;
      RAISE;
  END;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_dashboard_incremental(INTEGER, BOOLEAN)
IS '直播达人看板增量刷新：双水位驱动（名册 etl_loaded_at + 直播事实 updated_at）。';

CALL ads.refresh_creator_live_dashboard(NULL, NULL);
CALL ads.refresh_creator_live_dashboard_incremental(14, TRUE);

COMMIT;
