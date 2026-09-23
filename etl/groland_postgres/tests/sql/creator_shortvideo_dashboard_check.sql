DO $$
DECLARE
  v_invalid INTEGER;
  v_trade_rows INTEGER;
BEGIN
  IF to_regclass('ads.douyin_shortvideo_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_shortvideo_detail not found';
  END IF;

  IF to_regclass('etl.douyin_shortvideo_detail_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.douyin_shortvideo_detail_refresh_state not found';
  END IF;

  IF to_regclass('ads.douyin_shortvideo_creator_manual_attrs') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_shortvideo_creator_manual_attrs not found';
  END IF;

  IF to_regclass('ads.v_douyin_shortvideo_detail_full') IS NULL THEN
    RAISE EXCEPTION 'view ads.v_douyin_shortvideo_detail_full not found';
  END IF;

  IF to_regclass('ads.influencer_shortvideo_roster') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy table ads.influencer_shortvideo_roster should be dropped';
  END IF;

  IF to_regclass('ads.influencer_shortvideo_detail') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy table ads.influencer_shortvideo_detail should be dropped';
  END IF;

  IF to_regclass('etl.creator_shortvideo_dashboard_refresh_state') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy table etl.creator_shortvideo_dashboard_refresh_state should be dropped';
  END IF;

  IF to_regprocedure('ads.refresh_creator_shortvideo_influencer_roster()') IS NOT NULL
    OR to_regprocedure('ads.refresh_creator_shortvideo_detail(date, date)') IS NOT NULL
    OR to_regprocedure('ads.refresh_creator_shortvideo_dashboard(date, date)') IS NOT NULL
    OR to_regprocedure('ads.refresh_creator_shortvideo_dashboard_incremental(integer, boolean)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'legacy roster-based creator shortvideo refresh procedures should be dropped';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    VALUES
      ('detail_grain'),
      ('stat_date'),
      ('account_type'),
      ('video_id'),
      ('author_nickname'),
      ('author_douyin_id'),
      ('video_view_count'),
      ('user_pay_amount'),
      ('refund_amount'),
      ('qianchuan_overall_cost'),
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
    RAISE EXCEPTION 'creator shortvideo unified detail required column check failed, missing columns: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    VALUES
      ('scope_type'),
      ('author_douyin_id'),
      ('author_name_snapshot'),
      ('video_id'),
      ('product_id'),
      ('fans_count'),
      ('fans_count_updated_at'),
      ('creator_type'),
      ('mcn'),
      ('creator_fee_amount'),
      ('creator_fee_type'),
      ('creator_fee_note'),
      ('updated_at'),
      ('is_deleted')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ads'
      AND c.table_name = 'douyin_shortvideo_creator_manual_attrs'
      AND c.column_name = required.column_name
  );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'creator shortvideo manual attrs required column check failed, missing columns: %', v_invalid;
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
      ('manual_creator_fee_type'),
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
    RAISE EXCEPTION 'creator shortvideo full view required column check failed, missing columns: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_creator_manual_attrs
  WHERE scope_type NOT IN ('creator', 'video')
     OR platform <> 'douyin'
     OR author_douyin_id IS NULL
     OR BTRIM(author_douyin_id) = ''
     OR video_id IS NULL
     OR product_id IS NULL
     OR fans_count < 0
     OR creator_fee_amount < 0
     OR (scope_type = 'creator' AND (video_id <> '' OR product_id <> ''))
     OR (scope_type = 'video' AND (video_id = '' OR product_id <> ''));

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'creator shortvideo manual attrs field check failed, rows: %', v_invalid;
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
    RAISE EXCEPTION 'creator shortvideo full view manual attrs must join exact creator+video rows, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_trade_rows
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day';

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail
  WHERE detail_grain = 'trade_video_day'
    AND (
      stat_date IS NULL
      OR account_type IS NULL
      OR BTRIM(account_type) = ''
      OR author_nickname IS NULL
      OR BTRIM(author_nickname) = ''
      OR video_view_count < 0
      OR user_pay_amount < 0
      OR refund_amount < 0
      OR live_room_pay_amount < 0
      OR search_after_view_pay_amount < 0
      OR shop_page_pay_amount < 0
      OR qianchuan_overall_cost < 0
      OR asset_product_names IS NULL
      OR asset_owner_names IS NULL
      OR asset_video_types IS NULL
      OR asset_content_scenes IS NULL
      OR asset_content_scene_groups IS NULL
      OR asset_content_scene_subtypes IS NULL
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'creator shortvideo trade_video_day field check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_shortvideo_detail d
  WHERE d.detail_grain = 'trade_video_day'
    AND (
      EXISTS (
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
      )
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'creator shortvideo asset taxonomy blank value check failed, rows: %', v_invalid;
  END IF;

  IF v_trade_rows > 0 THEN
    SELECT COUNT(*)
    INTO v_invalid
    FROM ads.douyin_shortvideo_detail
    WHERE detail_grain = 'trade_video_day'
      AND COALESCE(NULLIF(BTRIM(author_nickname), ''), NULLIF(BTRIM(author_douyin_id), '')) IS NULL;

    IF v_invalid > 0 THEN
      RAISE EXCEPTION 'creator shortvideo author identity check failed, rows: %', v_invalid;
    END IF;
  END IF;

  RAISE NOTICE 'creator_shortvideo_dashboard unified detail checks passed';
END;
$$;
