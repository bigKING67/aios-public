BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_taobao_alimama_goods_marketingscene(DATE, DATE);

CREATE PROCEDURE dwd.refresh_taobao_alimama_goods_marketingscene(
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
  IF to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NULL THEN
    RAISE EXCEPTION 'target table dwd.taobao_alimama_goods_marketingscene does not exist';
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

  IF to_regclass('pg_temp.tmp_marketingscene_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_marketingscene_new';
  END IF;
  IF to_regclass('pg_temp.tmp_marketingscene_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_marketingscene_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_marketingscene_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_marketingscene_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_marketingscene_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_marketingscene_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_marketingscene_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_marketingscene_updated';
  END IF;

  CREATE TEMP TABLE tmp_marketingscene_new ON COMMIT DROP AS
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
    s.favorite_count
  FROM src_agg s;

  CREATE TEMP TABLE tmp_marketingscene_existing ON COMMIT DROP AS
  SELECT
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
    favorite_count
  FROM dwd.taobao_alimama_goods_marketingscene
  WHERE stat_date BETWEEN v_start_date AND v_end_date;

  CREATE TEMP TABLE tmp_marketingscene_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_marketingscene_new n
  LEFT JOIN tmp_marketingscene_existing e
    ON e.stat_date = n.stat_date
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE e.stat_date IS NULL;

  CREATE TEMP TABLE tmp_marketingscene_deleted ON COMMIT DROP AS
  SELECT e.stat_date, e.shop_id, e.product_id, e.scene
  FROM tmp_marketingscene_existing e
  LEFT JOIN tmp_marketingscene_new n
    ON n.stat_date = e.stat_date
   AND n.shop_id = e.shop_id
   AND n.product_id = e.product_id
   AND n.scene = e.scene
  WHERE n.stat_date IS NULL;

  CREATE TEMP TABLE tmp_marketingscene_updated ON COMMIT DROP AS
  SELECT
    n.*,
    e.total_gmv AS old_total_gmv,
    e.click_count AS old_click_count,
    e.cost AS old_cost,
    e.buyer_count AS old_buyer_count
  FROM tmp_marketingscene_new n
  JOIN tmp_marketingscene_existing e
    ON e.stat_date = n.stat_date
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.shop_name,
    n.scene_group,
    n.impression_count,
    n.click_count,
    n.cost,
    n.total_gmv,
    n.total_order_count,
    n.buyer_count,
    n.ctr,
    n.cvr,
    n.cpc,
    n.arpu,
    n.cart_count,
    n.favorite_count
  ) IS DISTINCT FROM ROW(
    e.shop_name,
    e.scene_group,
    e.impression_count,
    e.click_count,
    e.cost,
    e.total_gmv,
    e.total_order_count,
    e.buyer_count,
    e.ctr,
    e.cvr,
    e.cpc,
    e.arpu,
    e.cart_count,
    e.favorite_count
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_marketingscene_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_marketingscene_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_marketingscene_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_marketingscene_new n
  JOIN tmp_marketingscene_existing e
    ON e.stat_date = n.stat_date
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.shop_name,
    n.scene_group,
    n.impression_count,
    n.click_count,
    n.cost,
    n.total_gmv,
    n.total_order_count,
    n.buyer_count,
    n.ctr,
    n.cvr,
    n.cpc,
    n.arpu,
    n.cart_count,
    n.favorite_count
  ) IS NOT DISTINCT FROM ROW(
    e.shop_name,
    e.scene_group,
    e.impression_count,
    e.click_count,
    e.cost,
    e.total_gmv,
    e.total_order_count,
    e.buyer_count,
    e.ctr,
    e.cvr,
    e.cpc,
    e.arpu,
    e.cart_count,
    e.favorite_count
  );

  DELETE FROM dwd.taobao_alimama_goods_marketingscene t
  USING tmp_marketingscene_deleted d
  WHERE t.stat_date = d.stat_date
    AND t.shop_id = d.shop_id
    AND t.product_id = d.product_id
    AND t.scene = d.scene;

  UPDATE dwd.taobao_alimama_goods_marketingscene t
  SET
    shop_name = u.shop_name,
    scene_group = u.scene_group,
    impression_count = u.impression_count,
    click_count = u.click_count,
    cost = u.cost,
    total_gmv = u.total_gmv,
    total_order_count = u.total_order_count,
    buyer_count = u.buyer_count,
    ctr = u.ctr,
    cvr = u.cvr,
    cpc = u.cpc,
    arpu = u.arpu,
    cart_count = u.cart_count,
    favorite_count = u.favorite_count,
    etl_time = CURRENT_TIMESTAMP
  FROM tmp_marketingscene_updated u
  WHERE t.stat_date = u.stat_date
    AND t.shop_id = u.shop_id
    AND t.product_id = u.product_id
    AND t.scene = u.scene;

  INSERT INTO dwd.taobao_alimama_goods_marketingscene (
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
    CURRENT_TIMESTAMP
  FROM tmp_marketingscene_inserted;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows, v_updated_rows, v_deleted_rows, v_unchanged_rows, v_start_date, v_end_date;

  FOR v_insert_detail IN
    SELECT stat_date, shop_id, product_id, scene, total_gmv
    FROM tmp_marketingscene_inserted
    ORDER BY stat_date, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: stat_date=%, shop_id=%, product_id=%, scene=%, total_gmv=%',
      v_insert_detail.stat_date,
      v_insert_detail.shop_id,
      v_insert_detail.product_id,
      v_insert_detail.scene,
      v_insert_detail.total_gmv;
  END LOOP;

  FOR v_update_detail IN
    SELECT
      stat_date,
      shop_id,
      product_id,
      scene,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_total_gmv IS DISTINCT FROM total_gmv THEN format('total_gmv:%s->%s', old_total_gmv, total_gmv) END,
        CASE WHEN old_click_count IS DISTINCT FROM click_count THEN format('click_count:%s->%s', old_click_count, click_count) END,
        CASE WHEN old_cost IS DISTINCT FROM cost THEN format('cost:%s->%s', old_cost, cost) END,
        CASE WHEN old_buyer_count IS DISTINCT FROM buyer_count THEN format('buyer_count:%s->%s', old_buyer_count, buyer_count) END
      ), '') AS change_summary
    FROM tmp_marketingscene_updated
    ORDER BY stat_date, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: stat_date=%, shop_id=%, product_id=%, scene=%, changes=%',
      v_update_detail.stat_date,
      v_update_detail.shop_id,
      v_update_detail.product_id,
      v_update_detail.scene,
      COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_taobao_alimama_goods_marketingscene(DATE, DATE)
IS '按日期窗口刷新dwd.taobao_alimama_goods_marketingscene，仅对真实新增/更新/删除数据落表。';

COMMIT;
