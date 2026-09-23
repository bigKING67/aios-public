BEGIN;

CREATE SCHEMA IF NOT EXISTS dwd;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale(DATE, DATE);

CREATE PROCEDURE dwd.refresh_all_trade_sale(
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_rows BIGINT := 0;
  v_inserted_rows BIGINT := 0;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date must both be provided';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) cannot be greater than p_end_date (%)', p_start_date, p_end_date;
  END IF;

  IF to_regclass('dwd.all_trade_sale') IS NULL THEN
    RAISE EXCEPTION 'target table dwd.all_trade_sale does not exist';
  END IF;

  DELETE FROM dwd.all_trade_sale
  WHERE "date" BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  WITH source_union AS (
    SELECT
      'douyin'::VARCHAR(20) AS platform,
      shop_name,
      shop_id,
      stat_date AS trade_date,
      COALESCE(user_pay_amount, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(order_count, 0)::INTEGER AS order_count,
      COALESCE(buyer_count, 0)::INTEGER AS buyer_count,
      COALESCE(refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount
    FROM ods.douyin_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date

    UNION ALL

    SELECT
      'jd'::VARCHAR(20) AS platform,
      shop_name,
      shop_id,
      stat_date AS trade_date,
      COALESCE(gmv, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(order_count, 0)::INTEGER AS order_count,
      COALESCE(buyer_count, 0)::INTEGER AS buyer_count,
      COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
    FROM ods.jd_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date

    UNION ALL

    SELECT
      'taobao'::VARCHAR(20) AS platform,
      shop_name,
      shop_id,
      stat_date AS trade_date,
      COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(pay_parent_order_count, 0)::INTEGER AS order_count,
      COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
      COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
    FROM ods.taobao_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date

    UNION ALL

    SELECT
      'wx'::VARCHAR(20) AS platform,
      shop_name,
      shop_id,
      stat_date AS trade_date,
      COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(pay_order_count, 0)::INTEGER AS order_count,
      COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
      COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
    FROM ods.wx_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date

    UNION ALL

    SELECT
      'xhs'::VARCHAR(20) AS platform,
      shop_name,
      shop_id,
      stat_date AS trade_date,
      COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(pay_order_count, 0)::INTEGER AS order_count,
      COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
      COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
    FROM ods.xhs_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
  ),
  aggregated AS (
    SELECT
      platform,
      MIN(shop_name) AS shop_name,
      shop_id,
      trade_date,
      SUM(gmv)::NUMERIC(18, 2) AS gmv,
      SUM(order_count)::INTEGER AS order_count,
      SUM(buyer_count)::INTEGER AS buyer_count,
      SUM(refund_amount)::NUMERIC(18, 2) AS refund_amount
    FROM source_union
    GROUP BY platform, shop_id, trade_date
  )
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
    platform,
    shop_name,
    shop_id,
    trade_date,
    gmv,
    order_count,
    buyer_count,
    refund_amount
  FROM aggregated;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_all_trade_sale completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    p_start_date,
    p_end_date;
END;
$$;

COMMIT;
