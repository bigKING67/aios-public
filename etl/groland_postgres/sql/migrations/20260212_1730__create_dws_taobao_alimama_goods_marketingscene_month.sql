BEGIN;

CREATE SCHEMA IF NOT EXISTS dws;

DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_month(DATE, DATE);
DROP TABLE IF EXISTS dws.taobao_alimama_goods_marketingscene_month;

CREATE TABLE dws.taobao_alimama_goods_marketingscene_month (
  month_period VARCHAR(20) NOT NULL,
  shop_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  scene VARCHAR(50) NOT NULL,
  curr_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_imp BIGINT NOT NULL DEFAULT 0,
  curr_click BIGINT NOT NULL DEFAULT 0,
  curr_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_ctr NUMERIC(10, 6),
  curr_cvr NUMERIC(10, 6),
  curr_arpu NUMERIC(18, 2),
  curr_cpc NUMERIC(18, 2),
  prev_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_imp BIGINT NOT NULL DEFAULT 0,
  prev_ctr NUMERIC(10, 6),
  prev_cvr NUMERIC(10, 6),
  prev_arpu NUMERIC(18, 2),
  prev_cpc NUMERIC(18, 2),
  CONSTRAINT pk_taobao_alimama_goods_marketingscene_month PRIMARY KEY (month_period, shop_id, product_id, scene)
);

COMMENT ON TABLE dws.taobao_alimama_goods_marketingscene_month IS 'DWS-淘宝阿里妈妈商品营销场景月汇总对比表';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.month_period IS '月份，格式: 2025/02';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.shop_id IS '店铺ID';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.product_id IS '商品ID';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.scene IS '原始场景';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_gmv IS '本月成交总额';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_imp IS '本月展现量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_click IS '本月点击量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_cost IS '本月消耗';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_ctr IS '本月点击率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_cvr IS '本月点击转化率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_arpu IS '本月客单价';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.curr_cpc IS '本月点击成本';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_gmv IS '上月成交总额';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_imp IS '上月展现量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_ctr IS '上月点击率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_cvr IS '上月点击转化率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_arpu IS '上月客单价';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_month.prev_cpc IS '上月点击成本';

CREATE INDEX idx_taobao_alimama_goods_marketingscene_month_shop_id
ON dws.taobao_alimama_goods_marketingscene_month (shop_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_month_product_id
ON dws.taobao_alimama_goods_marketingscene_month (product_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_month_scene
ON dws.taobao_alimama_goods_marketingscene_month (scene);

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
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
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

  WITH month_scope AS (
    SELECT gs::DATE AS month_start
    FROM generate_series(v_effective_start, v_effective_end, INTERVAL '1 month') AS gs
  )
  DELETE FROM dws.taobao_alimama_goods_marketingscene_month t
  USING month_scope m
  WHERE t.month_period = to_char(m.month_start, 'YYYY/MM');

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

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

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene_month completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_month(DATE, DATE)
IS '按自然月口径，从dwd.taobao_alimama_goods_marketingscene刷新月对比汇总表。';

CALL dws.refresh_taobao_alimama_goods_marketingscene_month(NULL, NULL);

COMMIT;
