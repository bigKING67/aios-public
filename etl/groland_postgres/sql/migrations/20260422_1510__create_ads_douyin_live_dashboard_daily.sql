BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS ads.douyin_live_self_anchor_map (
  anchor_douyin_id TEXT PRIMARY KEY,
  anchor_nickname TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_live_self_anchor_map_anchor_id_non_empty
    CHECK (NULLIF(BTRIM(anchor_douyin_id), '') IS NOT NULL)
);

COMMENT ON TABLE ads.douyin_live_self_anchor_map IS '抖音直播看板-自播主播映射表（用于区分自播/达播口径）。';
COMMENT ON COLUMN ads.douyin_live_self_anchor_map.anchor_douyin_id IS '主播抖音ID（唯一键）。';
COMMENT ON COLUMN ads.douyin_live_self_anchor_map.anchor_nickname IS '主播名称（用于看板展示与核对）。';
COMMENT ON COLUMN ads.douyin_live_self_anchor_map.is_active IS '是否启用（false 时不参与自播匹配）。';
COMMENT ON COLUMN ads.douyin_live_self_anchor_map.note IS '备注信息（维护人、来源说明等）。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_live_self_anchor_map_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_douyin_live_self_anchor_map_updated_at ON ads.douyin_live_self_anchor_map;
CREATE TRIGGER trg_touch_douyin_live_self_anchor_map_updated_at
BEFORE UPDATE ON ads.douyin_live_self_anchor_map
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_self_anchor_map_updated_at();

INSERT INTO ads.douyin_live_self_anchor_map (
  anchor_douyin_id,
  anchor_nickname,
  is_active,
  note
)
VALUES
  ('79269712574', 'Groland个人护理直播间', TRUE, '初始化自播主播'),
  ('64304983942', 'Groland高岚品牌直播间', TRUE, '初始化自播主播')
ON CONFLICT (anchor_douyin_id) DO UPDATE
SET
  anchor_nickname = EXCLUDED.anchor_nickname,
  is_active = TRUE,
  note = EXCLUDED.note,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS ads.douyin_live_dashboard_daily (
  stat_date DATE NOT NULL,
  anchor_douyin_id TEXT NOT NULL,
  anchor_nickname TEXT NOT NULL DEFAULT '(未命名主播)',
  shop_id TEXT,
  shop_name TEXT,
  live_identity_type VARCHAR(20) NOT NULL,
  is_self_live BOOLEAN NOT NULL DEFAULT FALSE,
  is_influencer_live BOOLEAN NOT NULL DEFAULT FALSE,
  live_session_count INTEGER NOT NULL DEFAULT 0,
  live_duration_minutes BIGINT NOT NULL DEFAULT 0,
  live_watch_user_count BIGINT NOT NULL DEFAULT 0,
  live_order_count BIGINT NOT NULL DEFAULT 0,
  live_refund_order_count BIGINT NOT NULL DEFAULT 0,
  live_buyer_count BIGINT NOT NULL DEFAULT 0,
  live_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_max_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_live_dashboard_daily
    PRIMARY KEY (stat_date, anchor_douyin_id),
  CONSTRAINT chk_douyin_live_dashboard_daily_identity_type
    CHECK (live_identity_type IN ('self', 'influencer', 'unclassified')),
  CONSTRAINT chk_douyin_live_dashboard_daily_identity_consistency
    CHECK (
      (live_identity_type = 'self' AND is_self_live = TRUE AND is_influencer_live = FALSE)
      OR (live_identity_type = 'influencer' AND is_self_live = FALSE AND is_influencer_live = TRUE)
      OR (live_identity_type = 'unclassified' AND is_self_live = FALSE AND is_influencer_live = FALSE)
    ),
  CONSTRAINT chk_douyin_live_dashboard_daily_non_negative
    CHECK (
      live_session_count >= 0
      AND live_duration_minutes >= 0
      AND live_watch_user_count >= 0
      AND live_order_count >= 0
      AND live_refund_order_count >= 0
      AND live_buyer_count >= 0
      AND live_gmv >= 0
      AND live_refund_amount >= 0
    )
);

COMMENT ON TABLE ads.douyin_live_dashboard_daily IS '抖音直播看板日事实表（按日期+主播聚合，含自播/达播口径标签）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.anchor_douyin_id IS '主播抖音ID；空值行以空字符串存储，统一归类为未归类。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_identity_type IS '主播身份标签：self（自播）/influencer（达播）/unclassified（无主播ID）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.source_max_updated_at IS '当前聚合行覆盖的最大 ODS 更新时间。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_dashboard_daily_stat_date
  ON ads.douyin_live_dashboard_daily (stat_date);
COMMENT ON INDEX ads.idx_douyin_live_dashboard_daily_stat_date IS '按日期过滤索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_dashboard_daily_identity_date
  ON ads.douyin_live_dashboard_daily (live_identity_type, stat_date);
COMMENT ON INDEX ads.idx_douyin_live_dashboard_daily_identity_date IS '按身份类型+日期过滤索引（自播/达播区块查询）。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_dashboard_daily_anchor_date
  ON ads.douyin_live_dashboard_daily (anchor_douyin_id, stat_date DESC);
COMMENT ON INDEX ads.idx_douyin_live_dashboard_daily_anchor_date IS '按主播+日期窗口查询索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_live_dashboard_daily_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_douyin_live_dashboard_daily_updated_at ON ads.douyin_live_dashboard_daily;
CREATE TRIGGER trg_touch_douyin_live_dashboard_daily_updated_at
BEFORE UPDATE ON ads.douyin_live_dashboard_daily
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_dashboard_daily_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_dashboard_daily(
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

  IF to_regclass('ads.douyin_live_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_live_self_anchor_map does not exist';
  END IF;

  IF to_regclass('ads.douyin_live_dashboard_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_live_dashboard_daily does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(DATE(src.live_start_time))),
    COALESCE(p_end_date, MAX(DATE(src.live_start_time)))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_live_raw has no live_start_time rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_live_dashboard_daily
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  CREATE TEMP TABLE tmp_douyin_live_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_live_self_anchor_map m
  WHERE m.is_active = TRUE
    AND NULLIF(BTRIM(m.anchor_douyin_id), '') IS NOT NULL;

  INSERT INTO ads.douyin_live_dashboard_daily (
    stat_date,
    anchor_douyin_id,
    anchor_nickname,
    shop_id,
    shop_name,
    live_identity_type,
    is_self_live,
    is_influencer_live,
    live_session_count,
    live_duration_minutes,
    live_watch_user_count,
    live_order_count,
    live_refund_order_count,
    live_buyer_count,
    live_gmv,
    live_refund_amount,
    source_max_updated_at
  )
  WITH source_base AS (
    SELECT
      DATE(src.live_start_time) AS stat_date,
      COALESCE(NULLIF(BTRIM(src.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      NULLIF(BTRIM(src.anchor_nickname), '') AS anchor_nickname,
      NULLIF(BTRIM(src.shop_id), '') AS shop_id,
      NULLIF(BTRIM(src.shop_name), '') AS shop_name,
      COALESCE(src.live_duration_minutes, 0) AS live_duration_minutes,
      COALESCE(src.live_watch_user_count, 0) AS live_watch_user_count,
      COALESCE(src.live_order_count, 0) AS live_order_count,
      COALESCE(src.live_refund_order_count, 0) AS live_refund_order_count,
      COALESCE(src.live_buyer_count, 0) AS live_buyer_count,
      COALESCE(src.live_gmv, 0)::NUMERIC(18, 2) AS live_gmv,
      COALESCE(src.live_refund_amount, 0)::NUMERIC(18, 2) AS live_refund_amount,
      COALESCE(src.updated_at, src.created_at, src.live_start_time) AS source_updated_at
    FROM ods.douyin_trade_sale_live_raw src
    WHERE src.live_start_time IS NOT NULL
      AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  )
  SELECT
    sb.stat_date,
    sb.anchor_douyin_id,
    CASE
      WHEN sb.anchor_douyin_id = '' THEN '(缺失主播ID)'
      ELSE COALESCE(MAX(sb.anchor_nickname), '(未命名主播)')
    END AS anchor_nickname,
    COALESCE(MAX(sb.shop_id), '') AS shop_id,
    COALESCE(MAX(sb.shop_name), '(未命名店铺)') AS shop_name,
    CASE
      WHEN sb.anchor_douyin_id = '' THEN 'unclassified'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_live_self_anchor_map m
        WHERE m.anchor_douyin_id = sb.anchor_douyin_id
      ) THEN 'self'
      ELSE 'influencer'
    END AS live_identity_type,
    CASE
      WHEN sb.anchor_douyin_id <> ''
        AND EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sb.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_self_live,
    CASE
      WHEN sb.anchor_douyin_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sb.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_influencer_live,
    COUNT(*)::INTEGER AS live_session_count,
    SUM(sb.live_duration_minutes)::BIGINT AS live_duration_minutes,
    SUM(sb.live_watch_user_count)::BIGINT AS live_watch_user_count,
    SUM(sb.live_order_count)::BIGINT AS live_order_count,
    SUM(sb.live_refund_order_count)::BIGINT AS live_refund_order_count,
    SUM(sb.live_buyer_count)::BIGINT AS live_buyer_count,
    SUM(sb.live_gmv)::NUMERIC(18, 2) AS live_gmv,
    SUM(sb.live_refund_amount)::NUMERIC(18, 2) AS live_refund_amount,
    MAX(sb.source_updated_at) AS source_max_updated_at
  FROM source_base sb
  GROUP BY sb.stat_date, sb.anchor_douyin_id;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_live_dashboard_daily completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_dashboard_daily(DATE, DATE)
IS '按日期窗口刷新抖音直播看板日事实表，按主播ID输出自播/达播/未归类口径。';

CREATE TABLE IF NOT EXISTS etl.douyin_live_dashboard_daily_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_live_dashboard_daily_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_live_dashboard_daily_refresh_state IS '抖音直播看板日事实表增量刷新水位状态表。';

INSERT INTO etl.douyin_live_dashboard_daily_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_dashboard_daily_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.douyin_live_dashboard_daily_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_live_dashboard_daily_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.updated_at, src.created_at, src.live_start_time))
  INTO v_source_max_updated_at
  FROM ods.douyin_trade_sale_live_raw src;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_live_dashboard_daily_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(DATE(src.live_start_time)),
    MAX(DATE(src.live_start_time))
  INTO v_min_date, v_max_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL
    AND COALESCE(src.updated_at, src.created_at, src.live_start_time)
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(DATE(src.live_start_time))
  INTO v_fallback_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_douyin_live_dashboard_daily(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_live_dashboard_daily_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_dashboard_daily_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间增量刷新抖音直播看板日事实表，并固定回刷最近窗口，支持仅初始化水位。';

COMMIT;
