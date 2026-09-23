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
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
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

  IF to_regclass('pg_temp.tmp_goods_traffic_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_goods_traffic_new';
  END IF;
  IF to_regclass('pg_temp.tmp_goods_traffic_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_goods_traffic_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_goods_traffic_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_goods_traffic_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_goods_traffic_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_goods_traffic_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_goods_traffic_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_goods_traffic_updated';
  END IF;

  CREATE TEMP TABLE tmp_goods_traffic_new ON COMMIT DROP AS
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
  GROUP BY src.shop_id, src.stat_date, src.product_id;

  CREATE TEMP TABLE tmp_goods_traffic_existing ON COMMIT DROP AS
  SELECT
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
  FROM dwd.taobao_goods_sale_traffic
  WHERE stat_date BETWEEN v_start_date AND v_end_date;

  CREATE TEMP TABLE tmp_goods_traffic_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_goods_traffic_new n
  LEFT JOIN tmp_goods_traffic_existing e
    ON e.shop_id = n.shop_id
   AND e.stat_date = n.stat_date
   AND e.product_id = n.product_id
  WHERE e.shop_id IS NULL;

  CREATE TEMP TABLE tmp_goods_traffic_deleted ON COMMIT DROP AS
  SELECT e.shop_id, e.stat_date, e.product_id
  FROM tmp_goods_traffic_existing e
  LEFT JOIN tmp_goods_traffic_new n
    ON n.shop_id = e.shop_id
   AND n.stat_date = e.stat_date
   AND n.product_id = e.product_id
  WHERE n.shop_id IS NULL;

  CREATE TEMP TABLE tmp_goods_traffic_updated ON COMMIT DROP AS
  SELECT
    n.*,
    e.pay_amount AS old_pay_amount,
    e.refund_amount AS old_refund_amount
  FROM tmp_goods_traffic_new n
  JOIN tmp_goods_traffic_existing e
    ON e.shop_id = n.shop_id
   AND e.stat_date = n.stat_date
   AND e.product_id = n.product_id
  WHERE ROW(
    n.shop_name,
    n.product_name,
    n.pay_amount,
    n.refund_amount,
    n.search_visitor_count,
    n.search_cart_buyer_count,
    n.search_pay_amount,
    n.search_pay_quantity,
    n.search_pay_buyer_count,
    n.recommend_visitor_count,
    n.recommend_cart_buyer_count,
    n.recommend_pay_amount,
    n.recommend_pay_quantity,
    n.recommend_pay_buyer_count,
    n.keyword_ad_visitor_count,
    n.keyword_ad_cart_buyer_count,
    n.keyword_ad_pay_amount,
    n.keyword_ad_pay_quantity,
    n.keyword_ad_pay_buyer_count,
    n.crowd_ad_visitor_count,
    n.crowd_ad_cart_buyer_count,
    n.crowd_ad_pay_amount,
    n.crowd_ad_pay_quantity,
    n.crowd_ad_pay_buyer_count,
    n.scene_ad_visitor_count,
    n.scene_ad_cart_buyer_count,
    n.scene_ad_pay_amount,
    n.scene_ad_pay_quantity,
    n.scene_ad_pay_buyer_count
  ) IS DISTINCT FROM ROW(
    e.shop_name,
    e.product_name,
    e.pay_amount,
    e.refund_amount,
    e.search_visitor_count,
    e.search_cart_buyer_count,
    e.search_pay_amount,
    e.search_pay_quantity,
    e.search_pay_buyer_count,
    e.recommend_visitor_count,
    e.recommend_cart_buyer_count,
    e.recommend_pay_amount,
    e.recommend_pay_quantity,
    e.recommend_pay_buyer_count,
    e.keyword_ad_visitor_count,
    e.keyword_ad_cart_buyer_count,
    e.keyword_ad_pay_amount,
    e.keyword_ad_pay_quantity,
    e.keyword_ad_pay_buyer_count,
    e.crowd_ad_visitor_count,
    e.crowd_ad_cart_buyer_count,
    e.crowd_ad_pay_amount,
    e.crowd_ad_pay_quantity,
    e.crowd_ad_pay_buyer_count,
    e.scene_ad_visitor_count,
    e.scene_ad_cart_buyer_count,
    e.scene_ad_pay_amount,
    e.scene_ad_pay_quantity,
    e.scene_ad_pay_buyer_count
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_goods_traffic_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_goods_traffic_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_goods_traffic_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_goods_traffic_new n
  JOIN tmp_goods_traffic_existing e
    ON e.shop_id = n.shop_id
   AND e.stat_date = n.stat_date
   AND e.product_id = n.product_id
  WHERE ROW(
    n.shop_name,
    n.product_name,
    n.pay_amount,
    n.refund_amount,
    n.search_visitor_count,
    n.search_cart_buyer_count,
    n.search_pay_amount,
    n.search_pay_quantity,
    n.search_pay_buyer_count,
    n.recommend_visitor_count,
    n.recommend_cart_buyer_count,
    n.recommend_pay_amount,
    n.recommend_pay_quantity,
    n.recommend_pay_buyer_count,
    n.keyword_ad_visitor_count,
    n.keyword_ad_cart_buyer_count,
    n.keyword_ad_pay_amount,
    n.keyword_ad_pay_quantity,
    n.keyword_ad_pay_buyer_count,
    n.crowd_ad_visitor_count,
    n.crowd_ad_cart_buyer_count,
    n.crowd_ad_pay_amount,
    n.crowd_ad_pay_quantity,
    n.crowd_ad_pay_buyer_count,
    n.scene_ad_visitor_count,
    n.scene_ad_cart_buyer_count,
    n.scene_ad_pay_amount,
    n.scene_ad_pay_quantity,
    n.scene_ad_pay_buyer_count
  ) IS NOT DISTINCT FROM ROW(
    e.shop_name,
    e.product_name,
    e.pay_amount,
    e.refund_amount,
    e.search_visitor_count,
    e.search_cart_buyer_count,
    e.search_pay_amount,
    e.search_pay_quantity,
    e.search_pay_buyer_count,
    e.recommend_visitor_count,
    e.recommend_cart_buyer_count,
    e.recommend_pay_amount,
    e.recommend_pay_quantity,
    e.recommend_pay_buyer_count,
    e.keyword_ad_visitor_count,
    e.keyword_ad_cart_buyer_count,
    e.keyword_ad_pay_amount,
    e.keyword_ad_pay_quantity,
    e.keyword_ad_pay_buyer_count,
    e.crowd_ad_visitor_count,
    e.crowd_ad_cart_buyer_count,
    e.crowd_ad_pay_amount,
    e.crowd_ad_pay_quantity,
    e.crowd_ad_pay_buyer_count,
    e.scene_ad_visitor_count,
    e.scene_ad_cart_buyer_count,
    e.scene_ad_pay_amount,
    e.scene_ad_pay_quantity,
    e.scene_ad_pay_buyer_count
  );

  DELETE FROM dwd.taobao_goods_sale_traffic t
  USING tmp_goods_traffic_deleted d
  WHERE t.shop_id = d.shop_id
    AND t.stat_date = d.stat_date
    AND t.product_id = d.product_id;

  UPDATE dwd.taobao_goods_sale_traffic t
  SET
    shop_name = u.shop_name,
    product_name = u.product_name,
    pay_amount = u.pay_amount,
    refund_amount = u.refund_amount,
    search_visitor_count = u.search_visitor_count,
    search_cart_buyer_count = u.search_cart_buyer_count,
    search_pay_amount = u.search_pay_amount,
    search_pay_quantity = u.search_pay_quantity,
    search_pay_buyer_count = u.search_pay_buyer_count,
    recommend_visitor_count = u.recommend_visitor_count,
    recommend_cart_buyer_count = u.recommend_cart_buyer_count,
    recommend_pay_amount = u.recommend_pay_amount,
    recommend_pay_quantity = u.recommend_pay_quantity,
    recommend_pay_buyer_count = u.recommend_pay_buyer_count,
    keyword_ad_visitor_count = u.keyword_ad_visitor_count,
    keyword_ad_cart_buyer_count = u.keyword_ad_cart_buyer_count,
    keyword_ad_pay_amount = u.keyword_ad_pay_amount,
    keyword_ad_pay_quantity = u.keyword_ad_pay_quantity,
    keyword_ad_pay_buyer_count = u.keyword_ad_pay_buyer_count,
    crowd_ad_visitor_count = u.crowd_ad_visitor_count,
    crowd_ad_cart_buyer_count = u.crowd_ad_cart_buyer_count,
    crowd_ad_pay_amount = u.crowd_ad_pay_amount,
    crowd_ad_pay_quantity = u.crowd_ad_pay_quantity,
    crowd_ad_pay_buyer_count = u.crowd_ad_pay_buyer_count,
    scene_ad_visitor_count = u.scene_ad_visitor_count,
    scene_ad_cart_buyer_count = u.scene_ad_cart_buyer_count,
    scene_ad_pay_amount = u.scene_ad_pay_amount,
    scene_ad_pay_quantity = u.scene_ad_pay_quantity,
    scene_ad_pay_buyer_count = u.scene_ad_pay_buyer_count
  FROM tmp_goods_traffic_updated u
  WHERE t.shop_id = u.shop_id
    AND t.stat_date = u.stat_date
    AND t.product_id = u.product_id;

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
  FROM tmp_goods_traffic_inserted;

  RAISE NOTICE 'refresh_taobao_goods_sale_traffic completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows, v_updated_rows, v_deleted_rows, v_unchanged_rows, v_start_date, v_end_date;

  FOR v_insert_detail IN
    SELECT stat_date, shop_id, product_id, pay_amount, refund_amount
    FROM tmp_goods_traffic_inserted
    ORDER BY stat_date, shop_id, product_id
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: stat_date=%, shop_id=%, product_id=%, pay_amount=%, refund_amount=%',
      v_insert_detail.stat_date,
      v_insert_detail.shop_id,
      v_insert_detail.product_id,
      v_insert_detail.pay_amount,
      v_insert_detail.refund_amount;
  END LOOP;

  FOR v_update_detail IN
    SELECT
      stat_date,
      shop_id,
      product_id,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_pay_amount IS DISTINCT FROM pay_amount THEN format('pay_amount:%s->%s', old_pay_amount, pay_amount) END,
        CASE WHEN old_refund_amount IS DISTINCT FROM refund_amount THEN format('refund_amount:%s->%s', old_refund_amount, refund_amount) END
      ), '') AS change_summary
    FROM tmp_goods_traffic_updated
    ORDER BY stat_date, shop_id, product_id
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: stat_date=%, shop_id=%, product_id=%, changes=%',
      v_update_detail.stat_date,
      v_update_detail.shop_id,
      v_update_detail.product_id,
      COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_taobao_goods_sale_traffic(DATE, DATE)
IS '按日期窗口刷新dwd.taobao_goods_sale_traffic，仅对真实新增/更新/删除数据落表。';

COMMIT;
