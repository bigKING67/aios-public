BEGIN;

DROP TRIGGER IF EXISTS trg_touch_douyin_shortvideo_detail_updated_at ON ads.douyin_shortvideo_detail;
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_shortvideo_detail_updated_at();
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail(DATE, DATE);
DROP TABLE IF EXISTS etl.douyin_shortvideo_detail_refresh_state;
DROP TABLE IF EXISTS ads.douyin_shortvideo_detail;

CREATE TABLE ads.douyin_shortvideo_detail (
  detail_grain TEXT NOT NULL DEFAULT 'trade_video_day',
  stat_date DATE NOT NULL,
  shop_name TEXT NOT NULL DEFAULT '',
  shop_id TEXT NOT NULL DEFAULT '',
  account_type TEXT NOT NULL DEFAULT '未归类',
  account_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  video_title TEXT NOT NULL DEFAULT '(未命名短视频)',
  video_id TEXT NOT NULL DEFAULT '',
  is_promoted TEXT NOT NULL DEFAULT '',
  play_url TEXT,
  publish_time TIMESTAMP WITHOUT TIME ZONE,
  author_nickname TEXT NOT NULL DEFAULT '(未命名达人)',
  author_douyin_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  trade_source_ids INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  video_view_count BIGINT NOT NULL DEFAULT 0,
  user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  trade_created_at TIMESTAMP WITHOUT TIME ZONE,
  trade_updated_at TIMESTAMP WITHOUT TIME ZONE,
  asset_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  platform_video_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ad_material_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  asset_video_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  asset_content_scenes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  asset_content_scene_groups TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  asset_content_scene_subtypes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  qianchuan_material_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  qianchuan_material_key TEXT NOT NULL DEFAULT '',
  qianchuan_material_count INTEGER NOT NULL DEFAULT 0,
  qianchuan_material_video_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  qianchuan_material_created_at_min TIMESTAMP WITHOUT TIME ZONE,
  qianchuan_material_created_at_max TIMESTAMP WITHOUT TIME ZONE,
  qianchuan_overall_impression_count BIGINT NOT NULL DEFAULT 0,
  qianchuan_overall_click_count BIGINT NOT NULL DEFAULT 0,
  qianchuan_overall_click_rate NUMERIC(18, 6),
  qianchuan_overall_conversion_rate NUMERIC(18, 6),
  qianchuan_overall_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_overall_order_count BIGINT NOT NULL DEFAULT 0,
  qianchuan_overall_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_overall_pay_roi NUMERIC(18, 6),
  qianchuan_overall_order_cost NUMERIC(18, 2),
  qianchuan_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_overall_cpm NUMERIC(18, 6),
  qianchuan_overall_cpc NUMERIC(18, 6),
  qianchuan_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_net_gmv_roi NUMERIC(18, 6),
  qianchuan_net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  qianchuan_net_order_count BIGINT NOT NULL DEFAULT 0,
  qianchuan_net_order_cost NUMERIC(18, 2),
  qianchuan_net_gmv_settlement_rate NUMERIC(18, 6),
  qianchuan_refund_rate_1h NUMERIC(18, 6),
  qianchuan_source_file_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  qianchuan_source_ids BIGINT[] NOT NULL DEFAULT '{}'::BIGINT[],
  qianchuan_ingest_time TIMESTAMP WITHOUT TIME ZONE,
  qianchuan_metric_attributed BOOLEAN NOT NULL DEFAULT FALSE,
  qianchuan_attribution_rank INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'unmapped_video',
  qianchuan_match_status TEXT NOT NULL DEFAULT 'not_applicable',
  trade_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  qianchuan_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  source_max_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_shortvideo_detail
    PRIMARY KEY (
      stat_date,
      detail_grain,
      shop_id,
      account_type,
      video_id,
      author_douyin_id,
      product_id,
      qianchuan_material_key
    ),
  CONSTRAINT chk_douyin_shortvideo_detail_grain
    CHECK (detail_grain IN ('trade_video_day', 'qianchuan_video_day', 'qianchuan_material_day')),
  CONSTRAINT chk_douyin_shortvideo_detail_mapping_status
    CHECK (
      mapping_status IN (
        'matched',
        'unmapped_video',
        'mapped_video_no_qianchuan',
        'qianchuan_only_mapped_video',
        'qianchuan_only_unmapped_material'
      )
    ),
  CONSTRAINT chk_douyin_shortvideo_detail_qianchuan_match_status
    CHECK (
      qianchuan_match_status IN (
        'not_applicable',
        'matched',
        'unmatched_material',
        'matched_material_without_video',
        'ambiguous_material'
      )
    ),
  CONSTRAINT chk_douyin_shortvideo_detail_non_negative
    CHECK (
      video_view_count >= 0
      AND user_pay_amount >= 0
      AND refund_amount >= 0
      AND live_room_pay_amount >= 0
      AND search_after_view_pay_amount >= 0
      AND shop_page_pay_amount >= 0
      AND qianchuan_material_count >= 0
      AND qianchuan_overall_impression_count >= 0
      AND qianchuan_overall_click_count >= 0
      AND qianchuan_overall_cost >= 0
      AND qianchuan_overall_order_count >= 0
      AND qianchuan_overall_gmv >= 0
      AND qianchuan_user_pay_amount >= 0
      AND qianchuan_smart_coupon_amount >= 0
      AND qianchuan_platform_subsidy_amount >= 0
      AND qianchuan_net_gmv >= 0
      AND qianchuan_net_order_count >= 0
    )
);

COMMENT ON TABLE ads.douyin_shortvideo_detail IS
  '抖音短视频视频日事实宽表：成交侧 ODS 为主，千川素材指标经素材库映射后汇总补充。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.detail_grain IS
  '行粒度：trade_video_day=成交视频日主行；qianchuan_video_day=仅千川且已映射视频；qianchuan_material_day=仅千川且未映射视频。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.mapping_status IS
  '素材库映射状态，用于识别成交视频、已映射千川素材和未匹配素材。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.qianchuan_material_key IS
  '仅 qianchuan_material_day 行使用的素材级主键补充，成交视频日和已映射视频日为空。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.qianchuan_metric_attributed IS
  '同一视频日存在多个成交分层时，仅主成交分层行承接千川聚合指标，避免广告成本汇总重复。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.qianchuan_attribution_rank IS
  '成交视频日内千川指标承接排序，1 表示主成交分层；仅千川行固定为 1。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_video_types IS
  '素材库视频类型集合，来自 ads.marketing_content_assets.video_type。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scenes IS
  '素材库内容场景类型集合，来自 ads.marketing_content_assets.content_scene。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scene_groups IS
  '素材库内容大场景集合，来自 ads.marketing_content_assets.content_scene_group。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scene_subtypes IS
  '素材库内容细分场景集合，来自 ads.marketing_content_assets.content_scene_subtype。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.source_max_updated_at IS
  '成交侧与千川侧源更新时间的最大值。';

CREATE INDEX idx_douyin_shortvideo_detail_stat_date
  ON ads.douyin_shortvideo_detail (stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_account_type_stat_date
  ON ads.douyin_shortvideo_detail (account_type, stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_author_stat_date
  ON ads.douyin_shortvideo_detail (author_douyin_id, stat_date DESC);
CREATE INDEX idx_douyin_shortvideo_detail_video_stat_date
  ON ads.douyin_shortvideo_detail (video_id, stat_date DESC);
CREATE INDEX idx_douyin_shortvideo_detail_mapping_status
  ON ads.douyin_shortvideo_detail (mapping_status, stat_date DESC);
CREATE INDEX idx_douyin_shortvideo_detail_qianchuan_material_key
  ON ads.douyin_shortvideo_detail (qianchuan_material_key, stat_date DESC)
  WHERE qianchuan_material_key <> '';
CREATE INDEX idx_douyin_shortvideo_detail_source_max_updated_at
  ON ads.douyin_shortvideo_detail (source_max_updated_at);

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_shortvideo_detail_updated_at
BEFORE UPDATE ON ads.douyin_shortvideo_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail(
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

  IF to_regclass('ods.douyin_qianchuan_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_qianchuan_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ads.marketing_content_platform_videos') IS NULL THEN
    RAISE EXCEPTION 'mapping table ads.marketing_content_platform_videos does not exist';
  END IF;

  IF to_regclass('ads.marketing_content_ad_materials') IS NULL THEN
    RAISE EXCEPTION 'mapping table ads.marketing_content_ad_materials does not exist';
  END IF;

  IF to_regclass('ads.marketing_content_assets') IS NULL THEN
    RAISE EXCEPTION 'asset table ads.marketing_content_assets does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(source_dates.stat_date)),
    COALESCE(p_end_date, MAX(source_dates.stat_date))
  INTO v_start_date, v_end_date
  FROM (
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT qsrc.stat_date
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.stat_date IS NOT NULL
  ) source_dates;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'douyin shortvideo sources have no stat_date rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_shortvideo_detail
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.douyin_shortvideo_detail (
    detail_grain,
    stat_date,
    shop_name,
    shop_id,
    account_type,
    account_types,
    video_title,
    video_id,
    is_promoted,
    play_url,
    publish_time,
    author_nickname,
    author_douyin_id,
    product_id,
    trade_source_ids,
    video_view_count,
    user_pay_amount,
    refund_amount,
    live_room_pay_amount,
    search_after_view_pay_amount,
    shop_page_pay_amount,
    trade_created_at,
    trade_updated_at,
    asset_ids,
    platform_video_ids,
    ad_material_ids,
    asset_video_types,
    asset_content_scenes,
    asset_content_scene_groups,
    asset_content_scene_subtypes,
    qianchuan_material_ids,
    qianchuan_material_key,
    qianchuan_material_count,
    qianchuan_material_video_names,
    qianchuan_material_created_at_min,
    qianchuan_material_created_at_max,
    qianchuan_overall_impression_count,
    qianchuan_overall_click_count,
    qianchuan_overall_click_rate,
    qianchuan_overall_conversion_rate,
    qianchuan_overall_cost,
    qianchuan_overall_order_count,
    qianchuan_overall_gmv,
    qianchuan_overall_pay_roi,
    qianchuan_overall_order_cost,
    qianchuan_user_pay_amount,
    qianchuan_overall_cpm,
    qianchuan_overall_cpc,
    qianchuan_smart_coupon_amount,
    qianchuan_platform_subsidy_amount,
    qianchuan_net_gmv_roi,
    qianchuan_net_gmv,
    qianchuan_net_order_count,
    qianchuan_net_order_cost,
    qianchuan_net_gmv_settlement_rate,
    qianchuan_refund_rate_1h,
    qianchuan_source_file_names,
    qianchuan_source_ids,
    qianchuan_ingest_time,
    qianchuan_metric_attributed,
    qianchuan_attribution_rank,
    mapping_status,
    qianchuan_match_status,
    trade_source_updated_at,
    qianchuan_source_updated_at,
    source_max_updated_at
  )
  WITH trade_raw AS (
    SELECT
      src.id,
      COALESCE(NULLIF(BTRIM(src.shop_name), ''), '') AS shop_name,
      COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS shop_id,
      src.stat_date::DATE AS stat_date,
      COALESCE(NULLIF(BTRIM(src.account_type), ''), '未归类') AS account_type,
      COALESCE(NULLIF(BTRIM(src.video_title), ''), '(未命名短视频)') AS video_title,
      COALESCE(NULLIF(BTRIM(src.video_id), ''), '') AS video_id,
      COALESCE(NULLIF(BTRIM(src.is_promoted), ''), '') AS is_promoted,
      NULLIF(BTRIM(src.play_url), '') AS play_url,
      src.publish_time,
      COALESCE(NULLIF(BTRIM(src.author_nickname), ''), '(未命名达人)') AS author_nickname,
      COALESCE(NULLIF(BTRIM(src.author_douyin_id), ''), '') AS author_douyin_id,
      COALESCE(NULLIF(BTRIM(src.product_id), ''), '') AS product_id,
      COALESCE(src.video_view_count, 0)::BIGINT AS video_view_count,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
      COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
      COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS live_room_pay_amount,
      COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS search_after_view_pay_amount,
      COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shop_page_pay_amount,
      src.created_at AS trade_created_at,
      src.updated_at AS trade_updated_at,
      COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  ),
  trade_agg AS (
    SELECT
      'trade_video_day'::TEXT AS detail_grain,
      tr.stat_date,
      (ARRAY_AGG(tr.shop_name ORDER BY tr.source_updated_at DESC, tr.user_pay_amount DESC, tr.video_view_count DESC))[1] AS shop_name,
      tr.shop_id,
      (ARRAY_AGG(tr.account_type ORDER BY tr.user_pay_amount DESC, tr.video_view_count DESC, tr.source_updated_at DESC))[1] AS account_type,
      COALESCE(
        ARRAY_AGG(DISTINCT NULLIF(tr.account_type, '')) FILTER (WHERE NULLIF(tr.account_type, '') IS NOT NULL),
        '{}'::TEXT[]
      ) AS account_types,
      (ARRAY_AGG(tr.video_title ORDER BY tr.source_updated_at DESC, tr.user_pay_amount DESC, tr.video_view_count DESC))[1] AS video_title,
      tr.video_id,
      CASE
        WHEN BOOL_OR(tr.is_promoted = '是') THEN '是'
        ELSE (ARRAY_AGG(tr.is_promoted ORDER BY tr.source_updated_at DESC))[1]
      END AS is_promoted,
      (ARRAY_AGG(tr.play_url ORDER BY tr.source_updated_at DESC) FILTER (WHERE tr.play_url IS NOT NULL))[1] AS play_url,
      MAX(tr.publish_time) AS publish_time,
      (ARRAY_AGG(tr.author_nickname ORDER BY tr.source_updated_at DESC, tr.user_pay_amount DESC, tr.video_view_count DESC))[1] AS author_nickname,
      tr.author_douyin_id,
      tr.product_id,
      ARRAY_AGG(tr.id ORDER BY tr.id) AS trade_source_ids,
      SUM(tr.video_view_count)::BIGINT AS video_view_count,
      SUM(tr.user_pay_amount)::NUMERIC(18, 2) AS user_pay_amount,
      SUM(tr.refund_amount)::NUMERIC(18, 2) AS refund_amount,
      SUM(tr.live_room_pay_amount)::NUMERIC(18, 2) AS live_room_pay_amount,
      SUM(tr.search_after_view_pay_amount)::NUMERIC(18, 2) AS search_after_view_pay_amount,
      SUM(tr.shop_page_pay_amount)::NUMERIC(18, 2) AS shop_page_pay_amount,
      MIN(tr.trade_created_at) AS trade_created_at,
      MAX(tr.trade_updated_at) AS trade_updated_at,
      MAX(tr.source_updated_at) AS trade_source_updated_at
    FROM trade_raw tr
    GROUP BY
      tr.stat_date,
      tr.shop_id,
      tr.account_type,
      tr.video_id,
      tr.author_douyin_id,
      tr.product_id
  ),
  trade_ranked AS (
    SELECT
      ta.*,
      ROW_NUMBER() OVER (
        PARTITION BY ta.stat_date, ta.video_id
        ORDER BY
          ta.user_pay_amount DESC,
          ta.video_view_count DESC,
          ta.trade_source_updated_at DESC NULLS LAST,
          ta.account_type ASC,
          ta.shop_id ASC,
          ta.author_douyin_id ASC,
          ta.product_id ASC
      )::INTEGER AS qianchuan_attribution_rank
    FROM trade_agg ta
  ),
  video_identity AS (
    SELECT
      NULLIF(BTRIM(pv.external_video_id), '') AS video_id,
      ARRAY_AGG(DISTINCT pv.asset_id) FILTER (WHERE pv.asset_id IS NOT NULL) AS asset_ids,
      ARRAY_AGG(DISTINCT pv.platform_video_id) FILTER (WHERE pv.platform_video_id IS NOT NULL) AS platform_video_ids,
      COUNT(*)::INTEGER AS identity_count
    FROM ads.marketing_content_platform_videos pv
    WHERE pv.relation_status = 'active'
      AND pv.platform = 'douyin'
      AND NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL
    GROUP BY NULLIF(BTRIM(pv.external_video_id), '')
  ),
  material_identity_base AS (
    SELECT
      NULLIF(BTRIM(ad.external_material_id), '') AS material_id,
      ad.ad_material_id,
      ad.asset_id,
      COALESCE(ad.platform_video_id, direct_pv.platform_video_id, fallback_pv.platform_video_id) AS platform_video_id,
      COALESCE(
        NULLIF(BTRIM(ad.external_video_id), ''),
        NULLIF(BTRIM(direct_pv.external_video_id), ''),
        NULLIF(BTRIM(fallback_pv.external_video_id), '')
      ) AS mapped_video_id,
      ad.updated_at,
      CASE
        WHEN COALESCE(
          NULLIF(BTRIM(ad.external_video_id), ''),
          NULLIF(BTRIM(direct_pv.external_video_id), ''),
          NULLIF(BTRIM(fallback_pv.external_video_id), '')
        ) IS NOT NULL THEN TRUE
        ELSE FALSE
      END AS has_video
    FROM ads.marketing_content_ad_materials ad
    LEFT JOIN ads.marketing_content_platform_videos direct_pv
      ON direct_pv.platform_video_id = ad.platform_video_id
     AND direct_pv.relation_status = 'active'
     AND direct_pv.platform = 'douyin'
    LEFT JOIN LATERAL (
      SELECT pv.platform_video_id, pv.external_video_id
      FROM ads.marketing_content_platform_videos pv
      WHERE pv.asset_id = ad.asset_id
        AND pv.relation_status = 'active'
        AND pv.platform = 'douyin'
        AND NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL
      ORDER BY pv.updated_at DESC, pv.created_at DESC
      LIMIT 1
    ) fallback_pv ON ad.platform_video_id IS NULL
    WHERE ad.relation_status = 'active'
      AND ad.ad_platform = 'qianchuan'
      AND NULLIF(BTRIM(ad.external_material_id), '') IS NOT NULL
    UNION ALL
    SELECT
      NULLIF(BTRIM(pv.external_item_id), '') AS material_id,
      NULL::UUID AS ad_material_id,
      pv.asset_id,
      pv.platform_video_id,
      NULLIF(BTRIM(pv.external_video_id), '') AS mapped_video_id,
      pv.updated_at,
      (NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL) AS has_video
    FROM ads.marketing_content_platform_videos pv
    WHERE pv.relation_status = 'active'
      AND pv.platform = 'douyin'
      AND NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ads.marketing_content_ad_materials existing_ad
        WHERE existing_ad.relation_status = 'active'
          AND existing_ad.ad_platform = 'qianchuan'
          AND NULLIF(BTRIM(existing_ad.external_material_id), '') = NULLIF(BTRIM(pv.external_item_id), '')
      )
  ),
  material_identity AS (
    SELECT
      mib.material_id,
      (ARRAY_AGG(mib.ad_material_id ORDER BY mib.has_video DESC, mib.updated_at DESC NULLS LAST))[1] AS ad_material_id,
      (ARRAY_AGG(mib.asset_id ORDER BY mib.has_video DESC, mib.updated_at DESC NULLS LAST))[1] AS asset_id,
      (ARRAY_AGG(mib.platform_video_id ORDER BY mib.has_video DESC, mib.updated_at DESC NULLS LAST) FILTER (WHERE mib.platform_video_id IS NOT NULL))[1] AS platform_video_id,
      (ARRAY_AGG(mib.mapped_video_id ORDER BY mib.has_video DESC, mib.updated_at DESC NULLS LAST) FILTER (WHERE mib.mapped_video_id IS NOT NULL))[1] AS mapped_video_id,
      COUNT(*)::INTEGER AS identity_count
    FROM material_identity_base mib
    GROUP BY mib.material_id
  ),
  qianchuan_raw AS (
    SELECT
      qsrc.id,
      COALESCE(NULLIF(BTRIM(qsrc.material_id), ''), '') AS material_id,
      NULLIF(BTRIM(qsrc.material_video_name), '') AS material_video_name,
      qsrc.material_created_at,
      qsrc.stat_date::DATE AS stat_date,
      COALESCE(qsrc.overall_impression_count, 0)::BIGINT AS overall_impression_count,
      COALESCE(qsrc.overall_click_count, 0)::BIGINT AS overall_click_count,
      qsrc.overall_click_rate,
      qsrc.overall_conversion_rate,
      COALESCE(qsrc.overall_cost, 0)::NUMERIC(18, 2) AS overall_cost,
      COALESCE(qsrc.overall_order_count, 0)::BIGINT AS overall_order_count,
      COALESCE(qsrc.overall_gmv, 0)::NUMERIC(18, 2) AS overall_gmv,
      qsrc.overall_pay_roi,
      qsrc.overall_order_cost,
      COALESCE(qsrc.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
      qsrc.overall_cpm,
      qsrc.overall_cpc,
      COALESCE(qsrc.smart_coupon_amount, 0)::NUMERIC(18, 2) AS smart_coupon_amount,
      COALESCE(qsrc.platform_subsidy_amount, 0)::NUMERIC(18, 2) AS platform_subsidy_amount,
      qsrc.net_gmv_roi,
      COALESCE(qsrc.net_gmv, 0)::NUMERIC(18, 2) AS net_gmv,
      COALESCE(qsrc.net_order_count, 0)::BIGINT AS net_order_count,
      qsrc.net_order_cost,
      qsrc.net_gmv_settlement_rate,
      qsrc.refund_rate_1h,
      NULLIF(BTRIM(qsrc.source_file_name), '') AS source_file_name,
      qsrc.ingest_time,
      COALESCE(qsrc.ingest_time, qsrc.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.stat_date BETWEEN v_start_date AND v_end_date
  ),
  qianchuan_enriched AS (
    SELECT
      qr.*,
      mi.asset_id,
      mi.platform_video_id,
      mi.ad_material_id,
      mi.mapped_video_id,
      CASE
        WHEN mi.material_id IS NULL THEN 'unmatched_material'
        WHEN mi.identity_count > 1 THEN 'ambiguous_material'
        WHEN mi.mapped_video_id IS NULL THEN 'matched_material_without_video'
        ELSE 'matched'
      END AS qianchuan_match_status
    FROM qianchuan_raw qr
    LEFT JOIN material_identity mi
      ON mi.material_id = qr.material_id
  ),
  qianchuan_grouped AS (
    SELECT
      CASE
        WHEN qe.mapped_video_id IS NOT NULL THEN 'qianchuan_video_day'
        ELSE 'qianchuan_material_day'
      END AS detail_grain,
      qe.stat_date,
      COALESCE(qe.mapped_video_id, '') AS video_id,
      CASE
        WHEN qe.mapped_video_id IS NULL THEN qe.material_id
        ELSE ''
      END AS qianchuan_material_key,
      ARRAY_AGG(DISTINCT qe.asset_id) FILTER (WHERE qe.asset_id IS NOT NULL) AS asset_ids,
      ARRAY_AGG(DISTINCT qe.platform_video_id) FILTER (WHERE qe.platform_video_id IS NOT NULL) AS platform_video_ids,
      ARRAY_AGG(DISTINCT qe.ad_material_id) FILTER (WHERE qe.ad_material_id IS NOT NULL) AS ad_material_ids,
      ARRAY_AGG(DISTINCT qe.material_id) FILTER (WHERE qe.material_id <> '') AS qianchuan_material_ids,
      COUNT(DISTINCT NULLIF(qe.material_id, ''))::INTEGER AS qianchuan_material_count,
      ARRAY_AGG(DISTINCT qe.material_video_name) FILTER (WHERE qe.material_video_name IS NOT NULL) AS qianchuan_material_video_names,
      MIN(qe.material_created_at) AS qianchuan_material_created_at_min,
      MAX(qe.material_created_at) AS qianchuan_material_created_at_max,
      SUM(qe.overall_impression_count)::BIGINT AS qianchuan_overall_impression_count,
      SUM(qe.overall_click_count)::BIGINT AS qianchuan_overall_click_count,
      CASE
        WHEN SUM(qe.overall_impression_count) > 0
          THEN ROUND(SUM(qe.overall_click_count)::NUMERIC / NULLIF(SUM(qe.overall_impression_count), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_overall_click_rate,
      CASE
        WHEN SUM(qe.overall_click_count) > 0
          THEN ROUND(SUM(qe.overall_order_count)::NUMERIC / NULLIF(SUM(qe.overall_click_count), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_overall_conversion_rate,
      SUM(qe.overall_cost)::NUMERIC(18, 2) AS qianchuan_overall_cost,
      SUM(qe.overall_order_count)::BIGINT AS qianchuan_overall_order_count,
      SUM(qe.overall_gmv)::NUMERIC(18, 2) AS qianchuan_overall_gmv,
      CASE
        WHEN SUM(qe.overall_cost) > 0
          THEN ROUND(SUM(qe.overall_gmv) / NULLIF(SUM(qe.overall_cost), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_overall_pay_roi,
      CASE
        WHEN SUM(qe.overall_order_count) > 0
          THEN ROUND(SUM(qe.overall_cost) / NULLIF(SUM(qe.overall_order_count), 0), 2)
        ELSE NULL::NUMERIC(18, 2)
      END AS qianchuan_overall_order_cost,
      SUM(qe.user_pay_amount)::NUMERIC(18, 2) AS qianchuan_user_pay_amount,
      CASE
        WHEN SUM(qe.overall_impression_count) > 0
          THEN ROUND(SUM(qe.overall_cost) * 1000 / NULLIF(SUM(qe.overall_impression_count), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_overall_cpm,
      CASE
        WHEN SUM(qe.overall_click_count) > 0
          THEN ROUND(SUM(qe.overall_cost) / NULLIF(SUM(qe.overall_click_count), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_overall_cpc,
      SUM(qe.smart_coupon_amount)::NUMERIC(18, 2) AS qianchuan_smart_coupon_amount,
      SUM(qe.platform_subsidy_amount)::NUMERIC(18, 2) AS qianchuan_platform_subsidy_amount,
      CASE
        WHEN SUM(qe.overall_cost) > 0
          THEN ROUND(SUM(qe.net_gmv) / NULLIF(SUM(qe.overall_cost), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_net_gmv_roi,
      SUM(qe.net_gmv)::NUMERIC(18, 2) AS qianchuan_net_gmv,
      SUM(qe.net_order_count)::BIGINT AS qianchuan_net_order_count,
      CASE
        WHEN SUM(qe.net_order_count) > 0
          THEN ROUND(SUM(qe.overall_cost) / NULLIF(SUM(qe.net_order_count), 0), 2)
        ELSE NULL::NUMERIC(18, 2)
      END AS qianchuan_net_order_cost,
      CASE
        WHEN SUM(qe.overall_gmv) > 0
          THEN ROUND(SUM(qe.net_gmv) / NULLIF(SUM(qe.overall_gmv), 0), 6)
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_net_gmv_settlement_rate,
      CASE
        WHEN COALESCE(
          SUM(qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL),
          0
        ) > 0
          THEN ROUND(
            SUM(qe.refund_rate_1h * qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL)
            / NULLIF(SUM(qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL), 0),
            6
          )
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_refund_rate_1h,
      ARRAY_AGG(DISTINCT qe.source_file_name) FILTER (WHERE qe.source_file_name IS NOT NULL) AS qianchuan_source_file_names,
      ARRAY_AGG(qe.id ORDER BY qe.id) AS qianchuan_source_ids,
      MAX(qe.ingest_time) AS qianchuan_ingest_time,
      MAX(qe.source_updated_at) AS qianchuan_source_updated_at,
      CASE
        WHEN BOOL_OR(qe.qianchuan_match_status = 'ambiguous_material') THEN 'ambiguous_material'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched') THEN 'matched'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_material_without_video') THEN 'matched_material_without_video'
        ELSE 'unmatched_material'
      END AS qianchuan_match_status
    FROM qianchuan_enriched qe
    GROUP BY
      CASE
        WHEN qe.mapped_video_id IS NOT NULL THEN 'qianchuan_video_day'
        ELSE 'qianchuan_material_day'
      END,
      qe.stat_date,
      COALESCE(qe.mapped_video_id, ''),
      CASE
        WHEN qe.mapped_video_id IS NULL THEN qe.material_id
        ELSE ''
      END
  ),
  trade_rows AS (
    SELECT
      ta.detail_grain,
      ta.stat_date,
      ta.shop_name,
      ta.shop_id,
      ta.account_type,
      ta.account_types,
      ta.video_title,
      ta.video_id,
      ta.is_promoted,
      ta.play_url,
      ta.publish_time,
      ta.author_nickname,
      ta.author_douyin_id,
      ta.product_id,
      ta.trade_source_ids,
      ta.video_view_count,
      ta.user_pay_amount,
      ta.refund_amount,
      ta.live_room_pay_amount,
      ta.search_after_view_pay_amount,
      ta.shop_page_pay_amount,
      ta.trade_created_at,
      ta.trade_updated_at,
      ARRAY(
        SELECT DISTINCT u.value
        FROM unnest(COALESCE(vi.asset_ids, '{}'::UUID[]) || COALESCE(qg.asset_ids, '{}'::UUID[])) AS u(value)
        WHERE u.value IS NOT NULL
      )::UUID[] AS asset_ids,
      ARRAY(
        SELECT DISTINCT u.value
        FROM unnest(
          COALESCE(vi.platform_video_ids, '{}'::UUID[])
          || COALESCE(qg.platform_video_ids, '{}'::UUID[])
        ) AS u(value)
        WHERE u.value IS NOT NULL
      )::UUID[] AS platform_video_ids,
      COALESCE(qg.ad_material_ids, '{}'::UUID[]) AS ad_material_ids,
      COALESCE(asset_meta.asset_video_types, '{}'::TEXT[]) AS asset_video_types,
      COALESCE(asset_meta.asset_content_scenes, '{}'::TEXT[]) AS asset_content_scenes,
      COALESCE(asset_meta.asset_content_scene_groups, '{}'::TEXT[]) AS asset_content_scene_groups,
      COALESCE(asset_meta.asset_content_scene_subtypes, '{}'::TEXT[]) AS asset_content_scene_subtypes,
      COALESCE(qg.qianchuan_material_ids, '{}'::TEXT[]) AS qianchuan_material_ids,
      ''::TEXT AS qianchuan_material_key,
      COALESCE(qg.qianchuan_material_count, 0)::INTEGER AS qianchuan_material_count,
      COALESCE(qg.qianchuan_material_video_names, '{}'::TEXT[]) AS qianchuan_material_video_names,
      qg.qianchuan_material_created_at_min,
      qg.qianchuan_material_created_at_max,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_overall_impression_count, 0) ELSE 0 END::BIGINT AS qianchuan_overall_impression_count,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_overall_click_count, 0) ELSE 0 END::BIGINT AS qianchuan_overall_click_count,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_click_rate ELSE NULL::NUMERIC(18, 6) END AS qianchuan_overall_click_rate,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_conversion_rate ELSE NULL::NUMERIC(18, 6) END AS qianchuan_overall_conversion_rate,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_overall_cost, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_overall_cost,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_overall_order_count, 0) ELSE 0 END::BIGINT AS qianchuan_overall_order_count,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_overall_gmv, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_overall_gmv,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_pay_roi ELSE NULL::NUMERIC(18, 6) END AS qianchuan_overall_pay_roi,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_order_cost ELSE NULL::NUMERIC(18, 2) END AS qianchuan_overall_order_cost,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_user_pay_amount, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_user_pay_amount,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_cpm ELSE NULL::NUMERIC(18, 6) END AS qianchuan_overall_cpm,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_overall_cpc ELSE NULL::NUMERIC(18, 6) END AS qianchuan_overall_cpc,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_smart_coupon_amount, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_smart_coupon_amount,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_platform_subsidy_amount, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_platform_subsidy_amount,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_net_gmv_roi ELSE NULL::NUMERIC(18, 6) END AS qianchuan_net_gmv_roi,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_net_gmv, 0) ELSE 0 END::NUMERIC(18, 2) AS qianchuan_net_gmv,
      CASE WHEN qa.should_attribute_qianchuan THEN COALESCE(qg.qianchuan_net_order_count, 0) ELSE 0 END::BIGINT AS qianchuan_net_order_count,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_net_order_cost ELSE NULL::NUMERIC(18, 2) END AS qianchuan_net_order_cost,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_net_gmv_settlement_rate ELSE NULL::NUMERIC(18, 6) END AS qianchuan_net_gmv_settlement_rate,
      CASE WHEN qa.should_attribute_qianchuan THEN qg.qianchuan_refund_rate_1h ELSE NULL::NUMERIC(18, 6) END AS qianchuan_refund_rate_1h,
      COALESCE(qg.qianchuan_source_file_names, '{}'::TEXT[]) AS qianchuan_source_file_names,
      COALESCE(qg.qianchuan_source_ids, '{}'::BIGINT[]) AS qianchuan_source_ids,
      qg.qianchuan_ingest_time,
      COALESCE(qa.should_attribute_qianchuan, FALSE) AS qianchuan_metric_attributed,
      COALESCE(ta.qianchuan_attribution_rank, 0)::INTEGER AS qianchuan_attribution_rank,
      CASE
        WHEN qg.video_id IS NOT NULL THEN 'matched'
        WHEN vi.video_id IS NOT NULL THEN 'mapped_video_no_qianchuan'
        ELSE 'unmapped_video'
      END AS mapping_status,
      COALESCE(qg.qianchuan_match_status, 'not_applicable') AS qianchuan_match_status,
      ta.trade_source_updated_at,
      qg.qianchuan_source_updated_at,
      GREATEST(
        COALESCE(ta.trade_source_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
        COALESCE(qg.qianchuan_source_updated_at, TIMESTAMP '1970-01-01 00:00:00')
      ) AS source_max_updated_at
    FROM trade_ranked ta
    LEFT JOIN video_identity vi
      ON vi.video_id = ta.video_id
    LEFT JOIN qianchuan_grouped qg
      ON qg.detail_grain = 'qianchuan_video_day'
     AND qg.stat_date = ta.stat_date
     AND qg.video_id = ta.video_id
    LEFT JOIN LATERAL (
      WITH row_assets AS (
        SELECT DISTINCT u.value AS asset_id
        FROM unnest(COALESCE(vi.asset_ids, '{}'::UUID[]) || COALESCE(qg.asset_ids, '{}'::UUID[])) AS u(value)
        WHERE u.value IS NOT NULL
      ),
      row_asset_meta AS (
        SELECT
          NULLIF(BTRIM(asset.video_type), '') AS video_type,
          NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
          NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
          NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
        FROM row_assets ra
        JOIN ads.marketing_content_assets asset
          ON asset.asset_id = ra.asset_id
         AND asset.is_deleted = FALSE
      )
      SELECT
        COALESCE(ARRAY(SELECT DISTINCT video_type FROM row_asset_meta WHERE video_type IS NOT NULL ORDER BY video_type), '{}'::TEXT[]) AS asset_video_types,
        COALESCE(ARRAY(SELECT DISTINCT content_scene FROM row_asset_meta WHERE content_scene IS NOT NULL ORDER BY content_scene), '{}'::TEXT[]) AS asset_content_scenes,
        COALESCE(ARRAY(SELECT DISTINCT content_scene_group FROM row_asset_meta WHERE content_scene_group IS NOT NULL ORDER BY content_scene_group), '{}'::TEXT[]) AS asset_content_scene_groups,
        COALESCE(ARRAY(SELECT DISTINCT content_scene_subtype FROM row_asset_meta WHERE content_scene_subtype IS NOT NULL ORDER BY content_scene_subtype), '{}'::TEXT[]) AS asset_content_scene_subtypes
    ) asset_meta ON TRUE
    LEFT JOIN LATERAL (
      SELECT (qg.video_id IS NOT NULL AND ta.qianchuan_attribution_rank = 1) AS should_attribute_qianchuan
    ) qa ON TRUE
  ),
  qianchuan_only_rows AS (
    SELECT
      qg.detail_grain,
      qg.stat_date,
      ''::TEXT AS shop_name,
      ''::TEXT AS shop_id,
      '千川未匹配'::TEXT AS account_type,
      ARRAY['千川未匹配']::TEXT[] AS account_types,
      COALESCE((qg.qianchuan_material_video_names)[1], '(千川未匹配短视频素材)') AS video_title,
      qg.video_id,
      '是'::TEXT AS is_promoted,
      NULL::TEXT AS play_url,
      qg.qianchuan_material_created_at_max AS publish_time,
      '(千川未匹配达人)'::TEXT AS author_nickname,
      ''::TEXT AS author_douyin_id,
      ''::TEXT AS product_id,
      '{}'::INTEGER[] AS trade_source_ids,
      0::BIGINT AS video_view_count,
      0::NUMERIC(18, 2) AS user_pay_amount,
      0::NUMERIC(18, 2) AS refund_amount,
      0::NUMERIC(18, 2) AS live_room_pay_amount,
      0::NUMERIC(18, 2) AS search_after_view_pay_amount,
      0::NUMERIC(18, 2) AS shop_page_pay_amount,
      NULL::TIMESTAMP WITHOUT TIME ZONE AS trade_created_at,
      NULL::TIMESTAMP WITHOUT TIME ZONE AS trade_updated_at,
      COALESCE(qg.asset_ids, '{}'::UUID[]) AS asset_ids,
      COALESCE(qg.platform_video_ids, '{}'::UUID[]) AS platform_video_ids,
      COALESCE(qg.ad_material_ids, '{}'::UUID[]) AS ad_material_ids,
      COALESCE(asset_meta.asset_video_types, '{}'::TEXT[]) AS asset_video_types,
      COALESCE(asset_meta.asset_content_scenes, '{}'::TEXT[]) AS asset_content_scenes,
      COALESCE(asset_meta.asset_content_scene_groups, '{}'::TEXT[]) AS asset_content_scene_groups,
      COALESCE(asset_meta.asset_content_scene_subtypes, '{}'::TEXT[]) AS asset_content_scene_subtypes,
      COALESCE(qg.qianchuan_material_ids, '{}'::TEXT[]) AS qianchuan_material_ids,
      qg.qianchuan_material_key,
      COALESCE(qg.qianchuan_material_count, 0)::INTEGER AS qianchuan_material_count,
      COALESCE(qg.qianchuan_material_video_names, '{}'::TEXT[]) AS qianchuan_material_video_names,
      qg.qianchuan_material_created_at_min,
      qg.qianchuan_material_created_at_max,
      COALESCE(qg.qianchuan_overall_impression_count, 0)::BIGINT AS qianchuan_overall_impression_count,
      COALESCE(qg.qianchuan_overall_click_count, 0)::BIGINT AS qianchuan_overall_click_count,
      qg.qianchuan_overall_click_rate,
      qg.qianchuan_overall_conversion_rate,
      COALESCE(qg.qianchuan_overall_cost, 0)::NUMERIC(18, 2) AS qianchuan_overall_cost,
      COALESCE(qg.qianchuan_overall_order_count, 0)::BIGINT AS qianchuan_overall_order_count,
      COALESCE(qg.qianchuan_overall_gmv, 0)::NUMERIC(18, 2) AS qianchuan_overall_gmv,
      qg.qianchuan_overall_pay_roi,
      qg.qianchuan_overall_order_cost,
      COALESCE(qg.qianchuan_user_pay_amount, 0)::NUMERIC(18, 2) AS qianchuan_user_pay_amount,
      qg.qianchuan_overall_cpm,
      qg.qianchuan_overall_cpc,
      COALESCE(qg.qianchuan_smart_coupon_amount, 0)::NUMERIC(18, 2) AS qianchuan_smart_coupon_amount,
      COALESCE(qg.qianchuan_platform_subsidy_amount, 0)::NUMERIC(18, 2) AS qianchuan_platform_subsidy_amount,
      qg.qianchuan_net_gmv_roi,
      COALESCE(qg.qianchuan_net_gmv, 0)::NUMERIC(18, 2) AS qianchuan_net_gmv,
      COALESCE(qg.qianchuan_net_order_count, 0)::BIGINT AS qianchuan_net_order_count,
      qg.qianchuan_net_order_cost,
      qg.qianchuan_net_gmv_settlement_rate,
      qg.qianchuan_refund_rate_1h,
      COALESCE(qg.qianchuan_source_file_names, '{}'::TEXT[]) AS qianchuan_source_file_names,
      COALESCE(qg.qianchuan_source_ids, '{}'::BIGINT[]) AS qianchuan_source_ids,
      qg.qianchuan_ingest_time,
      TRUE AS qianchuan_metric_attributed,
      1::INTEGER AS qianchuan_attribution_rank,
      CASE
        WHEN qg.detail_grain = 'qianchuan_video_day' THEN 'qianchuan_only_mapped_video'
        ELSE 'qianchuan_only_unmapped_material'
      END AS mapping_status,
      qg.qianchuan_match_status,
      NULL::TIMESTAMP WITHOUT TIME ZONE AS trade_source_updated_at,
      qg.qianchuan_source_updated_at,
      qg.qianchuan_source_updated_at AS source_max_updated_at
    FROM qianchuan_grouped qg
    LEFT JOIN LATERAL (
      WITH row_assets AS (
        SELECT DISTINCT u.value AS asset_id
        FROM unnest(COALESCE(qg.asset_ids, '{}'::UUID[])) AS u(value)
        WHERE u.value IS NOT NULL
      ),
      row_asset_meta AS (
        SELECT
          NULLIF(BTRIM(asset.video_type), '') AS video_type,
          NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
          NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
          NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
        FROM row_assets ra
        JOIN ads.marketing_content_assets asset
          ON asset.asset_id = ra.asset_id
         AND asset.is_deleted = FALSE
      )
      SELECT
        COALESCE(ARRAY(SELECT DISTINCT video_type FROM row_asset_meta WHERE video_type IS NOT NULL ORDER BY video_type), '{}'::TEXT[]) AS asset_video_types,
        COALESCE(ARRAY(SELECT DISTINCT content_scene FROM row_asset_meta WHERE content_scene IS NOT NULL ORDER BY content_scene), '{}'::TEXT[]) AS asset_content_scenes,
        COALESCE(ARRAY(SELECT DISTINCT content_scene_group FROM row_asset_meta WHERE content_scene_group IS NOT NULL ORDER BY content_scene_group), '{}'::TEXT[]) AS asset_content_scene_groups,
        COALESCE(ARRAY(SELECT DISTINCT content_scene_subtype FROM row_asset_meta WHERE content_scene_subtype IS NOT NULL ORDER BY content_scene_subtype), '{}'::TEXT[]) AS asset_content_scene_subtypes
    ) asset_meta ON TRUE
    WHERE qg.detail_grain = 'qianchuan_material_day'
       OR (
         qg.detail_grain = 'qianchuan_video_day'
         AND NOT EXISTS (
           SELECT 1
           FROM trade_ranked ta
           WHERE ta.stat_date = qg.stat_date
             AND ta.video_id = qg.video_id
         )
       )
  )
  SELECT * FROM trade_rows
  UNION ALL
  SELECT * FROM qianchuan_only_rows;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_shortvideo_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail(DATE, DATE)
IS '按日期窗口刷新抖音短视频视频日事实宽表，千川素材指标经素材库映射汇总。';

CREATE TABLE etl.douyin_shortvideo_detail_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_trade_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_qianchuan_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_shortvideo_detail_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_shortvideo_detail_refresh_state IS '抖音短视频明细事实表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_source_updated_at IS '成交侧与千川侧最大源更新时间水位。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_trade_source_updated_at IS '已处理的成交侧源表更新时间水位。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_qianchuan_source_updated_at IS '已处理的千川侧源表更新时间水位。';

INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_trade_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_qianchuan_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_trade_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_qianchuan_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    last_trade_source_updated_at,
    last_qianchuan_source_updated_at
  INTO
    v_last_trade_source_updated_at,
    v_last_qianchuan_source_updated_at
  FROM etl.douyin_shortvideo_detail_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP))
  INTO v_trade_source_max_updated_at
  FROM ods.douyin_trade_sale_shortvideo_raw src;

  SELECT
    MAX(COALESCE(qsrc.ingest_time, qsrc.stat_date::TIMESTAMP))
  INTO v_qianchuan_source_max_updated_at
  FROM ods.douyin_qianchuan_shortvideo_raw qsrc;

  v_trade_source_max_updated_at := COALESCE(v_trade_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');
  v_qianchuan_source_max_updated_at := COALESCE(v_qianchuan_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');
  v_source_max_updated_at := GREATEST(v_trade_source_max_updated_at, v_qianchuan_source_max_updated_at);

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_shortvideo_detail_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_trade_source_updated_at = v_trade_source_max_updated_at,
      last_qianchuan_source_updated_at = v_qianchuan_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(changed.stat_date),
    MAX(changed.stat_date)
  INTO v_min_date, v_max_date
  FROM (
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
      AND COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP)
        > COALESCE(v_last_trade_source_updated_at, TIMESTAMP '1970-01-01 00:00:00')
    UNION ALL
    SELECT qsrc.stat_date
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.stat_date IS NOT NULL
      AND COALESCE(qsrc.ingest_time, qsrc.stat_date::TIMESTAMP)
        > COALESCE(v_last_qianchuan_source_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  ) changed;

  SELECT MAX(source_dates.stat_date)
  INTO v_fallback_end_date
  FROM (
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT qsrc.stat_date
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.stat_date IS NOT NULL
  ) source_dates;

  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_douyin_shortvideo_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_shortvideo_detail_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_trade_source_updated_at = v_trade_source_max_updated_at,
    last_qianchuan_source_updated_at = v_qianchuan_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN)
IS '按成交侧与千川侧源更新时间增量刷新抖音短视频视频日事实宽表，并固定回刷最近窗口。';

CALL ads.refresh_douyin_shortvideo_detail(NULL, NULL);
CALL ads.refresh_douyin_shortvideo_detail_incremental(14, TRUE);

COMMIT;
