BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_taobao_goods_sale_traffic(DATE, DATE);

CREATE PROCEDURE dwd.refresh_taobao_goods_sale_traffic(
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
  IF to_regclass('dwd.taobao_goods_sale_traffic') IS NULL THEN
    RAISE EXCEPTION 'target table dwd.taobao_goods_sale_traffic does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_goods_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_goods_raw does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM ods.taobao_trade_sale_goods_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_trade_sale_goods_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM dwd.taobao_goods_sale_traffic
  WHERE stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO dwd.taobao_goods_sale_traffic (
    shop_id,
    shop_name,
    stat_date,
    product_id,
    product_name,
    pay_amount,
    refund_amount,
    search_visitor_count,
    search_cart_buyer_count,
    search_pay_amount,
    search_pay_quantity,
    search_pay_buyer_count,
    recommend_visitor_count,
    recommend_cart_buyer_count,
    recommend_pay_amount,
    recommend_pay_quantity,
    recommend_pay_buyer_count,
    keyword_ad_visitor_count,
    keyword_ad_cart_buyer_count,
    keyword_ad_pay_amount,
    keyword_ad_pay_quantity,
    keyword_ad_pay_buyer_count,
    crowd_ad_visitor_count,
    crowd_ad_cart_buyer_count,
    crowd_ad_pay_amount,
    crowd_ad_pay_quantity,
    crowd_ad_pay_buyer_count,
    scene_ad_visitor_count,
    scene_ad_cart_buyer_count,
    scene_ad_pay_amount,
    scene_ad_pay_quantity,
    scene_ad_pay_buyer_count
  )
  SELECT
    src.shop_id,
    MIN(src.shop_name) AS shop_name,
    src.stat_date,
    src.product_id,
    MIN(src.product_name) AS product_name,
    SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS pay_amount,
    SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount,
    SUM(COALESCE(src.search_visitor_count, 0))::INTEGER AS search_visitor_count,
    SUM(COALESCE(src.search_cart_buyer_count, 0))::INTEGER AS search_cart_buyer_count,
    SUM(COALESCE(src.search_pay_amount, 0))::NUMERIC(18, 2) AS search_pay_amount,
    SUM(COALESCE(src.search_pay_quantity, 0))::INTEGER AS search_pay_quantity,
    SUM(COALESCE(src.search_pay_buyer_count, 0))::INTEGER AS search_pay_buyer_count,
    SUM(COALESCE(src.recommend_visitor_count, 0))::INTEGER AS recommend_visitor_count,
    SUM(COALESCE(src.recommend_cart_buyer_count, 0))::INTEGER AS recommend_cart_buyer_count,
    SUM(COALESCE(src.recommend_pay_amount, 0))::NUMERIC(18, 2) AS recommend_pay_amount,
    SUM(COALESCE(src.recommend_pay_quantity, 0))::INTEGER AS recommend_pay_quantity,
    SUM(COALESCE(src.recommend_pay_buyer_count, 0))::INTEGER AS recommend_pay_buyer_count,
    SUM(COALESCE(src.keyword_ad_visitor_count, 0))::INTEGER AS keyword_ad_visitor_count,
    SUM(COALESCE(src.keyword_ad_cart_buyer_count, 0))::INTEGER AS keyword_ad_cart_buyer_count,
    SUM(COALESCE(src.keyword_ad_pay_amount, 0))::NUMERIC(18, 2) AS keyword_ad_pay_amount,
    SUM(COALESCE(src.keyword_ad_pay_quantity, 0))::INTEGER AS keyword_ad_pay_quantity,
    SUM(COALESCE(src.keyword_ad_pay_buyer_count, 0))::INTEGER AS keyword_ad_pay_buyer_count,
    SUM(COALESCE(src.crowd_ad_visitor_count, 0))::INTEGER AS crowd_ad_visitor_count,
    SUM(COALESCE(src.crowd_ad_cart_buyer_count, 0))::INTEGER AS crowd_ad_cart_buyer_count,
    SUM(COALESCE(src.crowd_ad_pay_amount, 0))::NUMERIC(18, 2) AS crowd_ad_pay_amount,
    SUM(COALESCE(src.crowd_ad_pay_quantity, 0))::INTEGER AS crowd_ad_pay_quantity,
    SUM(COALESCE(src.crowd_ad_pay_buyer_count, 0))::INTEGER AS crowd_ad_pay_buyer_count,
    SUM(COALESCE(src.scene_ad_visitor_count, 0))::INTEGER AS scene_ad_visitor_count,
    SUM(COALESCE(src.scene_ad_cart_buyer_count, 0))::INTEGER AS scene_ad_cart_buyer_count,
    SUM(COALESCE(src.scene_ad_pay_amount, 0))::NUMERIC(18, 2) AS scene_ad_pay_amount,
    SUM(COALESCE(src.scene_ad_pay_quantity, 0))::INTEGER AS scene_ad_pay_quantity,
    SUM(COALESCE(src.scene_ad_pay_buyer_count, 0))::INTEGER AS scene_ad_pay_buyer_count
  FROM ods.taobao_trade_sale_goods_raw src
  WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  GROUP BY
    src.shop_id,
    src.stat_date,
    src.product_id;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_goods_sale_traffic completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_taobao_goods_sale_traffic(DATE, DATE)
IS '按日期窗口将ods.taobao_trade_sale_goods_raw刷新到dwd.taobao_goods_sale_traffic。';

COMMIT;
