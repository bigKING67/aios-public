BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'influencer_live_detail'
      AND column_name = 'anchor_id'
  ) THEN
    ALTER TABLE ads.influencer_live_detail RENAME COLUMN anchor_id TO influencer_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'influencer_live_detail'
      AND column_name = 'anchor_nickname'
  ) THEN
    ALTER TABLE ads.influencer_live_detail RENAME COLUMN anchor_nickname TO influencer_nickname;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('ads.idx_influencer_live_detail_platform_anchor_date') IS NOT NULL
     AND to_regclass('ads.idx_influencer_live_detail_platform_influencer_date') IS NULL THEN
    ALTER INDEX ads.idx_influencer_live_detail_platform_anchor_date
      RENAME TO idx_influencer_live_detail_platform_influencer_date;
  END IF;
END
$$;

COMMENT ON TABLE ads.influencer_live_detail
IS '直播达人看板明细表：仅保留名册内达人对应的直播日粒度事实。';

COMMENT ON COLUMN ads.influencer_live_detail.influencer_id
IS '达人ID（当前映射自 ODS.anchor_douyin_id）。';

COMMENT ON COLUMN ads.influencer_live_detail.influencer_nickname
IS '达人昵称（同平台同达人当日取非空最大值）。';

COMMENT ON COLUMN ads.influencer_live_detail.source_max_updated_at
IS '当日聚合行覆盖的最大 ODS.updated_at。';

COMMENT ON INDEX ads.idx_influencer_live_detail_platform_influencer_date
IS '直播达人事实按 platform+influencer_id+date 查询索引（看板关联键）。';

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_influencer_roster()
LANGUAGE plpgsql
AS $$
DECLARE
  v_latest_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_inserted_rows INTEGER;
BEGIN
  IF to_regclass('ods.feishu_influencer_live') IS NULL THEN
    RAISE EXCEPTION 'source table ods.feishu_influencer_live does not exist';
  END IF;

  SELECT MAX(etl_loaded_at)
  INTO v_latest_loaded_at
  FROM ods.feishu_influencer_live;

  TRUNCATE TABLE ads.influencer_live_roster;

  IF v_latest_loaded_at IS NULL THEN
    RAISE NOTICE 'refresh_creator_live_influencer_roster skipped, source table is empty';
    RETURN;
  END IF;

  INSERT INTO ads.influencer_live_roster (
    sequence_no,
    influencer_name,
    influencer_id,
    anchor_desc,
    anchor_level,
    platform,
    main_platform_fans,
    sales_30d,
    sales_90d,
    cooperation_status,
    cooperation_status_norm,
    cooperation_desc,
    owner_name,
    source_file_name,
    source_etl_loaded_at
  )
  SELECT
    src.sequence_no,
    COALESCE(NULLIF(BTRIM(src.influencer_name), ''), '(未命名达人)') AS influencer_name,
    COALESCE(
      NULLIF(BTRIM(src.influencer_id), ''),
      CASE
        WHEN BTRIM(src.influencer_name) = 'NC妮蔻'
         AND COALESCE(NULLIF(BTRIM(src.platform), ''), '抖音') LIKE '%抖音%'
          THEN 'Nicolechenyn'
        ELSE NULL::TEXT
      END
    ) AS influencer_id,
    NULLIF(BTRIM(src.anchor_desc), '') AS anchor_desc,
    NULLIF(BTRIM(src.anchor_level), '') AS anchor_level,
    NULLIF(BTRIM(src.platform), '') AS platform,
    NULLIF(BTRIM(src.main_platform_fans), '') AS main_platform_fans,
    NULLIF(BTRIM(src.sales_30d), '') AS sales_30d,
    NULLIF(BTRIM(src.sales_90d), '') AS sales_90d,
    NULLIF(BTRIM(src.cooperation_status), '') AS cooperation_status,
    COALESCE(NULLIF(BTRIM(src.cooperation_status), ''), '未分类') AS cooperation_status_norm,
    NULLIF(BTRIM(src.cooperation_desc), '') AS cooperation_desc,
    NULLIF(BTRIM(src.owner_name), '') AS owner_name,
    src.source_file_name,
    src.etl_loaded_at
  FROM ods.feishu_influencer_live src
  WHERE src.etl_loaded_at = v_latest_loaded_at;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_live_influencer_roster completed, source_etl_loaded_at: %, inserted_rows: %',
    v_latest_loaded_at,
    v_inserted_rows;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_trade_daily(
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
  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_live_raw does not exist';
  END IF;

  IF to_regclass('ads.influencer_live_roster') IS NULL THEN
    RAISE EXCEPTION 'source table ads.influencer_live_roster does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(DATE(src.live_start_time))),
    COALESCE(p_end_date, MAX(DATE(src.live_start_time)))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'refresh_creator_live_trade_daily skipped, source table has no live_start_time rows';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'invalid date range, start_date % is after end_date %', v_start_date, v_end_date;
  END IF;

  CREATE TEMP TABLE tmp_influencer_live_detail_new ON COMMIT DROP AS
  WITH roster_identity_map AS (
    SELECT DISTINCT
      CASE
        WHEN NULLIF(BTRIM(r.platform), '') IS NULL THEN NULL::TEXT
        WHEN BTRIM(r.platform) IN ('多平台', '全平台', '全域') THEN NULL::TEXT
        WHEN BTRIM(r.platform) IN ('淘宝', '天猫') THEN '天猫'
        WHEN BTRIM(r.platform) LIKE '%淘宝%' THEN '天猫'
        WHEN BTRIM(r.platform) LIKE '%天猫%' THEN '天猫'
        WHEN BTRIM(r.platform) LIKE '%抖音%' THEN '抖音'
        WHEN BTRIM(r.platform) LIKE '%小红书%' THEN '小红书'
        ELSE BTRIM(r.platform)
      END AS platform_key,
      NULLIF(BTRIM(r.influencer_id), '') AS influencer_id_key
    FROM ads.influencer_live_roster r
    WHERE NULLIF(BTRIM(r.influencer_id), '') IS NOT NULL
  )
  SELECT
    '抖音'::TEXT AS platform,
    DATE(src.live_start_time) AS stat_date,
    BTRIM(src.anchor_douyin_id) AS influencer_id,
    MAX(NULLIF(BTRIM(src.anchor_nickname), '')) AS influencer_nickname,
    MAX(NULLIF(BTRIM(src.shop_id), '')) AS shop_id,
    MAX(NULLIF(BTRIM(src.shop_name), '')) AS shop_name,
    COUNT(*)::INTEGER AS live_session_count,
    SUM(COALESCE(src.live_duration_minutes, 0))::BIGINT AS live_duration_minutes,
    SUM(COALESCE(src.live_watch_user_count, 0))::BIGINT AS live_watch_user_count,
    SUM(COALESCE(src.live_exposure_user_count, 0))::BIGINT AS live_exposure_user_count,
    SUM(COALESCE(src.live_product_click_user, 0))::BIGINT AS live_product_click_user,
    SUM(COALESCE(src.live_order_count, 0))::BIGINT AS live_order_count,
    SUM(COALESCE(src.live_refund_order_count, 0))::BIGINT AS live_refund_order_count,
    SUM(COALESCE(src.live_buyer_count, 0))::BIGINT AS live_buyer_count,
    SUM(COALESCE(src.live_gmv, 0))::NUMERIC(18, 2) AS live_gmv,
    SUM(COALESCE(src.live_user_pay_amount, 0))::NUMERIC(18, 2) AS live_user_pay_amount,
    SUM(COALESCE(src.live_refund_amount, 0))::NUMERIC(18, 2) AS live_refund_amount,
    SUM(COALESCE(src.live_ad_cost, 0))::NUMERIC(18, 2) AS live_ad_cost,
    MAX(src.updated_at) AS source_max_updated_at
  FROM ods.douyin_trade_sale_live_raw src
  INNER JOIN roster_identity_map rim
    ON rim.platform_key = '抖音'
   AND rim.influencer_id_key = NULLIF(BTRIM(src.anchor_douyin_id), '')
  WHERE src.live_start_time IS NOT NULL
    AND NULLIF(BTRIM(src.anchor_douyin_id), '') IS NOT NULL
    AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  GROUP BY
    DATE(src.live_start_time),
    BTRIM(src.anchor_douyin_id);

  DELETE FROM ads.influencer_live_detail t
  WHERE t.stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.influencer_live_detail (
    platform,
    stat_date,
    influencer_id,
    influencer_nickname,
    shop_id,
    shop_name,
    live_session_count,
    live_duration_minutes,
    live_watch_user_count,
    live_exposure_user_count,
    live_product_click_user,
    live_order_count,
    live_refund_order_count,
    live_buyer_count,
    live_gmv,
    live_user_pay_amount,
    live_refund_amount,
    live_ad_cost,
    source_max_updated_at
  )
  SELECT
    n.platform,
    n.stat_date,
    n.influencer_id,
    n.influencer_nickname,
    n.shop_id,
    n.shop_name,
    n.live_session_count,
    n.live_duration_minutes,
    n.live_watch_user_count,
    n.live_exposure_user_count,
    n.live_product_click_user,
    n.live_order_count,
    n.live_refund_order_count,
    n.live_buyer_count,
    n.live_gmv,
    n.live_user_pay_amount,
    n.live_refund_amount,
    n.live_ad_cost,
    n.source_max_updated_at
  FROM tmp_influencer_live_detail_new n;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_live_trade_daily completed, deleted_rows: %, inserted_rows: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_dashboard(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
  CALL ads.refresh_creator_live_influencer_roster();
  CALL ads.refresh_creator_live_trade_daily(p_start_date, p_end_date);
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_dashboard_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER;
  v_lock_acquired BOOLEAN := FALSE;
  v_latest_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_latest_live_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_live_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_need_refresh_roster BOOLEAN := FALSE;
  v_need_refresh_trade BOOLEAN := FALSE;
  v_trade_refreshed BOOLEAN := FALSE;
  v_changed_min_date DATE;
  v_changed_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
BEGIN
  IF to_regclass('etl.creator_live_dashboard_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.creator_live_dashboard_refresh_state does not exist';
  END IF;

  v_fallback_window_days := GREATEST(COALESCE(p_fallback_window_days, 14), 1);

  v_lock_acquired := pg_try_advisory_lock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'refresh_creator_live_dashboard_incremental skipped, advisory lock busy';
    RETURN;
  END IF;

  BEGIN
    SELECT
      s.last_feishu_loaded_at,
      s.last_live_updated_at
    INTO v_prev_feishu_loaded_at, v_prev_live_updated_at
    FROM etl.creator_live_dashboard_refresh_state s
    WHERE s.state_key = 'default'
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO etl.creator_live_dashboard_refresh_state (state_key)
      VALUES ('default')
      ON CONFLICT (state_key) DO NOTHING;

      SELECT
        s.last_feishu_loaded_at,
        s.last_live_updated_at
      INTO v_prev_feishu_loaded_at, v_prev_live_updated_at
      FROM etl.creator_live_dashboard_refresh_state s
      WHERE s.state_key = 'default'
      FOR UPDATE;
    END IF;

    SELECT MAX(src.etl_loaded_at)
    INTO v_latest_feishu_loaded_at
    FROM ods.feishu_influencer_live src;

    SELECT MAX(src.updated_at)
    INTO v_latest_live_updated_at
    FROM ods.douyin_trade_sale_live_raw src;

    IF p_init_watermark_only THEN
      UPDATE etl.creator_live_dashboard_refresh_state
      SET
        last_feishu_loaded_at = v_latest_feishu_loaded_at,
        last_live_updated_at = v_latest_live_updated_at,
        last_refresh_at = NOW(),
        updated_at = NOW()
      WHERE state_key = 'default';

      RAISE NOTICE
        'refresh_creator_live_dashboard_incremental watermark initialized, last_feishu_loaded_at: %, last_live_updated_at: %',
        v_latest_feishu_loaded_at,
        v_latest_live_updated_at;

      PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
      RETURN;
    END IF;

    v_need_refresh_roster :=
      v_latest_feishu_loaded_at IS NOT NULL
      AND (v_prev_feishu_loaded_at IS NULL OR v_latest_feishu_loaded_at > v_prev_feishu_loaded_at);

    v_need_refresh_trade :=
      v_latest_live_updated_at IS NOT NULL
      AND (v_prev_live_updated_at IS NULL OR v_latest_live_updated_at > v_prev_live_updated_at);

    IF v_need_refresh_roster THEN
      CALL ads.refresh_creator_live_influencer_roster();
    END IF;

    IF v_need_refresh_roster THEN
      SELECT
        MIN(DATE(src.live_start_time)),
        MAX(DATE(src.live_start_time))
      INTO v_refresh_start_date, v_refresh_end_date
      FROM ods.douyin_trade_sale_live_raw src
      WHERE src.live_start_time IS NOT NULL;

      CALL ads.refresh_creator_live_trade_daily(NULL, NULL);
      v_trade_refreshed := TRUE;
    ELSIF v_need_refresh_trade THEN
      IF v_prev_live_updated_at IS NULL THEN
        SELECT
          MIN(DATE(src.live_start_time)),
          MAX(DATE(src.live_start_time))
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_live_raw src
        WHERE src.live_start_time IS NOT NULL;
      ELSE
        SELECT
          MIN(DATE(src.live_start_time)),
          MAX(DATE(src.live_start_time))
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_live_raw src
        WHERE src.live_start_time IS NOT NULL
          AND src.updated_at > v_prev_live_updated_at;
      END IF;

      IF v_changed_max_date IS NOT NULL THEN
        v_refresh_end_date := v_changed_max_date;
        v_refresh_start_date := LEAST(v_changed_min_date, v_changed_max_date - (v_fallback_window_days - 1));
      END IF;

      IF v_refresh_start_date IS NOT NULL AND v_refresh_end_date IS NOT NULL THEN
        CALL ads.refresh_creator_live_trade_daily(v_refresh_start_date, v_refresh_end_date);
        v_trade_refreshed := TRUE;
      END IF;
    END IF;

    UPDATE etl.creator_live_dashboard_refresh_state
    SET
      last_feishu_loaded_at = COALESCE(v_latest_feishu_loaded_at, last_feishu_loaded_at),
      last_live_updated_at = COALESCE(v_latest_live_updated_at, last_live_updated_at),
      last_refresh_at = NOW(),
      last_refresh_start_date = v_refresh_start_date,
      last_refresh_end_date = v_refresh_end_date,
      updated_at = NOW()
    WHERE state_key = 'default';

    RAISE NOTICE
      'refresh_creator_live_dashboard_incremental completed, roster_refreshed: %, trade_refreshed: %, window: [% - %], fallback_window_days: %',
      v_need_refresh_roster,
      v_trade_refreshed,
      COALESCE(v_refresh_start_date::TEXT, 'N/A'),
      COALESCE(v_refresh_end_date::TEXT, 'N/A'),
      v_fallback_window_days;

    PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
  EXCEPTION
    WHEN OTHERS THEN
      IF v_lock_acquired THEN
        PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_live_dashboard_incremental'));
      END IF;
      RAISE;
  END;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_influencer_roster()
IS '刷新直播达人名册快照（ads.influencer_live_roster）：仅保留 ods.feishu_influencer_live 最新批次；NC妮蔻缺失ID时按规则回填 Nicolechenyn。';

COMMENT ON PROCEDURE ads.refresh_creator_live_trade_daily(DATE, DATE)
IS '刷新直播达人明细（ads.influencer_live_detail）：按窗口重建且仅保留名册内达人。';

COMMENT ON PROCEDURE ads.refresh_creator_live_dashboard_incremental(INTEGER, BOOLEAN)
IS '直播达人看板增量刷新：先名册后明细；名册变化时强制重建明细，避免关联键错配。';

CALL ads.refresh_creator_live_dashboard(NULL, NULL);
CALL ads.refresh_creator_live_dashboard_incremental(14, TRUE);

COMMIT;
