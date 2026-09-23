DO $$
DECLARE
  v_invalid INTEGER;
  v_ads_total NUMERIC(18, 2);
  v_ods_total NUMERIC(18, 2);
  v_definition TEXT;
  v_missing_columns TEXT;
BEGIN
  IF to_regclass('ads.douyin_shortvideo_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_shortvideo_detail not found';
  END IF;

  IF to_regclass('etl.douyin_shortvideo_detail_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.douyin_shortvideo_detail_refresh_state not found';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'table ods.douyin_trade_sale_shortvideo_raw not found';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_image_raw') IS NULL THEN
    RAISE EXCEPTION 'table ods.douyin_trade_sale_image_raw not found';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'table ods.douyin_qianchuan_shortvideo_raw not found';
  END IF;

  SELECT STRING_AGG(required.column_name, ', ' ORDER BY required.column_name)
  INTO v_missing_columns
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

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'douyin_trade_sale_image_raw required column check failed, missing columns: %', v_missing_columns;
  END IF;

  IF to_regclass('ads.v_douyin_shortvideo_detail_full') IS NULL THEN
    RAISE EXCEPTION 'view ads.v_douyin_shortvideo_detail_full not found';
  END IF;

  SELECT pg_get_functiondef('ads.refresh_douyin_shortvideo_detail(date,date)'::regprocedure)
  INTO v_definition;

  IF POSITION('ods.douyin_trade_sale_image_raw' IN v_definition) = 0
     OR POSITION('trade_title_candidates AS (' IN v_definition) = 0
     OR POSITION('qianchuan_title_match AS (' IN v_definition) = 0
     OR POSITION('matched_title_date_amount_order' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'refresh_douyin_shortvideo_detail definition does not include image trade source and title-date amount/order matching';
  END IF;

  SELECT pg_get_functiondef('ads.refresh_douyin_shortvideo_detail_incremental(integer,boolean)'::regprocedure)
  INTO v_definition;

  IF POSITION('ods.douyin_trade_sale_image_raw' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'refresh_douyin_shortvideo_detail_incremental definition does not include image trade source';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    VALUES
      ('detail_grain'),
      ('mapping_status'),
      ('qianchuan_match_status'),
      ('qianchuan_overall_cost'),
      ('qianchuan_material_ids'),
      ('qianchuan_metric_attributed'),
      ('qianchuan_attribution_rank'),
      ('asset_product_names'),
      ('asset_owner_names'),
      ('asset_video_types'),
      ('asset_content_scenes'),
      ('asset_content_scene_groups'),
      ('asset_content_scene_subtypes'),
      ('source_max_updated_at')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ads'
      AND c.table_name = 'douyin_shortvideo_detail'
      AND c.column_name = required.column_name
  );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail required column check failed, missing columns: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    VALUES
      ('asset_video_types'),
      ('asset_product_names'),
      ('asset_owner_names'),
      ('asset_content_scenes'),
      ('asset_content_scene_groups'),
      ('asset_content_scene_subtypes'),
      ('manual_fans_count'),
      ('manual_creator_type'),
      ('manual_mcn'),
      ('manual_creator_fee_amount'),
      ('manual_created_by_user_id'),
      ('manual_updated_by_user_id')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ads'
      AND c.table_name = 'v_douyin_shortvideo_detail_full'
      AND c.column_name = required.column_name
  );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail full view required column check failed, missing columns: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_creator_manual_attrs
  WHERE scope_type = 'video'
    AND product_id <> '';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail video manual attrs must stay creator+video scoped, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.v_douyin_shortvideo_detail_full v
  JOIN ads.douyin_shortvideo_creator_manual_attrs ma
    ON ma.manual_attr_id = v.manual_attr_id
  WHERE ma.scope_type <> 'video'
     OR ma.video_id <> NULLIF(v.video_id, '')
     OR ma.product_id <> '';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail full view manual attrs must join exact creator+video rows, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail
  WHERE stat_date IS NULL
     OR detail_grain NOT IN ('trade_video_day', 'qianchuan_video_day', 'qianchuan_material_day')
     OR mapping_status NOT IN (
       'matched',
       'unmapped_video',
       'mapped_video_no_qianchuan',
       'qianchuan_only_mapped_video',
       'qianchuan_only_unmapped_material'
     )
     OR qianchuan_match_status NOT IN (
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
     OR account_type IS NULL
     OR video_title IS NULL
     OR video_id IS NULL
     OR author_douyin_id IS NULL
     OR qianchuan_metric_attributed IS NULL
     OR qianchuan_attribution_rank < 0
     OR video_view_count < 0
     OR user_pay_amount < 0
     OR refund_amount < 0
     OR live_room_pay_amount < 0
     OR search_after_view_pay_amount < 0
     OR shop_page_pay_amount < 0
     OR qianchuan_material_count < 0
     OR qianchuan_overall_impression_count < 0
     OR qianchuan_overall_click_count < 0
     OR qianchuan_overall_cost < 0
     OR qianchuan_overall_order_count < 0
     OR qianchuan_overall_gmv < 0
     OR qianchuan_user_pay_amount < 0
     OR qianchuan_smart_coupon_amount < 0
     OR qianchuan_platform_subsidy_amount < 0
     OR qianchuan_net_gmv < 0
     OR qianchuan_net_order_count < 0
     OR asset_product_names IS NULL
     OR asset_owner_names IS NULL
     OR asset_video_types IS NULL
     OR asset_content_scenes IS NULL
     OR asset_content_scene_groups IS NULL
     OR asset_content_scene_subtypes IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail field check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail d
  WHERE EXISTS (
      SELECT 1
      FROM unnest(d.asset_product_names) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(d.asset_owner_names) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(d.asset_video_types) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(d.asset_content_scenes) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(d.asset_content_scene_groups) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(d.asset_content_scene_subtypes) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NULL
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail asset taxonomy blank value check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT stat_date, video_id
    FROM ads.douyin_shortvideo_detail
    WHERE detail_grain = 'trade_video_day'
      AND video_id <> ''
      AND COALESCE(CARDINALITY(qianchuan_source_ids), 0) > 0
    GROUP BY stat_date, video_id
    HAVING COUNT(*) FILTER (WHERE qianchuan_metric_attributed) > 1
  ) duplicated;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail qianchuan attribution duplicate check failed, video_days: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day'
    AND COALESCE(CARDINALITY(qianchuan_source_ids), 0) > 0
    AND qianchuan_metric_attributed = FALSE
    AND (
      qianchuan_overall_impression_count <> 0
      OR qianchuan_overall_click_count <> 0
      OR qianchuan_overall_cost <> 0
      OR qianchuan_overall_order_count <> 0
      OR qianchuan_overall_gmv <> 0
      OR qianchuan_user_pay_amount <> 0
      OR qianchuan_smart_coupon_amount <> 0
      OR qianchuan_platform_subsidy_amount <> 0
      OR qianchuan_net_gmv <> 0
      OR qianchuan_net_order_count <> 0
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail non-attributed qianchuan metric zero check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail d
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COALESCE(
          SUM(COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL),
          0
        ) > 0
          THEN ROUND(
            SUM(qsrc.refund_rate_1h * COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL)
            / NULLIF(
              SUM(COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL),
              0
            ),
            6
          )
        ELSE NULL::NUMERIC(18, 6)
      END AS expected_refund_rate_1h
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.id = ANY(d.qianchuan_source_ids)
  ) qcalc ON TRUE
  WHERE d.qianchuan_metric_attributed = TRUE
    AND COALESCE(CARDINALITY(d.qianchuan_source_ids), 0) > 0
    AND d.qianchuan_refund_rate_1h IS DISTINCT FROM qcalc.expected_refund_rate_1h;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail qianchuan refund_rate_1h aggregation check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
    AND (qianchuan_metric_attributed = FALSE OR qianchuan_attribution_rank <> 1);

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail qianchuan-only attribution check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
    AND (
      COALESCE(CARDINALITY(trade_source_ids), 0) <> 0
      OR video_view_count <> 0
      OR user_pay_amount <> 0
      OR refund_amount <> 0
      OR live_room_pay_amount <> 0
      OR search_after_view_pay_amount <> 0
      OR shop_page_pay_amount <> 0
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail qianchuan-only trade metric zero check failed, rows: %', v_invalid;
  END IF;

  SELECT COALESCE(SUM(video_view_count), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.video_view_count, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.view_count, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail video_view_count total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COALESCE(SUM(user_pay_amount), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail user_pay_amount total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COALESCE(SUM(refund_amount), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail refund_amount total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COALESCE(SUM(live_room_pay_amount), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail live_room_pay_amount total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COALESCE(SUM(search_after_view_pay_amount), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail search_after_view_pay_amount total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COALESCE(SUM(shop_page_pay_amount), 0)::NUMERIC(18, 2)
  INTO v_ads_total
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COALESCE(SUM(metric_value), 0)::NUMERIC(18, 2)
  INTO v_ods_total
  FROM (
    SELECT COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date IS NOT NULL
    UNION ALL
    SELECT COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS metric_value
    FROM ods.douyin_trade_sale_image_raw src
    WHERE src.stat_date IS NOT NULL
  ) trade_sources;

  IF v_ads_total <> v_ods_total THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail shop_page_pay_amount total mismatch, ads: %, ods: %', v_ads_total, v_ods_total;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.douyin_shortvideo_detail_refresh_state
  WHERE id = 1;

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'douyin_shortvideo_detail_refresh_state default row check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin_shortvideo_detail checks passed';
END;
$$;
