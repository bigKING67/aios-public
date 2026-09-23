BEGIN;

ALTER TABLE ads.creator_live_trade_daily
  ADD COLUMN IF NOT EXISTS live_refund_order_count BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ads.creator_live_trade_daily.live_refund_order_count
IS '当日达人直播退款订单数（按 ODS live_refund_order_count 聚合）。';

ALTER TABLE ads.creator_live_trade_daily
  DROP CONSTRAINT IF EXISTS chk_creator_live_trade_daily_non_negative;

ALTER TABLE ads.creator_live_trade_daily
  ADD CONSTRAINT chk_creator_live_trade_daily_non_negative CHECK (
    live_session_count >= 0
    AND live_duration_minutes >= 0
    AND live_watch_user_count >= 0
    AND live_exposure_user_count >= 0
    AND live_product_click_user >= 0
    AND live_order_count >= 0
    AND live_refund_order_count >= 0
    AND live_buyer_count >= 0
    AND live_gmv >= 0
    AND live_user_pay_amount >= 0
    AND live_refund_amount >= 0
    AND live_ad_cost >= 0
  );

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
    live_refund_order_count,
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
IS '刷新直播达人日事实：按窗口重建 ads.creator_live_trade_daily。';

CALL ads.refresh_creator_live_trade_daily(NULL, NULL);

COMMIT;
