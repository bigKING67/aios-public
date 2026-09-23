BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_platform(VARCHAR, DATE, DATE);

CREATE PROCEDURE dwd.refresh_all_trade_sale_platform(
  IN p_platform VARCHAR(20),
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_rows BIGINT := 0;
  v_inserted_rows BIGINT := 0;
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
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

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

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'platform %, window [% - %], deleted %, inserted %',
    p_platform,
    p_start_date,
    p_end_date,
    v_deleted_rows,
    v_inserted_rows;
END;
$$;

COMMIT;
