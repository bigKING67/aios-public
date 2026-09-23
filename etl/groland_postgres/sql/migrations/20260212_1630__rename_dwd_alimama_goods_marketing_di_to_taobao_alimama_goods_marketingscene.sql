BEGIN;

CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS etl;

DO $$
BEGIN
  IF to_regclass('dwd.dwd_alimama_goods_marketing_di') IS NOT NULL
     AND to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NULL THEN
    EXECUTE 'ALTER TABLE dwd.dwd_alimama_goods_marketing_di RENAME TO taobao_alimama_goods_marketingscene';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'pk_dwd_alimama_goods_marketing_di'
         AND conrelid = 'dwd.taobao_alimama_goods_marketingscene'::regclass
     ) THEN
    EXECUTE 'ALTER TABLE dwd.taobao_alimama_goods_marketingscene RENAME CONSTRAINT pk_dwd_alimama_goods_marketing_di TO pk_taobao_alimama_goods_marketingscene';
  END IF;
END;
$$;

COMMENT ON TABLE dwd.taobao_alimama_goods_marketingscene IS 'DWD-淘宝阿里妈妈商品营销场景明细清洗表';

CREATE TABLE IF NOT EXISTS etl.taobao_alimama_goods_marketingscene_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_alimama_goods_marketingscene_refresh_state_id CHECK (id = 1)
);

DO $$
BEGIN
  IF to_regclass('etl.alimama_goods_marketing_di_refresh_state') IS NOT NULL THEN
    INSERT INTO etl.taobao_alimama_goods_marketingscene_refresh_state (
      id,
      last_ods_updated_at,
      last_refresh_at,
      last_refresh_start_date,
      last_refresh_end_date,
      created_at,
      updated_at
    )
    SELECT
      id,
      last_ods_updated_at,
      last_refresh_at,
      last_refresh_start_date,
      last_refresh_end_date,
      created_at,
      updated_at
    FROM etl.alimama_goods_marketing_di_refresh_state
    ON CONFLICT (id) DO UPDATE
    SET
      last_ods_updated_at = EXCLUDED.last_ods_updated_at,
      last_refresh_at = EXCLUDED.last_refresh_at,
      last_refresh_start_date = EXCLUDED.last_refresh_start_date,
      last_refresh_end_date = EXCLUDED.last_refresh_end_date,
      updated_at = EXCLUDED.updated_at;

    DROP TABLE etl.alimama_goods_marketing_di_refresh_state;
  END IF;
END;
$$;

COMMENT ON TABLE etl.taobao_alimama_goods_marketingscene_refresh_state IS '淘宝阿里妈妈商品营销场景增量刷新水位状态表。';

INSERT INTO etl.taobao_alimama_goods_marketingscene_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP PROCEDURE IF EXISTS dwd.refresh_dwd_alimama_goods_marketing_di(DATE, DATE);
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
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
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

  DELETE FROM dwd.taobao_alimama_goods_marketingscene
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

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_taobao_alimama_goods_marketingscene(DATE, DATE)
IS '按日期窗口将ods.taobao_one_alimama_goods_marketingscenario刷新到dwd.taobao_alimama_goods_marketingscene。';

DROP PROCEDURE IF EXISTS dwd.refresh_dwd_alimama_goods_marketing_di_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS dwd.refresh_taobao_alimama_goods_marketingscene_incremental(INTEGER, BOOLEAN);

CREATE PROCEDURE dwd.refresh_taobao_alimama_goods_marketingscene_incremental(
  p_fallback_window_days INTEGER DEFAULT 7,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.taobao_alimama_goods_marketingscene_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_ods_updated_at
  INTO v_last_ods_updated_at
  FROM etl.taobao_alimama_goods_marketingscene_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  IF p_init_watermark_only THEN
    IF v_max_updated_at IS NULL THEN
      RAISE NOTICE 'init watermark skipped, source table has no data';
      RETURN;
    END IF;

    UPDATE etl.taobao_alimama_goods_marketingscene_refresh_state
    SET
      last_ods_updated_at = v_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_ods_updated_at %', v_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date),
    MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO
    v_min_date,
    v_max_date,
    v_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

  IF v_min_date IS NULL OR v_max_date IS NULL THEN
    RAISE NOTICE 'no ODS updates since %, skipped', v_last_ods_updated_at;
    RETURN;
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);
  IF v_min_date > v_fallback_start_date THEN
    v_min_date := v_fallback_start_date;
  END IF;

  CALL dwd.refresh_taobao_alimama_goods_marketingscene(v_min_date, v_max_date);

  UPDATE etl.taobao_alimama_goods_marketingscene_refresh_state
  SET
    last_ods_updated_at = GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at)),
    last_refresh_at = v_now,
    last_refresh_start_date = v_min_date,
    last_refresh_end_date = v_max_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], watermark %',
    v_min_date,
    v_max_date,
    COALESCE(v_max_updated_at, v_last_ods_updated_at);
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_taobao_alimama_goods_marketingscene_incremental(INTEGER, BOOLEAN)
IS '淘宝阿里妈妈商品营销场景增量刷新：依据ODS更新时间水位识别变更并刷新DWD。';

COMMIT;
