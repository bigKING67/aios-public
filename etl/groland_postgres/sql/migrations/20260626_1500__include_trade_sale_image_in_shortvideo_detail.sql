BEGIN;

ALTER TABLE ads.douyin_shortvideo_detail
  DROP CONSTRAINT IF EXISTS chk_douyin_shortvideo_detail_qianchuan_match_status;

ALTER TABLE ads.douyin_shortvideo_detail
  ADD CONSTRAINT chk_douyin_shortvideo_detail_qianchuan_match_status
  CHECK (
    qianchuan_match_status IN (
      'not_applicable',
      'matched',
      'matched_material_title_date',
      'matched_material_title_date_amount_order',
      'matched_title_date',
      'matched_title_date_amount_order',
      'unmatched_material',
      'matched_material_without_video',
      'ambiguous_material',
      'ambiguous_title_date',
      'ambiguous_title_date_amount_unresolved',
      'unmatched_title_date'
    )
  );

COMMENT ON TABLE ads.douyin_shortvideo_detail IS
  '抖音短视频视频日事实宽表：成交侧合并短视频与图文短视频 ODS，千川素材指标经素材库、同日同标题唯一匹配或金额订单实付唯一消歧后汇总补充。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.qianchuan_match_status IS
  '千川素材匹配状态：素材库映射、同日同标题自动匹配、同日同标题金额订单实付消歧、歧义或未匹配。';

DO $$
DECLARE
  v_definition TEXT;
  v_before_definition TEXT;
  v_missing_image_columns TEXT;
BEGIN
  SELECT pg_get_functiondef('ads.refresh_douyin_shortvideo_detail(date,date)'::regprocedure)
  INTO v_definition;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_shortvideo_raw') IS NULL THEN
$old$,
    $new$
  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_image_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_image_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_shortvideo_raw') IS NULL THEN
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail source table existence checks';
  END IF;

  SELECT STRING_AGG(required.column_name, ', ' ORDER BY required.column_name)
  INTO v_missing_image_columns
  FROM (
    VALUES
      ('id'),
      ('shop_name'),
      ('shop_id'),
      ('stat_date'),
      ('image_title'),
      ('image_id'),
      ('author_id'),
      ('view_count'),
      ('trade_amount'),
      ('order_count'),
      ('user_pay_amount'),
      ('refund_amount'),
      ('live_room_pay_amount'),
      ('search_after_view_pay_amount'),
      ('shop_page_pay_amount'),
      ('created_at'),
      ('updated_at'),
      ('publish_time')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ods'
      AND c.table_name = 'douyin_trade_sale_image_raw'
      AND c.column_name = required.column_name
  );

  IF v_missing_image_columns IS NOT NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_image_raw missing required columns: %', v_missing_image_columns;
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT qsrc.stat_date
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
$old$,
    $new$
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT qsrc.stat_date
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail source date scope';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
      src.updated_at AS trade_updated_at,
      COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  ),
$old$,
$new$
      NULL::NUMERIC(18, 2) AS match_trade_amount,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS match_user_pay_amount,
      NULL::BIGINT AS match_order_count,
      src.updated_at AS trade_updated_at,
      COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
    UNION ALL
    SELECT
      src.id,
      COALESCE(NULLIF(BTRIM(src.shop_name), ''), '') AS shop_name,
      COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS shop_id,
      src.stat_date::DATE AS stat_date,
      '合作图文短视频'::TEXT AS account_type,
      COALESCE(NULLIF(BTRIM(src.image_title), ''), '(未命名短视频)') AS video_title,
      COALESCE(NULLIF(BTRIM(src.image_id), ''), '') AS video_id,
      ''::TEXT AS is_promoted,
      NULL::TEXT AS play_url,
      src.publish_time,
      '(未命名达人)'::TEXT AS author_nickname,
      COALESCE(NULLIF(BTRIM(src.author_id), ''), '') AS author_douyin_id,
      ''::TEXT AS product_id,
      COALESCE(src.view_count, 0)::BIGINT AS video_view_count,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
      COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
      COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS live_room_pay_amount,
      COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS search_after_view_pay_amount,
      COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shop_page_pay_amount,
      src.created_at AS trade_created_at,
      COALESCE(src.trade_amount, src.user_pay_amount, 0)::NUMERIC(18, 2) AS match_trade_amount,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS match_user_pay_amount,
      COALESCE(src.order_count, 0)::BIGINT AS match_order_count,
      src.updated_at AS trade_updated_at,
      COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  ),
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail trade_raw image source';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
      SUM(tr.shop_page_pay_amount)::NUMERIC(18, 2) AS shop_page_pay_amount,
      MIN(tr.trade_created_at) AS trade_created_at,
      MAX(tr.trade_updated_at) AS trade_updated_at,
      MAX(tr.source_updated_at) AS trade_source_updated_at
$old$,
    $new$
      SUM(tr.shop_page_pay_amount)::NUMERIC(18, 2) AS shop_page_pay_amount,
      SUM(tr.match_trade_amount) FILTER (WHERE tr.match_order_count IS NOT NULL)::NUMERIC(18, 2) AS match_trade_amount,
      SUM(tr.match_user_pay_amount) FILTER (WHERE tr.match_order_count IS NOT NULL)::NUMERIC(18, 2) AS match_user_pay_amount,
      SUM(tr.match_order_count) FILTER (WHERE tr.match_order_count IS NOT NULL)::BIGINT AS match_order_count,
      MIN(tr.trade_created_at) AS trade_created_at,
      MAX(tr.trade_updated_at) AS trade_updated_at,
      MAX(tr.source_updated_at) AS trade_source_updated_at
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail trade_agg match metrics';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
    FROM trade_agg ta
  ),
  video_identity AS (
$old$,
    $new$
    FROM trade_agg ta
  ),
  trade_title_candidates AS (
    SELECT
      ta.stat_date,
      LOWER(REGEXP_REPLACE(NULLIF(BTRIM(ta.video_title), ''), '\s+', '', 'g')) AS title_key,
      NULLIF(BTRIM(ta.video_id), '') AS mapped_video_id,
      SUM(ta.match_trade_amount) FILTER (WHERE ta.match_order_count IS NOT NULL)::NUMERIC(18, 2) AS match_trade_amount,
      SUM(ta.match_user_pay_amount) FILTER (WHERE ta.match_order_count IS NOT NULL)::NUMERIC(18, 2) AS match_user_pay_amount,
      SUM(ta.match_order_count) FILTER (WHERE ta.match_order_count IS NOT NULL)::BIGINT AS match_order_count,
      MAX(ta.publish_time) AS publish_time
    FROM trade_agg ta
    WHERE NULLIF(BTRIM(ta.video_id), '') IS NOT NULL
      AND NULLIF(BTRIM(ta.video_title), '') IS NOT NULL
    GROUP BY
      ta.stat_date,
      LOWER(REGEXP_REPLACE(NULLIF(BTRIM(ta.video_title), ''), '\s+', '', 'g')),
      NULLIF(BTRIM(ta.video_id), '')
  ),
  trade_title_match AS (
    SELECT
      ttc.*,
      COUNT(*) OVER (PARTITION BY ttc.stat_date, ttc.title_key)::INTEGER AS candidate_video_count
    FROM trade_title_candidates ttc
  ),
  video_identity AS (
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail trade_title_match CTE';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
      qsrc.id,
      COALESCE(NULLIF(BTRIM(qsrc.material_id), ''), '') AS material_id,
      NULLIF(BTRIM(qsrc.material_video_name), '') AS material_video_name,
      qsrc.material_created_at,
$old$,
    $new$
      qsrc.id,
      COALESCE(NULLIF(BTRIM(qsrc.material_id), ''), '') AS material_id,
      NULLIF(BTRIM(qsrc.material_video_name), '') AS material_video_name,
      LOWER(REGEXP_REPLACE(NULLIF(BTRIM(qsrc.material_video_name), ''), '\s+', '', 'g')) AS material_title_key,
      qsrc.material_created_at,
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail qianchuan title key';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
  qianchuan_enriched AS (
$old$,
    $new$
  qianchuan_title_match AS (
    SELECT
      qr.id AS qianchuan_source_id,
      COALESCE(MAX(ttm.candidate_video_count), 0)::INTEGER AS candidate_video_count,
      (ARRAY_AGG(ttm.mapped_video_id ORDER BY ttm.mapped_video_id)
        FILTER (WHERE ttm.candidate_video_count = 1))[1] AS unique_mapped_video_id,
      COUNT(*) FILTER (
        WHERE ttm.match_order_count IS NOT NULL
          AND qr.overall_gmv = ttm.match_trade_amount
          AND qr.overall_order_count = ttm.match_order_count
          AND qr.user_pay_amount = ttm.match_user_pay_amount
      )::INTEGER AS amount_order_match_count,
      (ARRAY_AGG(ttm.mapped_video_id ORDER BY ttm.publish_time DESC NULLS LAST, ttm.mapped_video_id)
        FILTER (
          WHERE ttm.match_order_count IS NOT NULL
            AND qr.overall_gmv = ttm.match_trade_amount
            AND qr.overall_order_count = ttm.match_order_count
            AND qr.user_pay_amount = ttm.match_user_pay_amount
        ))[1] AS amount_order_mapped_video_id
    FROM qianchuan_raw qr
    LEFT JOIN trade_title_match ttm
      ON ttm.stat_date = qr.stat_date
     AND ttm.title_key = qr.material_title_key
    GROUP BY qr.id
  ),
  qianchuan_enriched AS (
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail qianchuan title match resolution';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
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
$old$,
    $new$
      mi.asset_id,
      mi.platform_video_id,
      mi.ad_material_id,
      COALESCE(
        mi.mapped_video_id,
        CASE
          WHEN COALESCE(mi.identity_count, 0) <= 1
            AND COALESCE(qtm.candidate_video_count, 0) = 1
          THEN qtm.unique_mapped_video_id
          WHEN COALESCE(mi.identity_count, 0) <= 1
            AND COALESCE(qtm.candidate_video_count, 0) > 1
            AND qtm.amount_order_match_count = 1
          THEN qtm.amount_order_mapped_video_id
          ELSE NULL
        END
      ) AS mapped_video_id,
      CASE
        WHEN mi.identity_count > 1 THEN 'ambiguous_material'
        WHEN mi.mapped_video_id IS NOT NULL THEN 'matched'
        WHEN COALESCE(qtm.candidate_video_count, 0) = 1
          THEN CASE
            WHEN mi.material_id IS NOT NULL THEN 'matched_material_title_date'
            ELSE 'matched_title_date'
          END
        WHEN COALESCE(qtm.candidate_video_count, 0) > 1
          AND qtm.amount_order_match_count = 1
          THEN CASE
            WHEN mi.material_id IS NOT NULL THEN 'matched_material_title_date_amount_order'
            ELSE 'matched_title_date_amount_order'
          END
        WHEN COALESCE(qtm.candidate_video_count, 0) > 1 THEN 'ambiguous_title_date_amount_unresolved'
        WHEN mi.material_id IS NOT NULL THEN 'matched_material_without_video'
        WHEN qr.material_id <> '' THEN 'unmatched_material'
        ELSE 'unmatched_title_date'
      END AS qianchuan_match_status
    FROM qianchuan_raw qr
    LEFT JOIN material_identity mi
      ON mi.material_id = qr.material_id
    LEFT JOIN qianchuan_title_match qtm
      ON qtm.qianchuan_source_id = qr.id
  ),
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail qianchuan title-date matching';
  END IF;

  v_before_definition := v_definition;
  v_definition := REPLACE(
    v_definition,
    $old$
      CASE
        WHEN BOOL_OR(qe.qianchuan_match_status = 'ambiguous_material') THEN 'ambiguous_material'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched') THEN 'matched'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_material_without_video') THEN 'matched_material_without_video'
        ELSE 'unmatched_material'
      END AS qianchuan_match_status
$old$,
    $new$
      CASE
        WHEN BOOL_OR(qe.qianchuan_match_status = 'ambiguous_material') THEN 'ambiguous_material'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched') THEN 'matched'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_material_title_date') THEN 'matched_material_title_date'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_material_title_date_amount_order') THEN 'matched_material_title_date_amount_order'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_title_date') THEN 'matched_title_date'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_title_date_amount_order') THEN 'matched_title_date_amount_order'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'ambiguous_title_date_amount_unresolved') THEN 'ambiguous_title_date_amount_unresolved'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'ambiguous_title_date') THEN 'ambiguous_title_date'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'matched_material_without_video') THEN 'matched_material_without_video'
        WHEN BOOL_OR(qe.qianchuan_match_status = 'unmatched_material') THEN 'unmatched_material'
        ELSE 'unmatched_title_date'
      END AS qianchuan_match_status
$new$
  );
  IF v_definition = v_before_definition THEN
    RAISE EXCEPTION 'failed to patch refresh_douyin_shortvideo_detail qianchuan grouped match status';
  END IF;

  IF POSITION('ods.douyin_trade_sale_image_raw' IN v_definition) = 0
     OR POSITION('trade_title_candidates AS (' IN v_definition) = 0
     OR POSITION('qianchuan_title_match AS (' IN v_definition) = 0
     OR POSITION('matched_title_date_amount_order' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'failed to patch ads.refresh_douyin_shortvideo_detail for image trade source and title-date amount/order matching';
  END IF;

  EXECUTE v_definition;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail(DATE, DATE)
IS '按日期窗口刷新抖音短视频视频日事实宽表；成交侧合并 ods.douyin_trade_sale_shortvideo_raw 与 ods.douyin_trade_sale_image_raw，千川素材指标经素材库、同日同标题唯一匹配或金额订单实付唯一消歧汇总。';

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

  SELECT MAX(trade_sources.source_updated_at)
  INTO v_trade_source_max_updated_at
  FROM (
    SELECT COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_shortvideo_raw src
    UNION ALL
    SELECT COALESCE(src.updated_at, src.created_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at
    FROM ods.douyin_trade_sale_image_raw src
  ) trade_sources;

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
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_image_raw src
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
    SELECT src.stat_date
    FROM ods.douyin_trade_sale_image_raw src
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
IS '按成交侧（短视频+图文短视频）与千川侧源更新时间增量刷新抖音短视频视频日事实宽表，并固定回刷最近窗口。';

CALL ads.refresh_douyin_shortvideo_detail(NULL, NULL);
CALL ads.refresh_douyin_shortvideo_detail_incremental(14, TRUE);

COMMIT;
