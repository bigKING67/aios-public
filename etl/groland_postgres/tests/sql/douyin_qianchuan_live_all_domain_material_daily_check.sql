-- 抖音千川直播全域素材ADS看板表健康检查
-- 用法：
-- psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f tests/sql/douyin_qianchuan_live_all_domain_material_daily_check.sql

DO $$
DECLARE
  v_invalid INTEGER;
  v_missing_comment_count INTEGER;
BEGIN
  IF to_regclass('ads.douyin_qianchuan_live_all_domain_material_daily') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_qianchuan_live_all_domain_material_daily not found';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_live_room_screen_raw') IS NULL THEN
    RAISE EXCEPTION 'table ods.douyin_qianchuan_live_room_screen_raw not found';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_live_video_raw') IS NULL THEN
    RAISE EXCEPTION 'table ods.douyin_qianchuan_live_video_raw not found';
  END IF;

  IF to_regprocedure('ads.refresh_douyin_qianchuan_live_all_domain_material_daily(date,date)') IS NULL THEN
    RAISE EXCEPTION 'function ads.refresh_douyin_qianchuan_live_all_domain_material_daily(date,date) not found';
  END IF;

  IF to_regprocedure('ads.refresh_qianchuan_live_all_domain_material_daily_incremental(integer)') IS NULL THEN
    RAISE EXCEPTION 'function ads.refresh_qianchuan_live_all_domain_material_daily_incremental(integer) not found';
  END IF;

  SELECT COUNT(*)
  INTO v_missing_comment_count
  FROM information_schema.columns c
  JOIN pg_class cls
    ON cls.relname = c.table_name
  JOIN pg_namespace ns
    ON ns.oid = cls.relnamespace
   AND ns.nspname = c.table_schema
  LEFT JOIN pg_description d
    ON d.objoid = cls.oid
   AND d.objsubid = c.ordinal_position
  WHERE c.table_schema = 'ads'
    AND c.table_name = 'douyin_qianchuan_live_all_domain_material_daily'
    AND NULLIF(BTRIM(d.description), '') IS NULL;

  IF v_missing_comment_count > 0 THEN
    RAISE EXCEPTION 'ads.douyin_qianchuan_live_all_domain_material_daily has columns without comments: %', v_missing_comment_count;
  END IF;

  IF NULLIF(BTRIM(OBJ_DESCRIPTION('ads.douyin_qianchuan_live_all_domain_material_daily'::REGCLASS, 'pg_class')), '') IS NULL THEN
    RAISE EXCEPTION 'ads.douyin_qianchuan_live_all_domain_material_daily table comment is missing';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_qianchuan_live_all_domain_material_daily
  WHERE stat_date IS NULL
     OR material_type NOT IN ('live_room_screen', 'live_video')
     OR NULLIF(BTRIM(material_key), '') IS NULL
     OR NULLIF(BTRIM(promotion_type), '') IS NULL
     OR NULLIF(BTRIM(douyin_account_display_id), '') IS NULL
     OR source_row_count < 0
     OR overall_impression_count < 0
     OR overall_click_count < 0
     OR overall_order_count < 0
     OR overall_gmv < 0
     OR overall_cost < 0
     OR net_gmv < 0
     OR net_order_count < 0
     OR boost_cost < 0
     OR boost_gmv < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'qianchuan live all-domain material basic metric check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_qianchuan_live_all_domain_material_daily
  WHERE ABS(
          COALESCE(overall_click_rate, 0)
          - COALESCE(
              CASE
                WHEN overall_impression_count > 0
                  THEN ROUND(overall_click_count::NUMERIC / overall_impression_count::NUMERIC, 6)
              END,
              0
            )
        ) > 0.000001
     OR ABS(
          COALESCE(overall_conversion_rate, 0)
          - COALESCE(
              CASE
                WHEN overall_click_count > 0
                  THEN ROUND(overall_order_count::NUMERIC / overall_click_count::NUMERIC, 6)
              END,
              0
            )
        ) > 0.000001
     OR ABS(
          COALESCE(overall_pay_roi, 0)
          - COALESCE(
              CASE WHEN overall_cost > 0 THEN ROUND(overall_gmv / overall_cost, 6) END,
              0
            )
        ) > 0.000001
     OR ABS(
          COALESCE(net_gmv_roi, 0)
          - COALESCE(
              CASE WHEN overall_cost > 0 THEN ROUND(net_gmv / overall_cost, 6) END,
              0
            )
        ) > 0.000001
     OR ABS(
          COALESCE(refund_rate_1h, 0)
          - COALESCE(
              CASE WHEN overall_gmv > 0 THEN ROUND(refund_amount_1h / overall_gmv, 6) END,
              0
            )
        ) > 0.000001
     OR ABS(
          COALESCE(video_complete_play_rate, 0)
          - COALESCE(
              CASE
                WHEN video_play_count > 0
                  THEN ROUND(video_complete_play_count::NUMERIC / video_play_count::NUMERIC, 6)
              END,
              0
            )
        ) > 0.000001;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'qianchuan live all-domain material ratio formula check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_qianchuan_live_all_domain_material_daily
  WHERE (material_type = 'live_room_screen' AND (material_id IS NOT NULL OR material_video_name IS NOT NULL))
     OR (material_type = 'live_video' AND NULLIF(BTRIM(COALESCE(material_id, '')), '') IS NULL)
     OR (material_type = 'live_video' AND NULLIF(BTRIM(COALESCE(material_key, '')), '') IS NULL)
     OR (material_type = 'live_room_screen' AND (video_play_count IS NOT NULL OR video_like_count IS NOT NULL))
     OR (material_type = 'live_video' AND (live_comment_count IS NOT NULL OR live_like_count IS NOT NULL));

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'qianchuan live all-domain material type-specific null contract failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin qianchuan live all-domain material daily checks passed';
END;
$$;
