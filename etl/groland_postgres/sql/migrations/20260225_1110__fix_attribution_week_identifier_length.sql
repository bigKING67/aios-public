BEGIN;

-- Step 1: 将状态表重命名为更短的名称（原名66字符，在DB中被截断为63字符）
ALTER TABLE etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state
  RENAME TO taobao_alimama_mksc_attr_week_refresh_state;

-- Step 2: 将 CHECK 约束重命名（原名72字符，在DB中被截断为63字符）
ALTER TABLE etl.taobao_alimama_mksc_attr_week_refresh_state
  RENAME CONSTRAINT chk_taobao_alimama_goods_marketingscene_attribution_week_refresh_state_id
  TO chk_taobao_alimama_mksc_attr_week_refresh_state_id;

-- Step 3: 删除旧增量刷新过程（原名71字符，在DB中被截断为63字符）
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN);

-- Step 4: 以更短名称重建增量刷新过程，命名规则与月归因版本保持一致
CREATE PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(
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

  INSERT INTO etl.taobao_alimama_mksc_attr_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_dws_refresh_at
  INTO v_last_dws_refresh_at
  FROM etl.taobao_alimama_mksc_attr_week_refresh_state
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

    UPDATE etl.taobao_alimama_mksc_attr_week_refresh_state
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

  UPDATE etl.taobao_alimama_mksc_attr_week_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(INTEGER, BOOLEAN)
IS 'ADS周归因增量刷新：基于DWS周汇总刷新状态水位进行增量计算。';

COMMIT;
