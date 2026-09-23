BEGIN;

CREATE SCHEMA IF NOT EXISTS dws;

DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_week(DATE, DATE);
DROP TABLE IF EXISTS dws.taobao_alimama_goods_marketingscene_week;

CREATE TABLE dws.taobao_alimama_goods_marketingscene_week (
  week_period VARCHAR(50) NOT NULL,
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
  CONSTRAINT pk_taobao_alimama_goods_marketingscene_week PRIMARY KEY (week_period, shop_id, product_id, scene)
);

COMMENT ON TABLE dws.taobao_alimama_goods_marketingscene_week IS 'DWS-淘宝阿里妈妈商品营销场景周汇总对比表（周六至周五）';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.week_period IS '周时间段，格式: 2025/2/7～2025/2/13';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.shop_id IS '店铺ID';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.product_id IS '商品ID';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.scene IS '原始场景';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_gmv IS '本周成交总额';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_imp IS '本周展现量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_click IS '本周点击量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_cost IS '本周消耗';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_ctr IS '本周点击率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_cvr IS '本周点击转化率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_arpu IS '本周客单价(周总GMV/周总成交人数)';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.curr_cpc IS '本周平均点击成本(周总消耗/周点击数)';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_gmv IS '上周(环比周)成交总额';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_imp IS '上周(环比周)展现量';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_ctr IS '上周(环比周)点击率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_cvr IS '上周(环比周)点击转化率';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_arpu IS '上周(环比周)客单价';
COMMENT ON COLUMN dws.taobao_alimama_goods_marketingscene_week.prev_cpc IS '上周(环比周)平均点击成本';

CREATE INDEX idx_taobao_alimama_goods_marketingscene_week_shop_id
ON dws.taobao_alimama_goods_marketingscene_week (shop_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_week_product_id
ON dws.taobao_alimama_goods_marketingscene_week (product_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_week_scene
ON dws.taobao_alimama_goods_marketingscene_week (scene);

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

  -- 周定义：周六到周五
  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  WITH week_scope AS (
    SELECT gs::DATE AS week_start
    FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs
  )
  DELETE FROM dws.taobao_alimama_goods_marketingscene_week t
  USING week_scope w
  WHERE t.week_period =
    to_char(w.week_start, 'YYYY/FMMM/FMDD') || '～' || to_char((w.week_start + 6), 'YYYY/FMMM/FMDD');

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

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

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene_week completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_week(DATE, DATE)
IS '按周六至周五口径，从dwd.taobao_alimama_goods_marketingscene刷新周对比汇总表。';

CALL dws.refresh_taobao_alimama_goods_marketingscene_week(NULL, NULL);

COMMIT;
