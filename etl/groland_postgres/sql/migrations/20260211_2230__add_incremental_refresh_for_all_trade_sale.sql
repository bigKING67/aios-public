BEGIN;

CREATE SCHEMA IF NOT EXISTS etl;
CREATE SCHEMA IF NOT EXISTS dwd;

CREATE TABLE IF NOT EXISTS etl.all_trade_sale_refresh_state (
  platform VARCHAR(20) PRIMARY KEY,
  last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_all_trade_sale_refresh_state_platform CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs'))
);

INSERT INTO etl.all_trade_sale_refresh_state (platform)
VALUES
  ('douyin'),
  ('jd'),
  ('taobao'),
  ('wx'),
  ('xhs')
ON CONFLICT (platform) DO NOTHING;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_platform(VARCHAR, DATE, DATE);

CREATE PROCEDURE dwd.refresh_all_trade_sale_platform(
  IN p_platform VARCHAR(20),
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_platform NOT IN ('douyin', 'jd', 'taobao', 'wx', 'xhs') THEN
    RAISE EXCEPTION 'unsupported platform: %', p_platform;
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date must both be provided';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) cannot be greater than p_end_date (%)', p_start_date, p_end_date;
  END IF;

  DELETE FROM dwd.all_trade_sale
  WHERE platform = p_platform
    AND "date" BETWEEN p_start_date AND p_end_date;

  IF p_platform = 'douyin' THEN
    INSERT INTO dwd.all_trade_sale (
      platform,
      shop_name,
      shop_id,
      "date",
      gmv,
      order_count,
      buyer_count,
      refund_amount
    )
    SELECT
      'douyin' AS platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      stat_date AS "date",
      SUM(COALESCE(user_pay_amount, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount
    FROM ods.douyin_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;

  ELSIF p_platform = 'jd' THEN
    INSERT INTO dwd.all_trade_sale (
      platform,
      shop_name,
      shop_id,
      "date",
      gmv,
      order_count,
      buyer_count,
      refund_amount
    )
    SELECT
      'jd' AS platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      stat_date AS "date",
      SUM(COALESCE(gmv, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
    FROM ods.jd_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;

  ELSIF p_platform = 'taobao' THEN
    INSERT INTO dwd.all_trade_sale (
      platform,
      shop_name,
      shop_id,
      "date",
      gmv,
      order_count,
      buyer_count,
      refund_amount
    )
    SELECT
      'taobao' AS platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      stat_date AS "date",
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(pay_parent_order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
    FROM ods.taobao_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;

  ELSIF p_platform = 'wx' THEN
    INSERT INTO dwd.all_trade_sale (
      platform,
      shop_name,
      shop_id,
      "date",
      gmv,
      order_count,
      buyer_count,
      refund_amount
    )
    SELECT
      'wx' AS platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      stat_date AS "date",
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(pay_order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
    FROM ods.wx_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;

  ELSE
    INSERT INTO dwd.all_trade_sale (
      platform,
      shop_name,
      shop_id,
      "date",
      gmv,
      order_count,
      buyer_count,
      refund_amount
    )
    SELECT
      'xhs' AS platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      stat_date AS "date",
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(pay_order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
    FROM ods.xhs_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  END IF;
END;
$$;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_incremental(INTEGER, BOOLEAN);

CREATE PROCEDURE dwd.refresh_all_trade_sale_incremental(
  IN p_fallback_window_days INTEGER DEFAULT 7,
  IN p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_platform VARCHAR(20);
  v_last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
  v_fallback_start_date DATE;
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'p_fallback_window_days must be greater than 0';
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

  FOR v_platform IN
    SELECT platform
    FROM etl.all_trade_sale_refresh_state
    ORDER BY platform
  LOOP
    SELECT last_ods_updated_at
    INTO v_last_ods_updated_at
    FROM etl.all_trade_sale_refresh_state
    WHERE platform = v_platform
    FOR UPDATE;

    v_min_date := NULL;
    v_max_date := NULL;
    v_max_updated_at := NULL;

    IF p_init_watermark_only THEN
      IF v_platform = 'douyin' THEN
        SELECT
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.douyin_trade_sale_raw;
      ELSIF v_platform = 'jd' THEN
        SELECT
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.jd_trade_sale_raw;
      ELSIF v_platform = 'taobao' THEN
        SELECT
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.taobao_trade_sale_raw;
      ELSIF v_platform = 'wx' THEN
        SELECT
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.wx_trade_sale_raw;
      ELSE
        SELECT
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.xhs_trade_sale_raw;
      END IF;

      IF v_max_updated_at IS NOT NULL THEN
        UPDATE etl.all_trade_sale_refresh_state
        SET
          last_ods_updated_at = v_max_updated_at,
          updated_at = v_now
        WHERE platform = v_platform;
      END IF;

      CONTINUE;
    END IF;

    IF v_platform = 'douyin' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO
        v_min_date,
        v_max_date,
        v_max_updated_at
      FROM ods.douyin_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

    ELSIF v_platform = 'jd' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO
        v_min_date,
        v_max_date,
        v_max_updated_at
      FROM ods.jd_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

    ELSIF v_platform = 'taobao' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO
        v_min_date,
        v_max_date,
        v_max_updated_at
      FROM ods.taobao_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

    ELSIF v_platform = 'wx' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO
        v_min_date,
        v_max_date,
        v_max_updated_at
      FROM ods.wx_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

    ELSE
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO
        v_min_date,
        v_max_date,
        v_max_updated_at
      FROM ods.xhs_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    END IF;

    IF v_min_date IS NULL OR v_max_date IS NULL THEN
      RAISE NOTICE 'platform % has no ODS updates since %, skipped', v_platform, v_last_ods_updated_at;
      CONTINUE;
    END IF;

    IF v_min_date > v_fallback_start_date THEN
      v_min_date := v_fallback_start_date;
    END IF;

    CALL dwd.refresh_all_trade_sale_platform(v_platform, v_min_date, v_max_date);

    UPDATE etl.all_trade_sale_refresh_state
    SET
      last_ods_updated_at = GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at)),
      last_refresh_at = v_now,
      last_refresh_start_date = v_min_date,
      last_refresh_end_date = v_max_date,
      updated_at = v_now
    WHERE platform = v_platform;
  END LOOP;
END;
$$;

COMMIT;
