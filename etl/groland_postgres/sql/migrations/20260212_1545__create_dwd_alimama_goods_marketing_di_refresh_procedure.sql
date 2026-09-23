BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_dwd_alimama_goods_marketing_di(DATE, DATE);

CREATE PROCEDURE dwd.refresh_dwd_alimama_goods_marketing_di(
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
  IF to_regclass('dwd.dwd_alimama_goods_marketing_di') IS NULL THEN
    RAISE EXCEPTION 'target table dwd.dwd_alimama_goods_marketing_di does not exist';
  END IF;

  IF to_regclass('ods.taobao_one_alimama_goods_marketingscenario') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_one_alimama_goods_marketingscenario does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_one_alimama_goods_marketingscenario has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM dwd.dwd_alimama_goods_marketing_di
  WHERE stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  WITH src_agg AS (
    SELECT
      stat_date,
      shop_id,
      MIN(shop_name) AS shop_name,
      product_id,
      scene,
      SUM(COALESCE(impression_count, 0))::BIGINT AS impression_count,
      SUM(COALESCE(click_count, 0))::BIGINT AS click_count,
      SUM(COALESCE(cost, 0))::NUMERIC(18, 2) AS cost,
      SUM(COALESCE(total_gmv, 0))::NUMERIC(18, 2) AS total_gmv,
      SUM(COALESCE(total_order_count, 0))::INTEGER AS total_order_count,
      SUM(COALESCE(buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(total_cart_count, 0))::INTEGER AS cart_count,
      SUM(COALESCE(total_favorite_count, 0))::INTEGER AS favorite_count
    FROM ods.taobao_one_alimama_goods_marketingscenario
    WHERE stat_date BETWEEN v_start_date AND v_end_date
    GROUP BY stat_date, shop_id, product_id, scene
  )
  INSERT INTO dwd.dwd_alimama_goods_marketing_di (
    stat_date,
    shop_id,
    shop_name,
    product_id,
    scene,
    scene_group,
    impression_count,
    click_count,
    cost,
    total_gmv,
    total_order_count,
    buyer_count,
    ctr,
    cvr,
    cpc,
    arpu,
    cart_count,
    favorite_count,
    etl_time
  )
  SELECT
    s.stat_date,
    s.shop_id,
    s.shop_name,
    s.product_id,
    s.scene,
    CASE
      WHEN s.scene ILIKE '%关键词%' OR s.scene ILIKE '%搜索%' THEN '搜索'
      WHEN s.scene ILIKE '%人群%' OR s.scene ILIKE '%场景%' OR s.scene ILIKE '%推荐%' OR s.scene ILIKE '%全站%' THEN '推荐'
      ELSE '推荐'
    END AS scene_group,
    s.impression_count,
    s.click_count,
    s.cost,
    s.total_gmv,
    s.total_order_count,
    s.buyer_count,
    CASE
      WHEN s.impression_count > 0 THEN ROUND((s.click_count::NUMERIC / s.impression_count), 6)
      ELSE NULL
    END AS ctr,
    CASE
      WHEN s.click_count > 0 THEN ROUND((s.total_order_count::NUMERIC / s.click_count), 6)
      ELSE NULL
    END AS cvr,
    CASE
      WHEN s.click_count > 0 THEN ROUND((s.cost / s.click_count), 2)
      ELSE NULL
    END AS cpc,
    CASE
      WHEN s.buyer_count > 0 THEN ROUND((s.total_gmv / s.buyer_count), 2)
      ELSE NULL
    END AS arpu,
    s.cart_count,
    s.favorite_count,
    CURRENT_TIMESTAMP AS etl_time
  FROM src_agg s;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_dwd_alimama_goods_marketing_di completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_dwd_alimama_goods_marketing_di(DATE, DATE)
IS '按日期窗口将ods.taobao_one_alimama_goods_marketingscenario刷新到dwd.dwd_alimama_goods_marketing_di。';

COMMIT;
