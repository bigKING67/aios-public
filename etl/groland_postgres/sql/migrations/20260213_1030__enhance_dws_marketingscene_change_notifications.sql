BEGIN;

DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_week(DATE, DATE);

CREATE PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_effective_start DATE;
  v_effective_end DATE;
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  IF to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NULL THEN
    RAISE EXCEPTION 'source table dwd.taobao_alimama_goods_marketingscene does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM dwd.taobao_alimama_goods_marketingscene;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dwd.taobao_alimama_goods_marketingscene has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  IF to_regclass('pg_temp.tmp_week_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_week_new';
  END IF;
  IF to_regclass('pg_temp.tmp_week_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_week_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_week_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_week_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_week_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_week_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_week_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_week_updated';
  END IF;

  CREATE TEMP TABLE tmp_week_new ON COMMIT DROP AS
  WITH weekly AS (
    SELECT
      (src.stat_date - ((EXTRACT(DOW FROM src.stat_date)::INTEGER + 1) % 7))::DATE AS week_start,
      src.shop_id,
      src.product_id,
      src.scene,
      SUM(COALESCE(src.total_gmv, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(src.impression_count, 0))::BIGINT AS imp,
      SUM(COALESCE(src.click_count, 0))::BIGINT AS click,
      SUM(COALESCE(src.cost, 0))::NUMERIC(18, 2) AS cost,
      SUM(COALESCE(src.total_order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(src.buyer_count, 0))::INTEGER AS buyer_count
    FROM dwd.taobao_alimama_goods_marketingscene src
    WHERE src.stat_date BETWEEN v_effective_start AND v_effective_end
    GROUP BY
      (src.stat_date - ((EXTRACT(DOW FROM src.stat_date)::INTEGER + 1) % 7))::DATE,
      src.shop_id,
      src.product_id,
      src.scene
  )
  SELECT
    to_char(curr.week_start, 'YYYY/FMMM/FMDD') || '～' || to_char((curr.week_start + 6), 'YYYY/FMMM/FMDD') AS week_period,
    curr.shop_id,
    curr.product_id,
    curr.scene,
    curr.gmv AS curr_gmv,
    curr.imp AS curr_imp,
    curr.click AS curr_click,
    curr.cost AS curr_cost,
    CASE
      WHEN curr.imp > 0 THEN ROUND((curr.click::NUMERIC / curr.imp), 6)
      ELSE NULL
    END AS curr_ctr,
    CASE
      WHEN curr.click > 0 THEN ROUND((curr.order_count::NUMERIC / curr.click), 6)
      ELSE NULL
    END AS curr_cvr,
    CASE
      WHEN curr.buyer_count > 0 THEN ROUND((curr.gmv / curr.buyer_count), 2)
      ELSE NULL
    END AS curr_arpu,
    CASE
      WHEN curr.click > 0 THEN ROUND((curr.cost / curr.click), 2)
      ELSE NULL
    END AS curr_cpc,
    COALESCE(prev.gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
    COALESCE(prev.imp, 0)::BIGINT AS prev_imp,
    CASE
      WHEN prev.imp > 0 THEN ROUND((prev.click::NUMERIC / prev.imp), 6)
      ELSE NULL
    END AS prev_ctr,
    CASE
      WHEN prev.click > 0 THEN ROUND((prev.order_count::NUMERIC / prev.click), 6)
      ELSE NULL
    END AS prev_cvr,
    CASE
      WHEN prev.buyer_count > 0 THEN ROUND((prev.gmv / prev.buyer_count), 2)
      ELSE NULL
    END AS prev_arpu,
    CASE
      WHEN prev.click > 0 THEN ROUND((prev.cost / prev.click), 2)
      ELSE NULL
    END AS prev_cpc
  FROM weekly curr
  LEFT JOIN weekly prev
    ON prev.shop_id = curr.shop_id
   AND prev.product_id = curr.product_id
   AND prev.scene = curr.scene
   AND prev.week_start = curr.week_start - 7
  WHERE curr.week_start BETWEEN v_effective_start AND v_effective_end;

  CREATE TEMP TABLE tmp_week_existing ON COMMIT DROP AS
  WITH week_scope AS (
    SELECT gs::DATE AS week_start
    FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs
  )
  SELECT t.*
  FROM dws.taobao_alimama_goods_marketingscene_week t
  JOIN week_scope w
    ON t.week_period =
      to_char(w.week_start, 'YYYY/FMMM/FMDD') || '～' || to_char((w.week_start + 6), 'YYYY/FMMM/FMDD');

  CREATE TEMP TABLE tmp_week_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_week_new n
  LEFT JOIN tmp_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE e.week_period IS NULL;

  CREATE TEMP TABLE tmp_week_deleted ON COMMIT DROP AS
  SELECT
    e.week_period,
    e.shop_id,
    e.product_id,
    e.scene
  FROM tmp_week_existing e
  LEFT JOIN tmp_week_new n
    ON n.week_period = e.week_period
   AND n.shop_id = e.shop_id
   AND n.product_id = e.product_id
   AND n.scene = e.scene
  WHERE n.week_period IS NULL;

  CREATE TEMP TABLE tmp_week_updated ON COMMIT DROP AS
  SELECT
    n.week_period,
    n.shop_id,
    n.product_id,
    n.scene,
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc,
    e.curr_gmv AS old_curr_gmv,
    e.curr_imp AS old_curr_imp,
    e.curr_click AS old_curr_click,
    e.curr_cost AS old_curr_cost,
    e.curr_ctr AS old_curr_ctr,
    e.curr_cvr AS old_curr_cvr,
    e.curr_arpu AS old_curr_arpu,
    e.curr_cpc AS old_curr_cpc,
    e.prev_gmv AS old_prev_gmv,
    e.prev_imp AS old_prev_imp,
    e.prev_ctr AS old_prev_ctr,
    e.prev_cvr AS old_prev_cvr,
    e.prev_arpu AS old_prev_arpu,
    e.prev_cpc AS old_prev_cpc
  FROM tmp_week_new n
  JOIN tmp_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc
  ) IS DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_imp,
    e.curr_click,
    e.curr_cost,
    e.curr_ctr,
    e.curr_cvr,
    e.curr_arpu,
    e.curr_cpc,
    e.prev_gmv,
    e.prev_imp,
    e.prev_ctr,
    e.prev_cvr,
    e.prev_arpu,
    e.prev_cpc
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_week_inserted;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_week_deleted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_week_updated;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_week_new n
  JOIN tmp_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc
  ) IS NOT DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_imp,
    e.curr_click,
    e.curr_cost,
    e.curr_ctr,
    e.curr_cvr,
    e.curr_arpu,
    e.curr_cpc,
    e.prev_gmv,
    e.prev_imp,
    e.prev_ctr,
    e.prev_cvr,
    e.prev_arpu,
    e.prev_cpc
  );

  DELETE FROM dws.taobao_alimama_goods_marketingscene_week t
  USING tmp_week_deleted d
  WHERE t.week_period = d.week_period
    AND t.shop_id = d.shop_id
    AND t.product_id = d.product_id
    AND t.scene = d.scene;

  UPDATE dws.taobao_alimama_goods_marketingscene_week t
  SET
    curr_gmv = u.curr_gmv,
    curr_imp = u.curr_imp,
    curr_click = u.curr_click,
    curr_cost = u.curr_cost,
    curr_ctr = u.curr_ctr,
    curr_cvr = u.curr_cvr,
    curr_arpu = u.curr_arpu,
    curr_cpc = u.curr_cpc,
    prev_gmv = u.prev_gmv,
    prev_imp = u.prev_imp,
    prev_ctr = u.prev_ctr,
    prev_cvr = u.prev_cvr,
    prev_arpu = u.prev_arpu,
    prev_cpc = u.prev_cpc
  FROM tmp_week_updated u
  WHERE t.week_period = u.week_period
    AND t.shop_id = u.shop_id
    AND t.product_id = u.product_id
    AND t.scene = u.scene;

  INSERT INTO dws.taobao_alimama_goods_marketingscene_week (
    week_period,
    shop_id,
    product_id,
    scene,
    curr_gmv,
    curr_imp,
    curr_click,
    curr_cost,
    curr_ctr,
    curr_cvr,
    curr_arpu,
    curr_cpc,
    prev_gmv,
    prev_imp,
    prev_ctr,
    prev_cvr,
    prev_arpu,
    prev_cpc
  )
  SELECT
    week_period,
    shop_id,
    product_id,
    scene,
    curr_gmv,
    curr_imp,
    curr_click,
    curr_cost,
    curr_ctr,
    curr_cvr,
    curr_arpu,
    curr_cpc,
    prev_gmv,
    prev_imp,
    prev_ctr,
    prev_cvr,
    prev_arpu,
    prev_cpc
  FROM tmp_week_inserted;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene_week completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows,
    v_updated_rows,
    v_deleted_rows,
    v_unchanged_rows,
    v_effective_start,
    v_effective_end;

  FOR v_insert_detail IN
    SELECT
      week_period,
      shop_id,
      product_id,
      scene,
      curr_gmv,
      curr_imp,
      curr_click,
      curr_cost
    FROM tmp_week_inserted
    ORDER BY week_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: week_period=%, shop_id=%, product_id=%, scene=%, curr_gmv=%, curr_imp=%, curr_click=%, curr_cost=%',
      v_insert_detail.week_period,
      v_insert_detail.shop_id,
      v_insert_detail.product_id,
      v_insert_detail.scene,
      v_insert_detail.curr_gmv,
      v_insert_detail.curr_imp,
      v_insert_detail.curr_click,
      v_insert_detail.curr_cost;
  END LOOP;

  IF v_inserted_rows > v_detail_limit THEN
    RAISE NOTICE 'insert detail truncated, shown %, total %', v_detail_limit, v_inserted_rows;
  END IF;

  FOR v_update_detail IN
    SELECT
      week_period,
      shop_id,
      product_id,
      scene,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_curr_gmv IS DISTINCT FROM curr_gmv THEN format('curr_gmv:%s->%s', COALESCE(old_curr_gmv::TEXT, 'NULL'), COALESCE(curr_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_curr_imp IS DISTINCT FROM curr_imp THEN format('curr_imp:%s->%s', COALESCE(old_curr_imp::TEXT, 'NULL'), COALESCE(curr_imp::TEXT, 'NULL')) END,
        CASE WHEN old_curr_click IS DISTINCT FROM curr_click THEN format('curr_click:%s->%s', COALESCE(old_curr_click::TEXT, 'NULL'), COALESCE(curr_click::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cost IS DISTINCT FROM curr_cost THEN format('curr_cost:%s->%s', COALESCE(old_curr_cost::TEXT, 'NULL'), COALESCE(curr_cost::TEXT, 'NULL')) END,
        CASE WHEN old_curr_ctr IS DISTINCT FROM curr_ctr THEN format('curr_ctr:%s->%s', COALESCE(old_curr_ctr::TEXT, 'NULL'), COALESCE(curr_ctr::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cvr IS DISTINCT FROM curr_cvr THEN format('curr_cvr:%s->%s', COALESCE(old_curr_cvr::TEXT, 'NULL'), COALESCE(curr_cvr::TEXT, 'NULL')) END,
        CASE WHEN old_curr_arpu IS DISTINCT FROM curr_arpu THEN format('curr_arpu:%s->%s', COALESCE(old_curr_arpu::TEXT, 'NULL'), COALESCE(curr_arpu::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cpc IS DISTINCT FROM curr_cpc THEN format('curr_cpc:%s->%s', COALESCE(old_curr_cpc::TEXT, 'NULL'), COALESCE(curr_cpc::TEXT, 'NULL')) END,
        CASE WHEN old_prev_gmv IS DISTINCT FROM prev_gmv THEN format('prev_gmv:%s->%s', COALESCE(old_prev_gmv::TEXT, 'NULL'), COALESCE(prev_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_prev_imp IS DISTINCT FROM prev_imp THEN format('prev_imp:%s->%s', COALESCE(old_prev_imp::TEXT, 'NULL'), COALESCE(prev_imp::TEXT, 'NULL')) END,
        CASE WHEN old_prev_ctr IS DISTINCT FROM prev_ctr THEN format('prev_ctr:%s->%s', COALESCE(old_prev_ctr::TEXT, 'NULL'), COALESCE(prev_ctr::TEXT, 'NULL')) END,
        CASE WHEN old_prev_cvr IS DISTINCT FROM prev_cvr THEN format('prev_cvr:%s->%s', COALESCE(old_prev_cvr::TEXT, 'NULL'), COALESCE(prev_cvr::TEXT, 'NULL')) END,
        CASE WHEN old_prev_arpu IS DISTINCT FROM prev_arpu THEN format('prev_arpu:%s->%s', COALESCE(old_prev_arpu::TEXT, 'NULL'), COALESCE(prev_arpu::TEXT, 'NULL')) END,
        CASE WHEN old_prev_cpc IS DISTINCT FROM prev_cpc THEN format('prev_cpc:%s->%s', COALESCE(old_prev_cpc::TEXT, 'NULL'), COALESCE(prev_cpc::TEXT, 'NULL')) END
      ), '') AS change_summary
    FROM tmp_week_updated
    ORDER BY week_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: week_period=%, shop_id=%, product_id=%, scene=%, changes=%',
      v_update_detail.week_period,
      v_update_detail.shop_id,
      v_update_detail.product_id,
      v_update_detail.scene,
      COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;

  IF v_updated_rows > v_detail_limit THEN
    RAISE NOTICE 'update detail truncated, shown %, total %', v_detail_limit, v_updated_rows;
  END IF;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_week(DATE, DATE)
IS '按周六至周五口径，从dwd.taobao_alimama_goods_marketingscene刷新周对比汇总表，仅对真实新增/更新/删除落表。';

DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_month(DATE, DATE);

CREATE PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_month(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_effective_start DATE;
  v_effective_end DATE;
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  IF to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NULL THEN
    RAISE EXCEPTION 'source table dwd.taobao_alimama_goods_marketingscene does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM dwd.taobao_alimama_goods_marketingscene;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dwd.taobao_alimama_goods_marketingscene has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := DATE_TRUNC('month', v_start_date)::DATE;
  v_effective_end := (DATE_TRUNC('month', v_end_date)::DATE + INTERVAL '1 month - 1 day')::DATE;

  IF to_regclass('pg_temp.tmp_month_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_month_new';
  END IF;
  IF to_regclass('pg_temp.tmp_month_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_month_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_month_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_month_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_month_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_month_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_month_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_month_updated';
  END IF;

  CREATE TEMP TABLE tmp_month_new ON COMMIT DROP AS
  WITH monthly AS (
    SELECT
      DATE_TRUNC('month', src.stat_date)::DATE AS month_start,
      src.shop_id,
      src.product_id,
      src.scene,
      SUM(COALESCE(src.total_gmv, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(src.impression_count, 0))::BIGINT AS imp,
      SUM(COALESCE(src.click_count, 0))::BIGINT AS click,
      SUM(COALESCE(src.cost, 0))::NUMERIC(18, 2) AS cost,
      SUM(COALESCE(src.total_order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(src.buyer_count, 0))::INTEGER AS buyer_count
    FROM dwd.taobao_alimama_goods_marketingscene src
    WHERE src.stat_date BETWEEN v_effective_start AND v_effective_end
    GROUP BY
      DATE_TRUNC('month', src.stat_date)::DATE,
      src.shop_id,
      src.product_id,
      src.scene
  )
  SELECT
    to_char(curr.month_start, 'YYYY/MM') AS month_period,
    curr.shop_id,
    curr.product_id,
    curr.scene,
    curr.gmv AS curr_gmv,
    curr.imp AS curr_imp,
    curr.click AS curr_click,
    curr.cost AS curr_cost,
    CASE
      WHEN curr.imp > 0 THEN ROUND((curr.click::NUMERIC / curr.imp), 6)
      ELSE NULL
    END AS curr_ctr,
    CASE
      WHEN curr.click > 0 THEN ROUND((curr.order_count::NUMERIC / curr.click), 6)
      ELSE NULL
    END AS curr_cvr,
    CASE
      WHEN curr.buyer_count > 0 THEN ROUND((curr.gmv / curr.buyer_count), 2)
      ELSE NULL
    END AS curr_arpu,
    CASE
      WHEN curr.click > 0 THEN ROUND((curr.cost / curr.click), 2)
      ELSE NULL
    END AS curr_cpc,
    COALESCE(prev.gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
    COALESCE(prev.imp, 0)::BIGINT AS prev_imp,
    CASE
      WHEN prev.imp > 0 THEN ROUND((prev.click::NUMERIC / prev.imp), 6)
      ELSE NULL
    END AS prev_ctr,
    CASE
      WHEN prev.click > 0 THEN ROUND((prev.order_count::NUMERIC / prev.click), 6)
      ELSE NULL
    END AS prev_cvr,
    CASE
      WHEN prev.buyer_count > 0 THEN ROUND((prev.gmv / prev.buyer_count), 2)
      ELSE NULL
    END AS prev_arpu,
    CASE
      WHEN prev.click > 0 THEN ROUND((prev.cost / prev.click), 2)
      ELSE NULL
    END AS prev_cpc
  FROM monthly curr
  LEFT JOIN monthly prev
    ON prev.shop_id = curr.shop_id
   AND prev.product_id = curr.product_id
   AND prev.scene = curr.scene
   AND prev.month_start = (curr.month_start - INTERVAL '1 month')::DATE
  WHERE curr.month_start BETWEEN v_effective_start AND v_effective_end;

  CREATE TEMP TABLE tmp_month_existing ON COMMIT DROP AS
  WITH month_scope AS (
    SELECT gs::DATE AS month_start
    FROM generate_series(v_effective_start, v_effective_end, INTERVAL '1 month') AS gs
  )
  SELECT t.*
  FROM dws.taobao_alimama_goods_marketingscene_month t
  JOIN month_scope m
    ON t.month_period = to_char(m.month_start, 'YYYY/MM');

  CREATE TEMP TABLE tmp_month_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_month_new n
  LEFT JOIN tmp_month_existing e
    ON e.month_period = n.month_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE e.month_period IS NULL;

  CREATE TEMP TABLE tmp_month_deleted ON COMMIT DROP AS
  SELECT
    e.month_period,
    e.shop_id,
    e.product_id,
    e.scene
  FROM tmp_month_existing e
  LEFT JOIN tmp_month_new n
    ON n.month_period = e.month_period
   AND n.shop_id = e.shop_id
   AND n.product_id = e.product_id
   AND n.scene = e.scene
  WHERE n.month_period IS NULL;

  CREATE TEMP TABLE tmp_month_updated ON COMMIT DROP AS
  SELECT
    n.month_period,
    n.shop_id,
    n.product_id,
    n.scene,
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc,
    e.curr_gmv AS old_curr_gmv,
    e.curr_imp AS old_curr_imp,
    e.curr_click AS old_curr_click,
    e.curr_cost AS old_curr_cost,
    e.curr_ctr AS old_curr_ctr,
    e.curr_cvr AS old_curr_cvr,
    e.curr_arpu AS old_curr_arpu,
    e.curr_cpc AS old_curr_cpc,
    e.prev_gmv AS old_prev_gmv,
    e.prev_imp AS old_prev_imp,
    e.prev_ctr AS old_prev_ctr,
    e.prev_cvr AS old_prev_cvr,
    e.prev_arpu AS old_prev_arpu,
    e.prev_cpc AS old_prev_cpc
  FROM tmp_month_new n
  JOIN tmp_month_existing e
    ON e.month_period = n.month_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc
  ) IS DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_imp,
    e.curr_click,
    e.curr_cost,
    e.curr_ctr,
    e.curr_cvr,
    e.curr_arpu,
    e.curr_cpc,
    e.prev_gmv,
    e.prev_imp,
    e.prev_ctr,
    e.prev_cvr,
    e.prev_arpu,
    e.prev_cpc
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_month_inserted;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_month_deleted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_month_updated;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_month_new n
  JOIN tmp_month_existing e
    ON e.month_period = n.month_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.curr_gmv,
    n.curr_imp,
    n.curr_click,
    n.curr_cost,
    n.curr_ctr,
    n.curr_cvr,
    n.curr_arpu,
    n.curr_cpc,
    n.prev_gmv,
    n.prev_imp,
    n.prev_ctr,
    n.prev_cvr,
    n.prev_arpu,
    n.prev_cpc
  ) IS NOT DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_imp,
    e.curr_click,
    e.curr_cost,
    e.curr_ctr,
    e.curr_cvr,
    e.curr_arpu,
    e.curr_cpc,
    e.prev_gmv,
    e.prev_imp,
    e.prev_ctr,
    e.prev_cvr,
    e.prev_arpu,
    e.prev_cpc
  );

  DELETE FROM dws.taobao_alimama_goods_marketingscene_month t
  USING tmp_month_deleted d
  WHERE t.month_period = d.month_period
    AND t.shop_id = d.shop_id
    AND t.product_id = d.product_id
    AND t.scene = d.scene;

  UPDATE dws.taobao_alimama_goods_marketingscene_month t
  SET
    curr_gmv = u.curr_gmv,
    curr_imp = u.curr_imp,
    curr_click = u.curr_click,
    curr_cost = u.curr_cost,
    curr_ctr = u.curr_ctr,
    curr_cvr = u.curr_cvr,
    curr_arpu = u.curr_arpu,
    curr_cpc = u.curr_cpc,
    prev_gmv = u.prev_gmv,
    prev_imp = u.prev_imp,
    prev_ctr = u.prev_ctr,
    prev_cvr = u.prev_cvr,
    prev_arpu = u.prev_arpu,
    prev_cpc = u.prev_cpc
  FROM tmp_month_updated u
  WHERE t.month_period = u.month_period
    AND t.shop_id = u.shop_id
    AND t.product_id = u.product_id
    AND t.scene = u.scene;

  INSERT INTO dws.taobao_alimama_goods_marketingscene_month (
    month_period,
    shop_id,
    product_id,
    scene,
    curr_gmv,
    curr_imp,
    curr_click,
    curr_cost,
    curr_ctr,
    curr_cvr,
    curr_arpu,
    curr_cpc,
    prev_gmv,
    prev_imp,
    prev_ctr,
    prev_cvr,
    prev_arpu,
    prev_cpc
  )
  SELECT
    month_period,
    shop_id,
    product_id,
    scene,
    curr_gmv,
    curr_imp,
    curr_click,
    curr_cost,
    curr_ctr,
    curr_cvr,
    curr_arpu,
    curr_cpc,
    prev_gmv,
    prev_imp,
    prev_ctr,
    prev_cvr,
    prev_arpu,
    prev_cpc
  FROM tmp_month_inserted;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene_month completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows,
    v_updated_rows,
    v_deleted_rows,
    v_unchanged_rows,
    v_effective_start,
    v_effective_end;

  FOR v_insert_detail IN
    SELECT
      month_period,
      shop_id,
      product_id,
      scene,
      curr_gmv,
      curr_imp,
      curr_click,
      curr_cost
    FROM tmp_month_inserted
    ORDER BY month_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: month_period=%, shop_id=%, product_id=%, scene=%, curr_gmv=%, curr_imp=%, curr_click=%, curr_cost=%',
      v_insert_detail.month_period,
      v_insert_detail.shop_id,
      v_insert_detail.product_id,
      v_insert_detail.scene,
      v_insert_detail.curr_gmv,
      v_insert_detail.curr_imp,
      v_insert_detail.curr_click,
      v_insert_detail.curr_cost;
  END LOOP;

  IF v_inserted_rows > v_detail_limit THEN
    RAISE NOTICE 'insert detail truncated, shown %, total %', v_detail_limit, v_inserted_rows;
  END IF;

  FOR v_update_detail IN
    SELECT
      month_period,
      shop_id,
      product_id,
      scene,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_curr_gmv IS DISTINCT FROM curr_gmv THEN format('curr_gmv:%s->%s', COALESCE(old_curr_gmv::TEXT, 'NULL'), COALESCE(curr_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_curr_imp IS DISTINCT FROM curr_imp THEN format('curr_imp:%s->%s', COALESCE(old_curr_imp::TEXT, 'NULL'), COALESCE(curr_imp::TEXT, 'NULL')) END,
        CASE WHEN old_curr_click IS DISTINCT FROM curr_click THEN format('curr_click:%s->%s', COALESCE(old_curr_click::TEXT, 'NULL'), COALESCE(curr_click::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cost IS DISTINCT FROM curr_cost THEN format('curr_cost:%s->%s', COALESCE(old_curr_cost::TEXT, 'NULL'), COALESCE(curr_cost::TEXT, 'NULL')) END,
        CASE WHEN old_curr_ctr IS DISTINCT FROM curr_ctr THEN format('curr_ctr:%s->%s', COALESCE(old_curr_ctr::TEXT, 'NULL'), COALESCE(curr_ctr::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cvr IS DISTINCT FROM curr_cvr THEN format('curr_cvr:%s->%s', COALESCE(old_curr_cvr::TEXT, 'NULL'), COALESCE(curr_cvr::TEXT, 'NULL')) END,
        CASE WHEN old_curr_arpu IS DISTINCT FROM curr_arpu THEN format('curr_arpu:%s->%s', COALESCE(old_curr_arpu::TEXT, 'NULL'), COALESCE(curr_arpu::TEXT, 'NULL')) END,
        CASE WHEN old_curr_cpc IS DISTINCT FROM curr_cpc THEN format('curr_cpc:%s->%s', COALESCE(old_curr_cpc::TEXT, 'NULL'), COALESCE(curr_cpc::TEXT, 'NULL')) END,
        CASE WHEN old_prev_gmv IS DISTINCT FROM prev_gmv THEN format('prev_gmv:%s->%s', COALESCE(old_prev_gmv::TEXT, 'NULL'), COALESCE(prev_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_prev_imp IS DISTINCT FROM prev_imp THEN format('prev_imp:%s->%s', COALESCE(old_prev_imp::TEXT, 'NULL'), COALESCE(prev_imp::TEXT, 'NULL')) END,
        CASE WHEN old_prev_ctr IS DISTINCT FROM prev_ctr THEN format('prev_ctr:%s->%s', COALESCE(old_prev_ctr::TEXT, 'NULL'), COALESCE(prev_ctr::TEXT, 'NULL')) END,
        CASE WHEN old_prev_cvr IS DISTINCT FROM prev_cvr THEN format('prev_cvr:%s->%s', COALESCE(old_prev_cvr::TEXT, 'NULL'), COALESCE(prev_cvr::TEXT, 'NULL')) END,
        CASE WHEN old_prev_arpu IS DISTINCT FROM prev_arpu THEN format('prev_arpu:%s->%s', COALESCE(old_prev_arpu::TEXT, 'NULL'), COALESCE(prev_arpu::TEXT, 'NULL')) END,
        CASE WHEN old_prev_cpc IS DISTINCT FROM prev_cpc THEN format('prev_cpc:%s->%s', COALESCE(old_prev_cpc::TEXT, 'NULL'), COALESCE(prev_cpc::TEXT, 'NULL')) END
      ), '') AS change_summary
    FROM tmp_month_updated
    ORDER BY month_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: month_period=%, shop_id=%, product_id=%, scene=%, changes=%',
      v_update_detail.month_period,
      v_update_detail.shop_id,
      v_update_detail.product_id,
      v_update_detail.scene,
      COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;

  IF v_updated_rows > v_detail_limit THEN
    RAISE NOTICE 'update detail truncated, shown %, total %', v_detail_limit, v_updated_rows;
  END IF;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_month(DATE, DATE)
IS '按自然月口径，从dwd.taobao_alimama_goods_marketingscene刷新月对比汇总表，仅对真实新增/更新/删除落表。';

COMMIT;
