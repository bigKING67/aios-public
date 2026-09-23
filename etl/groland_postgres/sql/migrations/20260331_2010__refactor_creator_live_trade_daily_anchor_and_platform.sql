BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'creator_live_trade_daily'
      AND column_name = 'anchor_douyin_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'creator_live_trade_daily'
      AND column_name = 'anchor_id'
  ) THEN
    EXECUTE 'ALTER TABLE ads.creator_live_trade_daily RENAME COLUMN anchor_douyin_id TO anchor_id';
  END IF;
END
$$;

ALTER TABLE ads.creator_live_trade_daily
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE ads.creator_live_trade_daily
SET platform = '抖音'
WHERE platform IS NULL OR BTRIM(platform) = '';

ALTER TABLE ads.creator_live_trade_daily
  ALTER COLUMN platform SET DEFAULT '抖音',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE ads.creator_live_trade_daily
  DROP COLUMN IF EXISTS anchor_douyin_id_norm;

ALTER TABLE ads.creator_live_trade_daily
  DROP CONSTRAINT IF EXISTS pk_creator_live_trade_daily;

ALTER TABLE ads.creator_live_trade_daily
  ADD CONSTRAINT pk_creator_live_trade_daily PRIMARY KEY (platform, stat_date, anchor_id);

DROP INDEX IF EXISTS ads.idx_creator_live_trade_daily_anchor_norm_date;
DROP INDEX IF EXISTS ads.idx_creator_live_trade_daily_anchor_date_norm;
DROP INDEX IF EXISTS ads.idx_creator_live_trade_daily_platform_date;

CREATE INDEX IF NOT EXISTS idx_creator_live_trade_daily_anchor_date_norm
  ON ads.creator_live_trade_daily ((LOWER(BTRIM(anchor_id))), stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_creator_live_trade_daily_platform_date
  ON ads.creator_live_trade_daily (platform, stat_date DESC);

COMMENT ON TABLE ads.creator_live_trade_daily IS '直播达人看板日事实表（当前由抖音 ODS 按平台+主播+日期聚合，后续可并入淘宝直播/小红书直播）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.platform IS '直播平台（如：抖音、天猫、小红书）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.stat_date IS '直播日期（按直播开始时间取 DATE）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.anchor_id IS '主播ID（平台内主播唯一标识，当前映射自 ODS.anchor_douyin_id）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.anchor_nickname IS '主播昵称（同平台同主播当日取非空最大值）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.shop_id IS '店铺ID（同平台同主播当日取非空最大值）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.shop_name IS '店铺名称（同平台同主播当日取非空最大值）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_session_count IS '当日直播场次数（按 ODS 行计数）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_duration_minutes IS '当日直播时长（分钟）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_watch_user_count IS '当日直播观看人数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_exposure_user_count IS '当日直播曝光人数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_product_click_user IS '当日直播商品点击人数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_order_count IS '当日直播成交订单数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_refund_order_count IS '当日直播退款订单数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_buyer_count IS '当日直播成交人数。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_gmv IS '当日直播成交金额（GMV）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_user_pay_amount IS '当日直播支付金额（支付口径）。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_refund_amount IS '当日直播退款金额。';
COMMENT ON COLUMN ads.creator_live_trade_daily.live_ad_cost IS '当日直播投流成本。';
COMMENT ON COLUMN ads.creator_live_trade_daily.source_max_updated_at IS '当日聚合行覆盖的最大 ODS.updated_at。';
COMMENT ON COLUMN ads.creator_live_trade_daily.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.creator_live_trade_daily.updated_at IS '记录更新时间。';

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_trade_daily(
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
    '抖音'::TEXT AS platform,
    DATE(src.live_start_time) AS stat_date,
    BTRIM(src.anchor_douyin_id) AS anchor_id,
    MAX(NULLIF(BTRIM(src.anchor_nickname), '')) AS anchor_nickname,
    MAX(NULLIF(BTRIM(src.shop_id), '')) AS shop_id,
    MAX(NULLIF(BTRIM(src.shop_name), '')) AS shop_name,
    COUNT(*)::INTEGER AS live_session_count,
    SUM(COALESCE(src.live_duration_minutes, 0))::BIGINT AS live_duration_minutes,
    SUM(COALESCE(src.live_watch_user_count, 0))::BIGINT AS live_watch_user_count,
    SUM(COALESCE(src.live_exposure_user_count, 0))::BIGINT AS live_exposure_user_count,
    SUM(COALESCE(src.live_product_click_user, 0))::BIGINT AS live_product_click_user,
    SUM(COALESCE(src.live_order_count, 0))::BIGINT AS live_order_count,
    SUM(COALESCE(src.live_refund_order_count, 0))::BIGINT AS live_refund_order_count,
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
  GROUP BY '抖音'::TEXT, DATE(src.live_start_time), BTRIM(src.anchor_douyin_id);

  DELETE FROM ads.creator_live_trade_daily t
  WHERE t.platform = '抖音'
    AND t.stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.creator_live_trade_daily (
    platform,
    stat_date,
    anchor_id,
    anchor_nickname,
    shop_id,
    shop_name,
    live_session_count,
    live_duration_minutes,
    live_watch_user_count,
    live_exposure_user_count,
    live_product_click_user,
    live_order_count,
    live_refund_order_count,
    live_buyer_count,
    live_gmv,
    live_user_pay_amount,
    live_refund_amount,
    live_ad_cost,
    source_max_updated_at
  )
  SELECT
    n.platform,
    n.stat_date,
    n.anchor_id,
    n.anchor_nickname,
    n.shop_id,
    n.shop_name,
    n.live_session_count,
    n.live_duration_minutes,
    n.live_watch_user_count,
    n.live_exposure_user_count,
    n.live_product_click_user,
    n.live_order_count,
    n.live_refund_order_count,
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
IS '刷新直播达人日事实（按窗口覆盖）：当前写入抖音平台，后续可扩展天猫/小红书来源。';

CALL ads.refresh_creator_live_trade_daily(NULL, NULL);

COMMIT;
