BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_dashboard_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_dashboard(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_detail(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_influencer_roster();
DROP TABLE IF EXISTS etl.creator_shortvideo_dashboard_refresh_state;
DROP TABLE IF EXISTS ads.influencer_shortvideo_detail;
DROP TABLE IF EXISTS ads.influencer_shortvideo_roster;

CREATE TABLE ads.influencer_shortvideo_roster (
  id BIGSERIAL PRIMARY KEY,
  sequence_no INTEGER,
  influencer_name TEXT NOT NULL,
  influencer_id TEXT,
  anchor_desc TEXT,
  anchor_level TEXT,
  platform TEXT,
  main_platform_fans TEXT,
  sales_30d TEXT,
  sales_90d TEXT,
  cooperation_status TEXT,
  cooperation_status_norm TEXT NOT NULL DEFAULT '未分类',
  cooperation_desc TEXT,
  owner_name TEXT,
  source_file_name TEXT NOT NULL,
  source_etl_loaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ads.influencer_shortvideo_roster IS '短视频挂车达人看板名册快照（来自 ods.feishu_influencer_shortvideo 最新批次）。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.id IS '主键ID。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.sequence_no IS '名册序号。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.influencer_name IS '达人名称（为空时回填为“未命名达人”）。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.influencer_id IS '达人ID（优先用于和短视频销售源 author_douyin_id 关联）。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.anchor_desc IS '达人描述。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.anchor_level IS '达人等级。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.platform IS '平台归属。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.main_platform_fans IS '主平台粉丝数。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.sales_30d IS '近30天销售额文本。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.sales_90d IS '近90天销售额文本。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.cooperation_status IS '合作状态原始值。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.cooperation_status_norm IS '合作状态规范值（空值统一为“未分类”）。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.cooperation_desc IS '合作描述。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.owner_name IS '负责人。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.source_file_name IS '来源文件名。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.source_etl_loaded_at IS '来源批次加载时间。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.influencer_shortvideo_roster.updated_at IS '记录更新时间。';

CREATE INDEX idx_influencer_shortvideo_roster_status
  ON ads.influencer_shortvideo_roster (cooperation_status_norm, sequence_no, id);

CREATE INDEX idx_influencer_shortvideo_roster_platform_influencer_id
  ON ads.influencer_shortvideo_roster (platform, influencer_id);

COMMENT ON INDEX ads.idx_influencer_shortvideo_roster_status IS '短视频达人名册按合作状态分组排序索引。';
COMMENT ON INDEX ads.idx_influencer_shortvideo_roster_platform_influencer_id IS '短视频达人名册按平台+达人ID关联索引。';

CREATE TABLE ads.influencer_shortvideo_detail (
  platform TEXT NOT NULL,
  stat_date DATE NOT NULL,
  influencer_id TEXT NOT NULL,
  influencer_nickname TEXT,
  shop_id TEXT,
  shop_name TEXT,
  shortvideo_count INTEGER NOT NULL DEFAULT 0,
  shortvideo_view_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_duration_minutes BIGINT NOT NULL DEFAULT 0,
  shortvideo_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_product_click_user BIGINT NOT NULL DEFAULT 0,
  shortvideo_order_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_refund_order_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_buyer_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  latest_publish_time TIMESTAMP WITHOUT TIME ZONE,
  source_max_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT influencer_shortvideo_detail_pkey PRIMARY KEY (platform, stat_date, influencer_id),
  CONSTRAINT chk_influencer_shortvideo_detail_non_negative CHECK (
    shortvideo_count >= 0
    AND shortvideo_view_count >= 0
    AND shortvideo_duration_minutes >= 0
    AND shortvideo_exposure_user_count >= 0
    AND shortvideo_product_click_user >= 0
    AND shortvideo_order_count >= 0
    AND shortvideo_refund_order_count >= 0
    AND shortvideo_buyer_count >= 0
    AND shortvideo_gmv >= 0
    AND shortvideo_user_pay_amount >= 0
    AND shortvideo_refund_amount >= 0
    AND shortvideo_ad_cost >= 0
    AND shortvideo_live_room_pay_amount >= 0
    AND shortvideo_search_after_view_pay_amount >= 0
    AND shortvideo_shop_page_pay_amount >= 0
  )
);

COMMENT ON TABLE ads.influencer_shortvideo_detail IS '短视频挂车达人看板明细表（日粒度，按平台+达人聚合）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.platform IS '平台（当前固定抖音，保留多平台扩展）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.stat_date IS '短视频数据日期（来自 ODS.stat_date）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.influencer_id IS '达人ID（来自 author_douyin_id，按名册关联后保留）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.influencer_nickname IS '达人昵称（当日非空最大值）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shop_id IS '店铺ID（当日非空最大值）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shop_name IS '店铺名称（当日非空最大值）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_count IS '当日挂车短视频数（按 video_id 去重计数）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_view_count IS '当日短视频播放次数汇总。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_duration_minutes IS '当日短视频总时长（分钟，当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_exposure_user_count IS '当日短视频曝光人数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_product_click_user IS '当日短视频商品点击人数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_order_count IS '当日短视频订单数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_refund_order_count IS '当日短视频退款订单数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_buyer_count IS '当日短视频成交人数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_gmv IS '当日短视频成交金额（user_pay_amount 汇总）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_user_pay_amount IS '当日短视频支付金额（当前同 shortvideo_gmv）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_refund_amount IS '当日短视频退款金额汇总。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_ad_cost IS '当日短视频投流成本（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_live_room_pay_amount IS '当日直播间成交金额汇总。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_search_after_view_pay_amount IS '当日看后搜成交金额汇总。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.shortvideo_shop_page_pay_amount IS '当日商品详情页成交金额汇总。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.latest_publish_time IS '当日覆盖视频的最新发布时间（展示字段，不参与聚合分组）。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.source_max_updated_at IS '当日聚合行覆盖的最大 ODS.updated_at。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.influencer_shortvideo_detail.updated_at IS '记录更新时间。';

CREATE INDEX idx_influencer_shortvideo_detail_date
  ON ads.influencer_shortvideo_detail (stat_date);

CREATE INDEX idx_influencer_shortvideo_detail_platform_date
  ON ads.influencer_shortvideo_detail (platform, stat_date DESC);

CREATE INDEX idx_influencer_shortvideo_detail_platform_influencer_date
  ON ads.influencer_shortvideo_detail (platform, influencer_id, stat_date DESC);

COMMENT ON INDEX ads.idx_influencer_shortvideo_detail_date IS '短视频达人明细按日期查询索引。';
COMMENT ON INDEX ads.idx_influencer_shortvideo_detail_platform_date IS '短视频达人明细按平台+日期查询索引。';
COMMENT ON INDEX ads.idx_influencer_shortvideo_detail_platform_influencer_date IS '短视频达人明细按平台+达人ID+日期查询索引。';

CREATE TABLE etl.creator_shortvideo_dashboard_refresh_state (
  state_key TEXT PRIMARY KEY,
  last_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE,
  last_shortvideo_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE etl.creator_shortvideo_dashboard_refresh_state IS '短视频挂车达人看板增量水位状态（名册批次 + 短视频事实双水位）。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.state_key IS '状态主键，固定使用 default。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.last_feishu_loaded_at IS '上次已处理名册批次时间（ods.feishu_influencer_shortvideo.etl_loaded_at）。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.last_shortvideo_updated_at IS '上次已处理短视频源更新时间上界（ods.douyin_trade_sale_shortvideo_raw.updated_at）。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.last_refresh_at IS '最近一次刷新执行时间。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.last_refresh_start_date IS '最近一次明细刷新开始日期。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.last_refresh_end_date IS '最近一次明细刷新结束日期。';
COMMENT ON COLUMN etl.creator_shortvideo_dashboard_refresh_state.updated_at IS '状态行更新时间。';

INSERT INTO etl.creator_shortvideo_dashboard_refresh_state (state_key)
VALUES ('default')
ON CONFLICT (state_key) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_shortvideo_influencer_roster()
LANGUAGE plpgsql
AS $$
DECLARE
  v_latest_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_inserted_rows INTEGER;
BEGIN
  IF to_regclass('ods.feishu_influencer_shortvideo') IS NULL THEN
    RAISE EXCEPTION 'source table ods.feishu_influencer_shortvideo does not exist';
  END IF;

  SELECT MAX(src.etl_loaded_at)
  INTO v_latest_loaded_at
  FROM ods.feishu_influencer_shortvideo src;

  TRUNCATE TABLE ads.influencer_shortvideo_roster;

  IF v_latest_loaded_at IS NULL THEN
    RAISE NOTICE 'refresh_creator_shortvideo_influencer_roster skipped, source table is empty';
    RETURN;
  END IF;

  INSERT INTO ads.influencer_shortvideo_roster (
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
    NULLIF(BTRIM(src.influencer_id), '') AS influencer_id,
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
  FROM ods.feishu_influencer_shortvideo src
  WHERE src.etl_loaded_at = v_latest_loaded_at;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_shortvideo_influencer_roster completed, source_etl_loaded_at: %, inserted_rows: %',
    v_latest_loaded_at,
    v_inserted_rows;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_shortvideo_detail(
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
  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ads.influencer_shortvideo_roster') IS NULL THEN
    RAISE EXCEPTION 'source table ads.influencer_shortvideo_roster does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src.stat_date)),
    COALESCE(p_end_date, MAX(src.stat_date))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'refresh_creator_shortvideo_detail skipped, source table has no stat_date rows';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'invalid date range, start_date % is after end_date %', v_start_date, v_end_date;
  END IF;

  CREATE TEMP TABLE tmp_influencer_shortvideo_detail_new ON COMMIT DROP AS
  WITH roster_prepared AS (
    SELECT
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
      NULLIF(BTRIM(r.influencer_id), '') AS influencer_id_key,
      NULLIF(BTRIM(r.influencer_name), '') AS influencer_name_key
    FROM ads.influencer_shortvideo_roster r
  ),
  roster_id_keys AS (
    SELECT DISTINCT
      rp.platform_key,
      rp.influencer_id_key
    FROM roster_prepared rp
    WHERE rp.influencer_id_key IS NOT NULL
  ),
  roster_name_keys AS (
    SELECT DISTINCT
      rp.platform_key,
      rp.influencer_name_key
    FROM roster_prepared rp
    WHERE rp.influencer_id_key IS NULL
      AND rp.influencer_name_key IS NOT NULL
  ),
  matched_source AS (
    SELECT
      '抖音'::TEXT AS platform,
      src.stat_date::DATE AS stat_date,
      NULLIF(BTRIM(src.author_douyin_id), '') AS influencer_id,
      NULLIF(BTRIM(src.author_nickname), '') AS influencer_nickname,
      NULLIF(BTRIM(src.shop_id), '') AS shop_id,
      NULLIF(BTRIM(src.shop_name), '') AS shop_name,
      NULLIF(BTRIM(src.video_id), '') AS video_id,
      src.video_view_count,
      src.user_pay_amount,
      src.refund_amount,
      src.live_room_pay_amount,
      src.search_after_view_pay_amount,
      src.shop_page_pay_amount,
      src.publish_time,
      src.updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
      AND NULLIF(BTRIM(src.author_douyin_id), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM roster_id_keys k
          WHERE k.platform_key = '抖音'
            AND k.influencer_id_key = NULLIF(BTRIM(src.author_douyin_id), '')
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM roster_id_keys k
            WHERE k.platform_key = '抖音'
              AND k.influencer_id_key = NULLIF(BTRIM(src.author_douyin_id), '')
          )
          AND EXISTS (
            SELECT 1
            FROM roster_name_keys n
            WHERE n.platform_key = '抖音'
              AND n.influencer_name_key = NULLIF(BTRIM(src.author_nickname), '')
          )
        )
      )
  )
  SELECT
    ms.platform,
    ms.stat_date,
    ms.influencer_id,
    MAX(ms.influencer_nickname) AS influencer_nickname,
    MAX(ms.shop_id) AS shop_id,
    MAX(ms.shop_name) AS shop_name,
    COUNT(DISTINCT ms.video_id)::INTEGER AS shortvideo_count,
    SUM(COALESCE(ms.video_view_count, 0))::BIGINT AS shortvideo_view_count,
    0::BIGINT AS shortvideo_duration_minutes,
    0::BIGINT AS shortvideo_exposure_user_count,
    0::BIGINT AS shortvideo_product_click_user,
    0::BIGINT AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    SUM(COALESCE(ms.user_pay_amount, 0))::NUMERIC(18, 2) AS shortvideo_gmv,
    SUM(COALESCE(ms.user_pay_amount, 0))::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    SUM(COALESCE(ms.refund_amount, 0))::NUMERIC(18, 2) AS shortvideo_refund_amount,
    0::NUMERIC(18, 2) AS shortvideo_ad_cost,
    SUM(COALESCE(ms.live_room_pay_amount, 0))::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    SUM(COALESCE(ms.search_after_view_pay_amount, 0))::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    SUM(COALESCE(ms.shop_page_pay_amount, 0))::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
    MAX(ms.publish_time) AS latest_publish_time,
    MAX(ms.updated_at) AS source_max_updated_at
  FROM matched_source ms
  GROUP BY
    ms.platform,
    ms.stat_date,
    ms.influencer_id;

  DELETE FROM ads.influencer_shortvideo_detail t
  WHERE t.stat_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.influencer_shortvideo_detail (
    platform,
    stat_date,
    influencer_id,
    influencer_nickname,
    shop_id,
    shop_name,
    shortvideo_count,
    shortvideo_view_count,
    shortvideo_duration_minutes,
    shortvideo_exposure_user_count,
    shortvideo_product_click_user,
    shortvideo_order_count,
    shortvideo_refund_order_count,
    shortvideo_buyer_count,
    shortvideo_gmv,
    shortvideo_user_pay_amount,
    shortvideo_refund_amount,
    shortvideo_ad_cost,
    shortvideo_live_room_pay_amount,
    shortvideo_search_after_view_pay_amount,
    shortvideo_shop_page_pay_amount,
    latest_publish_time,
    source_max_updated_at
  )
  SELECT
    n.platform,
    n.stat_date,
    n.influencer_id,
    n.influencer_nickname,
    n.shop_id,
    n.shop_name,
    n.shortvideo_count,
    n.shortvideo_view_count,
    n.shortvideo_duration_minutes,
    n.shortvideo_exposure_user_count,
    n.shortvideo_product_click_user,
    n.shortvideo_order_count,
    n.shortvideo_refund_order_count,
    n.shortvideo_buyer_count,
    n.shortvideo_gmv,
    n.shortvideo_user_pay_amount,
    n.shortvideo_refund_amount,
    n.shortvideo_ad_cost,
    n.shortvideo_live_room_pay_amount,
    n.shortvideo_search_after_view_pay_amount,
    n.shortvideo_shop_page_pay_amount,
    n.latest_publish_time,
    n.source_max_updated_at
  FROM tmp_influencer_shortvideo_detail_new n;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_shortvideo_detail completed, deleted_rows: %, inserted_rows: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_shortvideo_dashboard(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
  CALL ads.refresh_creator_shortvideo_influencer_roster();
  CALL ads.refresh_creator_shortvideo_detail(p_start_date, p_end_date);
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_shortvideo_dashboard_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER;
  v_lock_acquired BOOLEAN := FALSE;
  v_latest_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_latest_shortvideo_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_feishu_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_prev_shortvideo_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_need_refresh_roster BOOLEAN := FALSE;
  v_need_refresh_detail BOOLEAN := FALSE;
  v_detail_refreshed BOOLEAN := FALSE;
  v_changed_min_date DATE;
  v_changed_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
BEGIN
  IF to_regclass('etl.creator_shortvideo_dashboard_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.creator_shortvideo_dashboard_refresh_state does not exist';
  END IF;

  v_fallback_window_days := GREATEST(COALESCE(p_fallback_window_days, 14), 1);

  v_lock_acquired := pg_try_advisory_lock(hashtext('ads.refresh_creator_shortvideo_dashboard_incremental'));
  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'refresh_creator_shortvideo_dashboard_incremental skipped, advisory lock busy';
    RETURN;
  END IF;

  BEGIN
    SELECT
      s.last_feishu_loaded_at,
      s.last_shortvideo_updated_at
    INTO v_prev_feishu_loaded_at, v_prev_shortvideo_updated_at
    FROM etl.creator_shortvideo_dashboard_refresh_state s
    WHERE s.state_key = 'default'
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO etl.creator_shortvideo_dashboard_refresh_state (state_key)
      VALUES ('default')
      ON CONFLICT (state_key) DO NOTHING;

      SELECT
        s.last_feishu_loaded_at,
        s.last_shortvideo_updated_at
      INTO v_prev_feishu_loaded_at, v_prev_shortvideo_updated_at
      FROM etl.creator_shortvideo_dashboard_refresh_state s
      WHERE s.state_key = 'default'
      FOR UPDATE;
    END IF;

    SELECT MAX(src.etl_loaded_at)
    INTO v_latest_feishu_loaded_at
    FROM ods.feishu_influencer_shortvideo src;

    SELECT MAX(src.updated_at)
    INTO v_latest_shortvideo_updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src;

    IF p_init_watermark_only THEN
      UPDATE etl.creator_shortvideo_dashboard_refresh_state
      SET
        last_feishu_loaded_at = v_latest_feishu_loaded_at,
        last_shortvideo_updated_at = v_latest_shortvideo_updated_at,
        last_refresh_at = NOW(),
        updated_at = NOW()
      WHERE state_key = 'default';

      RAISE NOTICE
        'refresh_creator_shortvideo_dashboard_incremental watermark initialized, last_feishu_loaded_at: %, last_shortvideo_updated_at: %',
        v_latest_feishu_loaded_at,
        v_latest_shortvideo_updated_at;

      PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_shortvideo_dashboard_incremental'));
      RETURN;
    END IF;

    v_need_refresh_roster :=
      v_latest_feishu_loaded_at IS NOT NULL
      AND (v_prev_feishu_loaded_at IS NULL OR v_latest_feishu_loaded_at > v_prev_feishu_loaded_at);

    v_need_refresh_detail :=
      v_latest_shortvideo_updated_at IS NOT NULL
      AND (v_prev_shortvideo_updated_at IS NULL OR v_latest_shortvideo_updated_at > v_prev_shortvideo_updated_at);

    IF v_need_refresh_roster THEN
      CALL ads.refresh_creator_shortvideo_influencer_roster();
    END IF;

    IF v_need_refresh_roster THEN
      SELECT
        MIN(src.stat_date),
        MAX(src.stat_date)
      INTO v_refresh_start_date, v_refresh_end_date
      FROM ods.douyin_trade_sale_shortvideo_raw src
      WHERE src.stat_date IS NOT NULL;

      CALL ads.refresh_creator_shortvideo_detail(NULL, NULL);
      v_detail_refreshed := TRUE;
    ELSIF v_need_refresh_detail THEN
      IF v_prev_shortvideo_updated_at IS NULL THEN
        SELECT
          MIN(src.stat_date),
          MAX(src.stat_date)
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_shortvideo_raw src
        WHERE src.stat_date IS NOT NULL;
      ELSE
        SELECT
          MIN(src.stat_date),
          MAX(src.stat_date)
        INTO v_changed_min_date, v_changed_max_date
        FROM ods.douyin_trade_sale_shortvideo_raw src
        WHERE src.stat_date IS NOT NULL
          AND src.updated_at > v_prev_shortvideo_updated_at;
      END IF;

      IF v_changed_max_date IS NOT NULL THEN
        v_refresh_end_date := v_changed_max_date;
        v_refresh_start_date := LEAST(v_changed_min_date, v_changed_max_date - (v_fallback_window_days - 1));
      END IF;

      IF v_refresh_start_date IS NOT NULL AND v_refresh_end_date IS NOT NULL THEN
        CALL ads.refresh_creator_shortvideo_detail(v_refresh_start_date, v_refresh_end_date);
        v_detail_refreshed := TRUE;
      END IF;
    END IF;

    UPDATE etl.creator_shortvideo_dashboard_refresh_state
    SET
      last_feishu_loaded_at = COALESCE(v_latest_feishu_loaded_at, last_feishu_loaded_at),
      last_shortvideo_updated_at = COALESCE(v_latest_shortvideo_updated_at, last_shortvideo_updated_at),
      last_refresh_at = NOW(),
      last_refresh_start_date = v_refresh_start_date,
      last_refresh_end_date = v_refresh_end_date,
      updated_at = NOW()
    WHERE state_key = 'default';

    RAISE NOTICE
      'refresh_creator_shortvideo_dashboard_incremental completed, roster_refreshed: %, detail_refreshed: %, window: [% - %], fallback_window_days: %',
      v_need_refresh_roster,
      v_detail_refreshed,
      COALESCE(v_refresh_start_date::TEXT, 'N/A'),
      COALESCE(v_refresh_end_date::TEXT, 'N/A'),
      v_fallback_window_days;

    PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_shortvideo_dashboard_incremental'));
  EXCEPTION
    WHEN OTHERS THEN
      IF v_lock_acquired THEN
        PERFORM pg_advisory_unlock(hashtext('ads.refresh_creator_shortvideo_dashboard_incremental'));
      END IF;
      RAISE;
  END;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_shortvideo_influencer_roster()
IS '刷新短视频达人名册快照（ads.influencer_shortvideo_roster）：仅保留 ods.feishu_influencer_shortvideo 最新批次。';

COMMENT ON PROCEDURE ads.refresh_creator_shortvideo_detail(DATE, DATE)
IS '刷新短视频达人明细（ads.influencer_shortvideo_detail）：按 stat_date 窗口重建，关联规则为 ID优先 + 名称兜底。';

COMMENT ON PROCEDURE ads.refresh_creator_shortvideo_dashboard(DATE, DATE)
IS '全量刷新短视频达人看板：先刷新名册，再按窗口刷新明细。';

COMMENT ON PROCEDURE ads.refresh_creator_shortvideo_dashboard_incremental(INTEGER, BOOLEAN)
IS '短视频达人看板增量刷新：先名册后明细；名册变化时强制重建明细，避免关联键错配。';

CALL ads.refresh_creator_shortvideo_dashboard(NULL, NULL);
CALL ads.refresh_creator_shortvideo_dashboard_incremental(14, TRUE);

COMMIT;
