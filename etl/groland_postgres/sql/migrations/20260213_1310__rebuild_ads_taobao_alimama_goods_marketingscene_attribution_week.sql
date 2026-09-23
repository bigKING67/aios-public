BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DO $$
DECLARE
  v_table RECORD;
BEGIN
  FOR v_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'ads'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS ads.%I CASCADE', v_table.tablename);
  END LOOP;
END;
$$;

DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN);
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state;

CREATE TABLE ads.taobao_alimama_goods_marketingscene_attribution_week (
  week_period VARCHAR(50) NOT NULL,
  shop_id VARCHAR(50) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  scene VARCHAR(50) NOT NULL,
  gmv_growth_rate NUMERIC(10, 4),
  ln_gmv_diff NUMERIC(10, 4),
  imp_contribution NUMERIC(10, 4),
  ctr_contribution NUMERIC(10, 4),
  cvr_contribution NUMERIC(10, 4),
  arpu_contribution NUMERIC(10, 4),
  cpc_change_rate NUMERIC(10, 4),
  primary_negative_factor VARCHAR(50),
  CONSTRAINT pk_taobao_alimama_goods_marketingscene_attribution_week PRIMARY KEY (week_period, shop_id, product_id, scene)
);

COMMENT ON TABLE ads.taobao_alimama_goods_marketingscene_attribution_week IS 'ADS-淘宝阿里妈妈商品营销场景周归因定量分析结果表（周六至周五）';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.week_period IS '周时间段，格式: 2025/2/7～2025/2/13';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.shop_id IS '店铺ID';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.product_id IS '商品ID';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.scene IS '营销场景';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.gmv_growth_rate IS 'GMV环比增长率：(curr_gmv-prev_gmv)/prev_gmv';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.ln_gmv_diff IS 'GMV总变动，理论上等于下方四个因子贡献位之和';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.imp_contribution IS '曝光贡献位：ln(curr_imp/prev_imp)';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.ctr_contribution IS '点击率贡献位：ln(curr_ctr/prev_ctr)';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.cvr_contribution IS '转化率贡献位：ln(curr_cvr/prev_cvr)';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.arpu_contribution IS '客单价贡献位：ln(curr_arpu/prev_arpu)';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.cpc_change_rate IS 'CPC变化率：(curr_cpc-prev_cpc)/prev_cpc';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.primary_negative_factor IS '最大负向贡献因子标签';

CREATE INDEX idx_taobao_alimama_goods_marketingscene_attribution_week_shop_id
ON ads.taobao_alimama_goods_marketingscene_attribution_week (shop_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_attribution_week_product_id
ON ads.taobao_alimama_goods_marketingscene_attribution_week (product_id);

CREATE INDEX idx_taobao_alimama_goods_marketingscene_attribution_week_scene
ON ads.taobao_alimama_goods_marketingscene_attribution_week (scene);

CREATE PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(
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
  IF to_regclass('dws.taobao_alimama_goods_marketingscene_week') IS NULL THEN
    RAISE EXCEPTION 'source table dws.taobao_alimama_goods_marketingscene_week does not exist';
  END IF;

  IF to_regclass('ads.taobao_alimama_goods_marketingscene_attribution_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_alimama_goods_marketingscene_attribution_week does not exist';
  END IF;

  SELECT
    COALESCE(
      p_start_date,
      MIN(to_date(regexp_replace(week_period, '[^0-9/].*$', ''), 'YYYY/FMMM/FMDD'))
    ),
    COALESCE(
      p_end_date,
      MAX(to_date(regexp_replace(week_period, '^.*[^0-9/]', ''), 'YYYY/FMMM/FMDD'))
    )
  INTO v_start_date, v_end_date
  FROM dws.taobao_alimama_goods_marketingscene_week;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dws.taobao_alimama_goods_marketingscene_week has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  IF to_regclass('pg_temp.tmp_ads_week_scope') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_week_scope';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_attribution_week_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_attribution_week_new';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_attribution_week_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_attribution_week_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_attribution_week_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_attribution_week_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_attribution_week_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_attribution_week_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_attribution_week_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_attribution_week_updated';
  END IF;

  CREATE TEMP TABLE tmp_ads_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_attribution_week_new ON COMMIT DROP AS
  WITH source_rows AS (
    SELECT
      src.week_period,
      src.shop_id,
      src.product_id,
      src.scene,
      src.curr_gmv,
      src.curr_imp,
      src.curr_ctr,
      src.curr_cvr,
      src.curr_arpu,
      src.curr_cpc,
      src.prev_gmv,
      src.prev_imp,
      src.prev_ctr,
      src.prev_cvr,
      src.prev_arpu,
      src.prev_cpc
    FROM dws.taobao_alimama_goods_marketingscene_week src
    JOIN tmp_ads_week_scope ws
      ON ws.week_period = src.week_period
  ),
  calculated AS (
    SELECT
      r.week_period,
      r.shop_id,
      r.product_id,
      r.scene,
      CASE
        WHEN COALESCE(r.prev_gmv, 0) > 0 THEN ROUND(((r.curr_gmv - r.prev_gmv) / r.prev_gmv), 4)
        ELSE NULL
      END AS gmv_growth_rate,
      CASE
        WHEN COALESCE(r.curr_gmv, 0) > 0 AND COALESCE(r.prev_gmv, 0) > 0 THEN ROUND(LN(r.curr_gmv / r.prev_gmv), 4)
        ELSE NULL
      END AS ln_gmv_diff,
      CASE
        WHEN COALESCE(r.curr_imp, 0) > 0 AND COALESCE(r.prev_imp, 0) > 0 THEN ROUND(LN(r.curr_imp::NUMERIC / r.prev_imp::NUMERIC), 4)
        ELSE NULL
      END AS imp_contribution,
      CASE
        WHEN r.curr_ctr IS NOT NULL AND r.curr_ctr > 0 AND r.prev_ctr IS NOT NULL AND r.prev_ctr > 0 THEN ROUND(LN(r.curr_ctr / r.prev_ctr), 4)
        ELSE NULL
      END AS ctr_contribution,
      CASE
        WHEN r.curr_cvr IS NOT NULL AND r.curr_cvr > 0 AND r.prev_cvr IS NOT NULL AND r.prev_cvr > 0 THEN ROUND(LN(r.curr_cvr / r.prev_cvr), 4)
        ELSE NULL
      END AS cvr_contribution,
      CASE
        WHEN r.curr_arpu IS NOT NULL AND r.curr_arpu > 0 AND r.prev_arpu IS NOT NULL AND r.prev_arpu > 0 THEN ROUND(LN(r.curr_arpu / r.prev_arpu), 4)
        ELSE NULL
      END AS arpu_contribution,
      CASE
        WHEN r.curr_cpc IS NOT NULL AND r.prev_cpc IS NOT NULL AND r.prev_cpc > 0 THEN ROUND(((r.curr_cpc - r.prev_cpc) / r.prev_cpc), 4)
        ELSE NULL
      END AS cpc_change_rate
    FROM source_rows r
  )
  SELECT
    c.week_period,
    c.shop_id,
    c.product_id,
    c.scene,
    c.gmv_growth_rate,
    c.ln_gmv_diff,
    c.imp_contribution,
    c.ctr_contribution,
    c.cvr_contribution,
    c.arpu_contribution,
    c.cpc_change_rate,
    (
      SELECT
        CASE v.factor
          WHEN 'imp' THEN '曝光下跌'
          WHEN 'ctr' THEN '点击率下跌'
          WHEN 'cvr' THEN '转化率下跌'
          WHEN 'arpu' THEN '客单价下跌'
          ELSE NULL
        END
      FROM (VALUES
        ('imp', c.imp_contribution),
        ('ctr', c.ctr_contribution),
        ('cvr', c.cvr_contribution),
        ('arpu', c.arpu_contribution)
      ) AS v(factor, value)
      WHERE v.value IS NOT NULL AND v.value < 0
      ORDER BY v.value ASC
      LIMIT 1
    ) AS primary_negative_factor
  FROM calculated c;

  CREATE TEMP TABLE tmp_ads_attribution_week_existing ON COMMIT DROP AS
  SELECT t.*
  FROM ads.taobao_alimama_goods_marketingscene_attribution_week t
  JOIN tmp_ads_week_scope ws
    ON ws.week_period = t.week_period;

  CREATE TEMP TABLE tmp_ads_attribution_week_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_ads_attribution_week_new n
  LEFT JOIN tmp_ads_attribution_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE e.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_attribution_week_deleted ON COMMIT DROP AS
  SELECT
    e.week_period,
    e.shop_id,
    e.product_id,
    e.scene
  FROM tmp_ads_attribution_week_existing e
  LEFT JOIN tmp_ads_attribution_week_new n
    ON n.week_period = e.week_period
   AND n.shop_id = e.shop_id
   AND n.product_id = e.product_id
   AND n.scene = e.scene
  WHERE n.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_attribution_week_updated ON COMMIT DROP AS
  SELECT
    n.week_period,
    n.shop_id,
    n.product_id,
    n.scene,
    n.gmv_growth_rate,
    n.ln_gmv_diff,
    n.imp_contribution,
    n.ctr_contribution,
    n.cvr_contribution,
    n.arpu_contribution,
    n.cpc_change_rate,
    n.primary_negative_factor,
    e.gmv_growth_rate AS old_gmv_growth_rate,
    e.ln_gmv_diff AS old_ln_gmv_diff,
    e.imp_contribution AS old_imp_contribution,
    e.ctr_contribution AS old_ctr_contribution,
    e.cvr_contribution AS old_cvr_contribution,
    e.arpu_contribution AS old_arpu_contribution,
    e.cpc_change_rate AS old_cpc_change_rate,
    e.primary_negative_factor AS old_primary_negative_factor
  FROM tmp_ads_attribution_week_new n
  JOIN tmp_ads_attribution_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.gmv_growth_rate,
    n.ln_gmv_diff,
    n.imp_contribution,
    n.ctr_contribution,
    n.cvr_contribution,
    n.arpu_contribution,
    n.cpc_change_rate,
    n.primary_negative_factor
  ) IS DISTINCT FROM ROW(
    e.gmv_growth_rate,
    e.ln_gmv_diff,
    e.imp_contribution,
    e.ctr_contribution,
    e.cvr_contribution,
    e.arpu_contribution,
    e.cpc_change_rate,
    e.primary_negative_factor
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_ads_attribution_week_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_ads_attribution_week_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_ads_attribution_week_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_ads_attribution_week_new n
  JOIN tmp_ads_attribution_week_existing e
    ON e.week_period = n.week_period
   AND e.shop_id = n.shop_id
   AND e.product_id = n.product_id
   AND e.scene = n.scene
  WHERE ROW(
    n.gmv_growth_rate,
    n.ln_gmv_diff,
    n.imp_contribution,
    n.ctr_contribution,
    n.cvr_contribution,
    n.arpu_contribution,
    n.cpc_change_rate,
    n.primary_negative_factor
  ) IS NOT DISTINCT FROM ROW(
    e.gmv_growth_rate,
    e.ln_gmv_diff,
    e.imp_contribution,
    e.ctr_contribution,
    e.cvr_contribution,
    e.arpu_contribution,
    e.cpc_change_rate,
    e.primary_negative_factor
  );

  DELETE FROM ads.taobao_alimama_goods_marketingscene_attribution_week t
  USING tmp_ads_attribution_week_deleted d
  WHERE t.week_period = d.week_period
    AND t.shop_id = d.shop_id
    AND t.product_id = d.product_id
    AND t.scene = d.scene;

  UPDATE ads.taobao_alimama_goods_marketingscene_attribution_week t
  SET
    gmv_growth_rate = u.gmv_growth_rate,
    ln_gmv_diff = u.ln_gmv_diff,
    imp_contribution = u.imp_contribution,
    ctr_contribution = u.ctr_contribution,
    cvr_contribution = u.cvr_contribution,
    arpu_contribution = u.arpu_contribution,
    cpc_change_rate = u.cpc_change_rate,
    primary_negative_factor = u.primary_negative_factor
  FROM tmp_ads_attribution_week_updated u
  WHERE t.week_period = u.week_period
    AND t.shop_id = u.shop_id
    AND t.product_id = u.product_id
    AND t.scene = u.scene;

  INSERT INTO ads.taobao_alimama_goods_marketingscene_attribution_week (
    week_period,
    shop_id,
    product_id,
    scene,
    gmv_growth_rate,
    ln_gmv_diff,
    imp_contribution,
    ctr_contribution,
    cvr_contribution,
    arpu_contribution,
    cpc_change_rate,
    primary_negative_factor
  )
  SELECT
    week_period,
    shop_id,
    product_id,
    scene,
    gmv_growth_rate,
    ln_gmv_diff,
    imp_contribution,
    ctr_contribution,
    cvr_contribution,
    arpu_contribution,
    cpc_change_rate,
    primary_negative_factor
  FROM tmp_ads_attribution_week_inserted;

  RAISE NOTICE 'refresh_taobao_alimama_goods_marketingscene_attribution_week completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
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
      gmv_growth_rate,
      ln_gmv_diff
    FROM tmp_ads_attribution_week_inserted
    ORDER BY week_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: week_period=%, shop_id=%, product_id=%, scene=%, gmv_growth_rate=%, ln_gmv_diff=%',
      v_insert_detail.week_period,
      v_insert_detail.shop_id,
      v_insert_detail.product_id,
      v_insert_detail.scene,
      v_insert_detail.gmv_growth_rate,
      v_insert_detail.ln_gmv_diff;
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
        CASE WHEN old_gmv_growth_rate IS DISTINCT FROM gmv_growth_rate THEN format('gmv_growth_rate:%s->%s', COALESCE(old_gmv_growth_rate::TEXT, 'NULL'), COALESCE(gmv_growth_rate::TEXT, 'NULL')) END,
        CASE WHEN old_ln_gmv_diff IS DISTINCT FROM ln_gmv_diff THEN format('ln_gmv_diff:%s->%s', COALESCE(old_ln_gmv_diff::TEXT, 'NULL'), COALESCE(ln_gmv_diff::TEXT, 'NULL')) END,
        CASE WHEN old_imp_contribution IS DISTINCT FROM imp_contribution THEN format('imp_contribution:%s->%s', COALESCE(old_imp_contribution::TEXT, 'NULL'), COALESCE(imp_contribution::TEXT, 'NULL')) END,
        CASE WHEN old_ctr_contribution IS DISTINCT FROM ctr_contribution THEN format('ctr_contribution:%s->%s', COALESCE(old_ctr_contribution::TEXT, 'NULL'), COALESCE(ctr_contribution::TEXT, 'NULL')) END,
        CASE WHEN old_cvr_contribution IS DISTINCT FROM cvr_contribution THEN format('cvr_contribution:%s->%s', COALESCE(old_cvr_contribution::TEXT, 'NULL'), COALESCE(cvr_contribution::TEXT, 'NULL')) END,
        CASE WHEN old_arpu_contribution IS DISTINCT FROM arpu_contribution THEN format('arpu_contribution:%s->%s', COALESCE(old_arpu_contribution::TEXT, 'NULL'), COALESCE(arpu_contribution::TEXT, 'NULL')) END,
        CASE WHEN old_cpc_change_rate IS DISTINCT FROM cpc_change_rate THEN format('cpc_change_rate:%s->%s', COALESCE(old_cpc_change_rate::TEXT, 'NULL'), COALESCE(cpc_change_rate::TEXT, 'NULL')) END,
        CASE WHEN old_primary_negative_factor IS DISTINCT FROM primary_negative_factor THEN format('primary_negative_factor:%s->%s', COALESCE(old_primary_negative_factor::TEXT, 'NULL'), COALESCE(primary_negative_factor::TEXT, 'NULL')) END
      ), '') AS change_summary
    FROM tmp_ads_attribution_week_updated
    ORDER BY week_period, shop_id, product_id, scene
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: week_period=%, shop_id=%, product_id=%, scene=%, changes=%',
      v_update_detail.week_period,
      v_update_detail.shop_id,
      v_update_detail.product_id,
      v_update_detail.scene,
      COALESCE(v_update_detail.change_summary, '无字段变化');
  END LOOP;

  IF v_updated_rows > v_detail_limit THEN
    RAISE NOTICE 'update detail truncated, shown %, total %', v_detail_limit, v_updated_rows;
  END IF;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(DATE, DATE)
IS '按周窗口刷新ADS周归因结果，仅对真实新增/更新/删除数据落表。';

CREATE TABLE etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_dws_refresh_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_alimama_goods_marketingscene_attribution_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state IS 'ADS周归因增量刷新水位状态表。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state.last_dws_refresh_at IS '最近一次已处理的DWS周汇总刷新时间水位。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state.last_refresh_at IS '最近一次ADS刷新执行时间。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state.last_refresh_start_date IS '最近一次ADS刷新窗口起始日期。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state.last_refresh_end_date IS '最近一次ADS刷新窗口结束日期。';

INSERT INTO etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_dws_refresh_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_refresh_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_start_date DATE;
  v_source_end_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('dws.taobao_alimama_goods_marketingscene_week') IS NULL THEN
    RAISE EXCEPTION 'source table dws.taobao_alimama_goods_marketingscene_week does not exist';
  END IF;

  IF to_regclass('etl.taobao_alimama_goods_marketingscene_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'source state table etl.taobao_alimama_goods_marketingscene_week_refresh_state does not exist';
  END IF;

  IF to_regclass('ads.taobao_alimama_goods_marketingscene_attribution_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_alimama_goods_marketingscene_attribution_week does not exist';
  END IF;

  INSERT INTO etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_dws_refresh_at
  INTO v_last_dws_refresh_at
  FROM etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    last_refresh_at,
    last_refresh_start_date,
    last_refresh_end_date
  INTO
    v_source_refresh_at,
    v_source_start_date,
    v_source_end_date
  FROM etl.taobao_alimama_goods_marketingscene_week_refresh_state
  WHERE id = 1;

  IF p_init_watermark_only THEN
    IF v_source_refresh_at IS NULL THEN
      RAISE NOTICE 'init watermark skipped, source refresh state has no refresh record';
      RETURN;
    END IF;

    UPDATE etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state
    SET
      last_dws_refresh_at = v_source_refresh_at,
      last_refresh_at = v_now,
      last_refresh_start_date = v_source_start_date,
      last_refresh_end_date = v_source_end_date,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_dws_refresh_at %', v_source_refresh_at;
    RETURN;
  END IF;

  IF v_source_refresh_at IS NULL THEN
    RAISE NOTICE 'source refresh state has no refresh record, skipped';
    RETURN;
  END IF;

  IF v_source_refresh_at <= v_last_dws_refresh_at THEN
    RAISE NOTICE 'no DWS updates since %, skipped', v_last_dws_refresh_at;
    RETURN;
  END IF;

  v_refresh_start_date := COALESCE(v_source_start_date, CURRENT_DATE - (p_fallback_window_days - 1));
  v_refresh_end_date := COALESCE(v_source_end_date, CURRENT_DATE);
  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

  IF v_refresh_start_date > v_fallback_start_date THEN
    v_refresh_start_date := v_fallback_start_date;
  END IF;

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_refresh_end_date;
  END IF;

  CALL ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state
  SET
    last_dws_refresh_at = v_source_refresh_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], source_refresh_at %',
    v_refresh_start_date,
    v_refresh_end_date,
    v_source_refresh_at;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN)
IS 'ADS周归因增量刷新：基于DWS周汇总刷新状态水位进行增量计算。';

CALL ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(NULL, NULL);
CALL ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(14, TRUE);

COMMIT;
