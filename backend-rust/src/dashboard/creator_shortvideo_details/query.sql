WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS start_date,
    __END_DATE_LITERAL__::DATE AS end_date,
    __COOPERATION_STATUS_LITERAL__::TEXT AS cooperation_status_filter,
    __KEYWORD_LITERAL__::TEXT AS keyword_filter,
    __CURRENT_USER_ID_LITERAL__::TEXT AS current_user_id,
    __CAN_MANAGE_MANUAL_ATTRS_LITERAL__::BOOLEAN AS can_manage_manual_attrs
),
live_identity_source AS (
  SELECT
    NULLIF(BTRIM(pv.external_video_id), '') AS video_id,
    pv.platform_video_id,
    asset.asset_id,
    NULLIF(BTRIM(product_item.value), '') AS asset_product_name,
    NULLIF(BTRIM(asset.owner_name), '') AS asset_owner_name,
    NULLIF(BTRIM(asset.owner_user_id), '') AS asset_owner_user_id,
    NULLIF(BTRIM(asset.video_type), '') AS asset_video_type,
    NULLIF(BTRIM(asset.content_scene), '') AS asset_content_scene,
    NULLIF(BTRIM(asset.content_scene_group), '') AS asset_content_scene_group,
    NULLIF(BTRIM(asset.content_scene_subtype), '') AS asset_content_scene_subtype,
    material.ad_material_id,
    material_key.qianchuan_material_id
  FROM ads.marketing_content_platform_videos pv
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = pv.asset_id
   AND asset.is_deleted = FALSE
  LEFT JOIN LATERAL unnest(
    CASE
      WHEN COALESCE(array_length(asset.product_names, 1), 0) > 0 THEN asset.product_names
      WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL THEN ARRAY[asset.product_name]
      ELSE '{}'::TEXT[]
    END
  ) AS product_item(value) ON TRUE
  LEFT JOIN ads.marketing_content_ad_materials material
    ON material.asset_id = pv.asset_id
   AND material.relation_status = 'active'
   AND (
     material.platform_video_id = pv.platform_video_id
     OR NULLIF(BTRIM(material.external_video_id), '') = NULLIF(BTRIM(pv.external_video_id), '')
     OR (
       material.ad_platform IN ('qianchuan', '千川')
       AND NULLIF(BTRIM(material.external_material_id), '') = NULLIF(BTRIM(pv.external_item_id), '')
     )
   )
  LEFT JOIN LATERAL (
    SELECT DISTINCT item.value AS qianchuan_material_id
    FROM (
      VALUES
        (NULLIF(BTRIM(material.external_material_id), '')),
        (
          CASE
            WHEN pv.platform = 'douyin' THEN NULLIF(BTRIM(pv.external_item_id), '')
            ELSE NULL::TEXT
          END
        )
    ) AS item(value)
    WHERE item.value IS NOT NULL
  ) material_key ON TRUE
  WHERE pv.relation_status = 'active'
    AND NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL
),
live_asset_identity_by_video AS (
  SELECT
    video_id,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_id ORDER BY asset_id)
        FILTER (WHERE asset_id IS NOT NULL),
      '{}'::UUID[]
    ) AS asset_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT platform_video_id ORDER BY platform_video_id)
        FILTER (WHERE platform_video_id IS NOT NULL),
      '{}'::UUID[]
    ) AS platform_video_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT ad_material_id ORDER BY ad_material_id)
        FILTER (WHERE ad_material_id IS NOT NULL),
      '{}'::UUID[]
    ) AS ad_material_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_product_name ORDER BY asset_product_name)
        FILTER (WHERE asset_product_name IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_product_names,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_owner_name ORDER BY asset_owner_name)
        FILTER (WHERE asset_owner_name IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_owner_names,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_owner_user_id ORDER BY asset_owner_user_id)
        FILTER (WHERE asset_owner_user_id IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_owner_user_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_video_type ORDER BY asset_video_type)
        FILTER (WHERE asset_video_type IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_video_types,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene ORDER BY asset_content_scene)
        FILTER (WHERE asset_content_scene IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scenes,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene_group ORDER BY asset_content_scene_group)
        FILTER (WHERE asset_content_scene_group IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scene_groups,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene_subtype ORDER BY asset_content_scene_subtype)
        FILTER (WHERE asset_content_scene_subtype IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scene_subtypes,
    COALESCE(
      ARRAY_AGG(DISTINCT qianchuan_material_id ORDER BY qianchuan_material_id)
        FILTER (WHERE qianchuan_material_id IS NOT NULL),
      '{}'::TEXT[]
    ) AS qianchuan_material_ids
  FROM live_identity_source
  GROUP BY video_id
),
live_material_identity_source AS (
  SELECT
    NULLIF(BTRIM(material.external_material_id), '') AS material_id,
    pv.platform_video_id,
    asset.asset_id,
    NULLIF(BTRIM(product_item.value), '') AS asset_product_name,
    NULLIF(BTRIM(asset.owner_name), '') AS asset_owner_name,
    NULLIF(BTRIM(asset.owner_user_id), '') AS asset_owner_user_id,
    NULLIF(BTRIM(asset.video_type), '') AS asset_video_type,
    NULLIF(BTRIM(asset.content_scene), '') AS asset_content_scene,
    NULLIF(BTRIM(asset.content_scene_group), '') AS asset_content_scene_group,
    NULLIF(BTRIM(asset.content_scene_subtype), '') AS asset_content_scene_subtype,
    material.ad_material_id,
    NULLIF(BTRIM(material.external_material_id), '') AS qianchuan_material_id
  FROM ads.marketing_content_ad_materials material
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = material.asset_id
   AND asset.is_deleted = FALSE
  LEFT JOIN LATERAL unnest(
    CASE
      WHEN COALESCE(array_length(asset.product_names, 1), 0) > 0 THEN asset.product_names
      WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL THEN ARRAY[asset.product_name]
      ELSE '{}'::TEXT[]
    END
  ) AS product_item(value) ON TRUE
  LEFT JOIN ads.marketing_content_platform_videos pv
    ON pv.asset_id = material.asset_id
   AND pv.relation_status = 'active'
   AND (
     material.platform_video_id = pv.platform_video_id
     OR NULLIF(BTRIM(material.external_video_id), '') = NULLIF(BTRIM(pv.external_video_id), '')
     OR (
       material.ad_platform IN ('qianchuan', '千川')
       AND NULLIF(BTRIM(material.external_material_id), '') = NULLIF(BTRIM(pv.external_item_id), '')
     )
   )
  WHERE material.relation_status = 'active'
    AND NULLIF(BTRIM(material.external_material_id), '') IS NOT NULL
  UNION ALL
  SELECT
    NULLIF(BTRIM(pv.external_item_id), '') AS material_id,
    pv.platform_video_id,
    asset.asset_id,
    NULLIF(BTRIM(product_item.value), '') AS asset_product_name,
    NULLIF(BTRIM(asset.owner_name), '') AS asset_owner_name,
    NULLIF(BTRIM(asset.owner_user_id), '') AS asset_owner_user_id,
    NULLIF(BTRIM(asset.video_type), '') AS asset_video_type,
    NULLIF(BTRIM(asset.content_scene), '') AS asset_content_scene,
    NULLIF(BTRIM(asset.content_scene_group), '') AS asset_content_scene_group,
    NULLIF(BTRIM(asset.content_scene_subtype), '') AS asset_content_scene_subtype,
    NULL::UUID AS ad_material_id,
    NULLIF(BTRIM(pv.external_item_id), '') AS qianchuan_material_id
  FROM ads.marketing_content_platform_videos pv
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = pv.asset_id
   AND asset.is_deleted = FALSE
  LEFT JOIN LATERAL unnest(
    CASE
      WHEN COALESCE(array_length(asset.product_names, 1), 0) > 0 THEN asset.product_names
      WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL THEN ARRAY[asset.product_name]
      ELSE '{}'::TEXT[]
    END
  ) AS product_item(value) ON TRUE
  WHERE pv.relation_status = 'active'
    AND pv.platform = 'douyin'
    AND NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL
),
live_asset_identity_by_material AS (
  SELECT
    material_id,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_id ORDER BY asset_id)
        FILTER (WHERE asset_id IS NOT NULL),
      '{}'::UUID[]
    ) AS asset_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT platform_video_id ORDER BY platform_video_id)
        FILTER (WHERE platform_video_id IS NOT NULL),
      '{}'::UUID[]
    ) AS platform_video_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT ad_material_id ORDER BY ad_material_id)
        FILTER (WHERE ad_material_id IS NOT NULL),
      '{}'::UUID[]
    ) AS ad_material_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_product_name ORDER BY asset_product_name)
        FILTER (WHERE asset_product_name IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_product_names,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_owner_name ORDER BY asset_owner_name)
        FILTER (WHERE asset_owner_name IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_owner_names,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_owner_user_id ORDER BY asset_owner_user_id)
        FILTER (WHERE asset_owner_user_id IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_owner_user_ids,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_video_type ORDER BY asset_video_type)
        FILTER (WHERE asset_video_type IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_video_types,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene ORDER BY asset_content_scene)
        FILTER (WHERE asset_content_scene IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scenes,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene_group ORDER BY asset_content_scene_group)
        FILTER (WHERE asset_content_scene_group IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scene_groups,
    COALESCE(
      ARRAY_AGG(DISTINCT asset_content_scene_subtype ORDER BY asset_content_scene_subtype)
        FILTER (WHERE asset_content_scene_subtype IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_content_scene_subtypes,
    COALESCE(
      ARRAY_AGG(DISTINCT qianchuan_material_id ORDER BY qianchuan_material_id)
        FILTER (WHERE qianchuan_material_id IS NOT NULL),
      '{}'::TEXT[]
    ) AS qianchuan_material_ids
  FROM live_material_identity_source
  GROUP BY material_id
),
source_detail AS (
  SELECT
    d.*,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_product_names') = 'array'
          THEN to_jsonb(d)->'asset_product_names'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_product_names,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_owner_names') = 'array'
          THEN to_jsonb(d)->'asset_owner_names'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_owner_names,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_video_types') = 'array'
          THEN to_jsonb(d)->'asset_video_types'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_video_types,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_content_scenes') = 'array'
          THEN to_jsonb(d)->'asset_content_scenes'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_content_scenes,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_content_scene_groups') = 'array'
          THEN to_jsonb(d)->'asset_content_scene_groups'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_content_scene_groups,
    ARRAY(
      SELECT item.value
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(to_jsonb(d)->'asset_content_scene_subtypes') = 'array'
          THEN to_jsonb(d)->'asset_content_scene_subtypes'
          ELSE '[]'::JSONB
        END
      ) AS item(value)
    ) AS compat_asset_content_scene_subtypes
  FROM ads.douyin_shortvideo_detail d
),
merged_detail AS (
  SELECT
    d.*,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.asset_ids, '{}'::UUID[])
        || COALESCE(live.asset_ids, '{}'::UUID[])
        || COALESCE(live_material.asset_ids, '{}'::UUID[])
      ) AS item(value)
      ORDER BY item.value
    ) AS merged_asset_ids,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.platform_video_ids, '{}'::UUID[])
        || COALESCE(live.platform_video_ids, '{}'::UUID[])
        || COALESCE(live_material.platform_video_ids, '{}'::UUID[])
      ) AS item(value)
      WHERE EXISTS (
        SELECT 1
        FROM ads.marketing_content_platform_videos active_pv
        WHERE active_pv.platform_video_id = item.value
          AND active_pv.relation_status = 'active'
      )
      ORDER BY item.value
    ) AS merged_platform_video_ids,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.ad_material_ids, '{}'::UUID[])
        || COALESCE(live.ad_material_ids, '{}'::UUID[])
        || COALESCE(live_material.ad_material_ids, '{}'::UUID[])
      ) AS item(value)
      WHERE EXISTS (
        SELECT 1
        FROM ads.marketing_content_ad_materials active_material
        WHERE active_material.ad_material_id = item.value
          AND active_material.relation_status = 'active'
      )
      ORDER BY item.value
    ) AS merged_ad_material_ids,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_product_names, '{}'::TEXT[])
        || COALESCE(live.asset_product_names, '{}'::TEXT[])
        || COALESCE(live_material.asset_product_names, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_product_names,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_owner_names, '{}'::TEXT[])
        || COALESCE(live.asset_owner_names, '{}'::TEXT[])
        || COALESCE(live_material.asset_owner_names, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_owner_names,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(live.asset_owner_user_ids, '{}'::TEXT[])
        || COALESCE(live_material.asset_owner_user_ids, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_owner_user_ids,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_video_types, '{}'::TEXT[])
        || COALESCE(live.asset_video_types, '{}'::TEXT[])
        || COALESCE(live_material.asset_video_types, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_video_types,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_content_scenes, '{}'::TEXT[])
        || COALESCE(live.asset_content_scenes, '{}'::TEXT[])
        || COALESCE(live_material.asset_content_scenes, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_content_scenes,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_content_scene_groups, '{}'::TEXT[])
        || COALESCE(live.asset_content_scene_groups, '{}'::TEXT[])
        || COALESCE(live_material.asset_content_scene_groups, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_content_scene_groups,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.compat_asset_content_scene_subtypes, '{}'::TEXT[])
        || COALESCE(live.asset_content_scene_subtypes, '{}'::TEXT[])
        || COALESCE(live_material.asset_content_scene_subtypes, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_asset_content_scene_subtypes,
    ARRAY(
      SELECT DISTINCT item.value
      FROM unnest(
        COALESCE(d.qianchuan_material_ids, '{}'::TEXT[])
        || COALESCE(live.qianchuan_material_ids, '{}'::TEXT[])
        || COALESCE(live_material.qianchuan_material_ids, '{}'::TEXT[])
        || COALESCE(row_material_keys.material_ids, '{}'::TEXT[])
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY item.value
    ) AS merged_qianchuan_material_ids
  FROM source_detail d
  LEFT JOIN live_asset_identity_by_video live
    ON live.video_id = NULLIF(BTRIM(d.video_id), '')
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT NULLIF(BTRIM(item.value), '')
      FROM unnest(
        COALESCE(d.qianchuan_material_ids, '{}'::TEXT[])
        || CASE
          WHEN NULLIF(BTRIM(d.qianchuan_material_key), '') IS NOT NULL
          THEN regexp_split_to_array(NULLIF(BTRIM(d.qianchuan_material_key), ''), '\s*,\s*')
          ELSE '{}'::TEXT[]
        END
      ) AS item(value)
      WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
      ORDER BY NULLIF(BTRIM(item.value), '')
    ) AS material_ids
  ) row_material_keys ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_ids) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_ids,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.platform_video_ids) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS platform_video_ids,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.ad_material_ids) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS ad_material_ids,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_product_names) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_product_names,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_owner_names) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_owner_names,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_owner_user_ids) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_owner_user_ids,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_video_types) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_video_types,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_content_scenes) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_content_scenes,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_content_scene_groups) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_content_scene_groups,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.asset_content_scene_subtypes) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS asset_content_scene_subtypes,
      ARRAY(
        SELECT DISTINCT item.value
        FROM live_asset_identity_by_material material_hit
        CROSS JOIN LATERAL unnest(material_hit.qianchuan_material_ids) AS item(value)
        WHERE material_hit.material_id = ANY(row_material_keys.material_ids)
        ORDER BY item.value
      ) AS qianchuan_material_ids
  ) live_material ON TRUE
),
manual_attr_target_owners AS (
  SELECT
    target.author_douyin_id,
    target.video_id,
    COALESCE(
      ARRAY_AGG(DISTINCT target.owner_user_id ORDER BY target.owner_user_id)
        FILTER (WHERE target.owner_user_id IS NOT NULL),
      '{}'::TEXT[]
    ) AS asset_owner_user_ids
  FROM (
    SELECT
      COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') AS author_douyin_id,
      COALESCE(NULLIF(BTRIM(d.video_id), ''), '') AS video_id,
      NULLIF(BTRIM(asset.owner_user_id), '') AS owner_user_id
    FROM ads.douyin_shortvideo_detail d
    LEFT JOIN live_asset_identity_by_video live
      ON live.video_id = NULLIF(BTRIM(d.video_id), '')
    LEFT JOIN LATERAL unnest(
      CASE
        WHEN COALESCE(array_length(live.asset_ids, 1), 0) > 0 THEN live.asset_ids
        ELSE COALESCE(d.asset_ids, '{}'::UUID[])
      END
    ) AS asset_item(asset_id) ON TRUE
    LEFT JOIN ads.marketing_content_assets asset
      ON asset.asset_id = asset_item.asset_id
     AND asset.is_deleted = FALSE
    WHERE d.detail_grain = 'trade_video_day'
      AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
      AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
      AND NULLIF(BTRIM(d.author_douyin_id), '') IS NOT NULL
      AND NULLIF(BTRIM(d.video_id), '') IS NOT NULL
  ) target
  GROUP BY target.author_douyin_id, target.video_id
),
scoped_detail AS (
  SELECT
    d.detail_grain,
    d.stat_date,
    '抖音'::TEXT AS platform,
    COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
    COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
    COALESCE(NULLIF(BTRIM(d.account_type), ''), '未归类') AS account_type,
    COALESCE(d.account_types, '{}'::TEXT[]) AS account_types,
    COALESCE(NULLIF(BTRIM(d.video_title), ''), '(未命名短视频)') AS video_title,
    COALESCE(NULLIF(BTRIM(d.video_id), ''), '') AS video_id,
    COALESCE(NULLIF(BTRIM(d.is_promoted), ''), '') AS is_promoted,
    d.play_url,
    d.publish_time,
    COALESCE(NULLIF(BTRIM(d.author_nickname), ''), '(未命名达人)') AS author_nickname,
    COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') AS author_douyin_id,
    COALESCE(NULLIF(BTRIM(d.product_id), ''), '') AS product_id,
    COALESCE(d.trade_source_ids, '{}'::INTEGER[]) AS trade_source_ids,
    COALESCE(d.video_view_count, 0)::BIGINT AS video_view_count,
    COALESCE(d.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(d.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
    COALESCE(d.live_room_pay_amount, 0)::NUMERIC(18, 2) AS live_room_pay_amount,
    COALESCE(d.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS search_after_view_pay_amount,
    COALESCE(d.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shop_page_pay_amount,
    d.trade_created_at,
    d.trade_updated_at,
    COALESCE(d.merged_asset_ids, '{}'::UUID[]) AS asset_ids,
    COALESCE(d.merged_platform_video_ids, '{}'::UUID[]) AS platform_video_ids,
    COALESCE(d.merged_ad_material_ids, '{}'::UUID[]) AS ad_material_ids,
    COALESCE(d.merged_asset_product_names, '{}'::TEXT[]) AS asset_product_names,
    COALESCE(d.merged_asset_owner_names, '{}'::TEXT[]) AS asset_owner_names,
    COALESCE(owner_target.asset_owner_user_ids, d.merged_asset_owner_user_ids, '{}'::TEXT[]) AS asset_owner_user_ids,
    COALESCE(d.merged_asset_video_types, '{}'::TEXT[]) AS asset_video_types,
    COALESCE(d.merged_asset_content_scenes, '{}'::TEXT[]) AS asset_content_scenes,
    COALESCE(d.merged_asset_content_scene_groups, '{}'::TEXT[]) AS asset_content_scene_groups,
    COALESCE(d.merged_asset_content_scene_subtypes, '{}'::TEXT[]) AS asset_content_scene_subtypes,
    COALESCE(d.merged_qianchuan_material_ids, '{}'::TEXT[]) AS qianchuan_material_ids,
    COALESCE(
      NULLIF(BTRIM(d.qianchuan_material_key), ''),
      NULLIF(BTRIM(array_to_string(d.merged_qianchuan_material_ids, ',')), ''),
      ''
    ) AS qianchuan_material_key,
    GREATEST(
      COALESCE(d.qianchuan_material_count, 0),
      COALESCE(array_length(d.merged_qianchuan_material_ids, 1), 0)
    )::INTEGER AS qianchuan_material_count,
    COALESCE(d.qianchuan_material_video_names, '{}'::TEXT[]) AS qianchuan_material_video_names,
    d.qianchuan_material_created_at_min,
    d.qianchuan_material_created_at_max,
    COALESCE(d.qianchuan_overall_impression_count, 0)::BIGINT AS qianchuan_overall_impression_count,
    COALESCE(d.qianchuan_overall_click_count, 0)::BIGINT AS qianchuan_overall_click_count,
    d.qianchuan_overall_click_rate,
    d.qianchuan_overall_conversion_rate,
    COALESCE(d.qianchuan_overall_cost, 0)::NUMERIC(18, 2) AS qianchuan_overall_cost,
    COALESCE(d.qianchuan_overall_order_count, 0)::BIGINT AS qianchuan_overall_order_count,
    COALESCE(d.qianchuan_overall_gmv, 0)::NUMERIC(18, 2) AS qianchuan_overall_gmv,
    d.qianchuan_overall_pay_roi,
    d.qianchuan_overall_order_cost,
    COALESCE(d.qianchuan_user_pay_amount, 0)::NUMERIC(18, 2) AS qianchuan_user_pay_amount,
    d.qianchuan_overall_cpm,
    d.qianchuan_overall_cpc,
    COALESCE(d.qianchuan_smart_coupon_amount, 0)::NUMERIC(18, 2) AS qianchuan_smart_coupon_amount,
    COALESCE(d.qianchuan_platform_subsidy_amount, 0)::NUMERIC(18, 2) AS qianchuan_platform_subsidy_amount,
    d.qianchuan_net_gmv_roi,
    COALESCE(d.qianchuan_net_gmv, 0)::NUMERIC(18, 2) AS qianchuan_net_gmv,
    COALESCE(d.qianchuan_net_order_count, 0)::BIGINT AS qianchuan_net_order_count,
    d.qianchuan_net_order_cost,
    d.qianchuan_net_gmv_settlement_rate,
    d.qianchuan_refund_rate_1h,
    COALESCE(d.qianchuan_source_file_names, '{}'::TEXT[]) AS qianchuan_source_file_names,
    COALESCE(d.qianchuan_source_ids, '{}'::BIGINT[]) AS qianchuan_source_ids,
    d.qianchuan_ingest_time,
    COALESCE(d.qianchuan_metric_attributed, FALSE) AS qianchuan_metric_attributed,
    COALESCE(d.qianchuan_attribution_rank, 0)::INTEGER AS qianchuan_attribution_rank,
    COALESCE(NULLIF(BTRIM(d.mapping_status), ''), 'unmapped_video') AS mapping_status,
    COALESCE(NULLIF(BTRIM(d.qianchuan_match_status), ''), 'not_applicable') AS qianchuan_match_status,
    d.trade_source_updated_at,
    d.qianchuan_source_updated_at,
    d.source_max_updated_at,
    d.created_at AS detail_created_at,
    d.updated_at AS detail_updated_at,
    COALESCE(d.source_max_updated_at, d.trade_source_updated_at, d.qianchuan_source_updated_at) AS source_etl_loaded_at,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%'
        OR COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
      THEN '已合作挂车'
      ELSE '未分类'
    END AS cooperation_status_norm,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%' THEN '自营'
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%' THEN '合作'
      ELSE COALESCE(NULLIF(BTRIM(d.account_type), ''), '未归类')
    END AS cooperation_status
  FROM merged_detail d
  CROSS JOIN params p
  LEFT JOIN manual_attr_target_owners owner_target
    ON owner_target.author_douyin_id = COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '')
   AND owner_target.video_id = COALESCE(NULLIF(BTRIM(d.video_id), ''), '')
  WHERE d.stat_date BETWEEN p.start_date AND p.end_date
    AND (
      (
        d.detail_grain = 'trade_video_day'
        AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
        AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
      )
      OR (
        d.detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
        AND (
          COALESCE(array_length(d.merged_qianchuan_material_ids, 1), 0) > 0
          OR NULLIF(BTRIM(d.qianchuan_material_key), '') IS NOT NULL
          OR COALESCE(d.qianchuan_metric_attributed, FALSE)
          OR COALESCE(d.qianchuan_overall_impression_count, 0) > 0
          OR COALESCE(d.qianchuan_overall_click_count, 0) > 0
          OR COALESCE(d.qianchuan_overall_click_rate, 0) > 0
          OR COALESCE(d.qianchuan_overall_conversion_rate, 0) > 0
          OR COALESCE(d.qianchuan_overall_cost, 0) > 0
          OR COALESCE(d.qianchuan_overall_order_count, 0) > 0
          OR COALESCE(d.qianchuan_overall_gmv, 0) > 0
          OR COALESCE(d.qianchuan_overall_pay_roi, 0) > 0
          OR COALESCE(d.qianchuan_overall_order_cost, 0) > 0
          OR COALESCE(d.qianchuan_user_pay_amount, 0) > 0
          OR COALESCE(d.qianchuan_overall_cpm, 0) > 0
          OR COALESCE(d.qianchuan_overall_cpc, 0) > 0
          OR COALESCE(d.qianchuan_smart_coupon_amount, 0) > 0
          OR COALESCE(d.qianchuan_platform_subsidy_amount, 0) > 0
          OR COALESCE(d.qianchuan_net_gmv_roi, 0) > 0
          OR COALESCE(d.qianchuan_net_gmv, 0) <> 0
          OR COALESCE(d.qianchuan_net_order_count, 0) > 0
          OR COALESCE(d.qianchuan_net_order_cost, 0) > 0
          OR COALESCE(d.qianchuan_net_gmv_settlement_rate, 0) > 0
          OR COALESCE(d.qianchuan_refund_rate_1h, 0) > 0
        )
      )
    )
    AND (
      p.cooperation_status_filter IS NULL
      OR (
        d.detail_grain = 'trade_video_day'
        AND CASE
          WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%'
            OR COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
          THEN '已合作挂车'
          ELSE '未分类'
        END = p.cooperation_status_filter
      )
    )
    AND (
      p.keyword_filter IS NULL
      OR COALESCE(NULLIF(BTRIM(d.author_nickname), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.video_title), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.video_id), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.product_id), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.account_type), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.detail_grain), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.mapping_status), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.qianchuan_match_status), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR COALESCE(NULLIF(BTRIM(d.qianchuan_material_key), ''), '') ILIKE ('%' || p.keyword_filter || '%')
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.account_types, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_qianchuan_material_ids, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_video_types, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_product_names, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_owner_names, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_content_scenes, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_content_scene_groups, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.merged_asset_content_scene_subtypes, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.qianchuan_material_video_names, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(d.qianchuan_source_file_names, '{}'::TEXT[])) item(value)
        WHERE item.value ILIKE ('%' || p.keyword_filter || '%')
      )
    )
),
fact_rows AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        sd.stat_date DESC,
        sd.detail_grain ASC,
        sd.user_pay_amount DESC,
        sd.qianchuan_overall_cost DESC,
        sd.author_nickname ASC,
        sd.video_id ASC,
        sd.qianchuan_material_key ASC
    )::BIGINT AS id,
    ROW_NUMBER() OVER (
      ORDER BY
        sd.stat_date DESC,
        sd.detail_grain ASC,
        sd.user_pay_amount DESC,
        sd.qianchuan_overall_cost DESC,
        sd.author_nickname ASC,
        sd.video_id ASC,
        sd.qianchuan_material_key ASC
    )::BIGINT AS sequence_no,
    COALESCE(NULLIF(sd.author_douyin_id, ''), NULLIF(sd.author_nickname, ''), '未知达人') AS influencer_key,
    NULLIF(sd.author_douyin_id, '') AS influencer_id,
    COALESCE(NULLIF(sd.author_nickname, ''), NULLIF(sd.author_douyin_id, ''), '未知达人') AS influencer_name,
    sd.author_nickname AS influencer_nickname,
    sd.author_nickname AS author_name_snapshot,
    NULL::TEXT AS anchor_desc,
    NULL::TEXT AS anchor_level,
    NULL::TEXT AS main_platform_fans,
    NULL::TEXT AS sales_30d,
    NULL::TEXT AS sales_90d,
    sd.account_type AS cooperation_desc,
    NULLIF(BTRIM(array_to_string(sd.asset_owner_names, ' / ')), '') AS owner_name,
    CASE
      WHEN sd.detail_grain = 'trade_video_day'
        AND COALESCE(array_length(sd.qianchuan_source_file_names, 1), 0) > 0
      THEN 'ods.douyin_trade_sale_shortvideo_raw / ods.douyin_trade_sale_image_raw / ods.douyin_qianchuan_shortvideo_raw'
      WHEN sd.detail_grain = 'trade_video_day'
      THEN 'ods.douyin_trade_sale_shortvideo_raw / ods.douyin_trade_sale_image_raw'
      ELSE 'ods.douyin_qianchuan_shortvideo_raw'
    END AS source_file_name,
    CASE
      WHEN sd.detail_grain = 'trade_video_day' AND sd.video_id <> '' THEN 1
      WHEN sd.video_id <> '' THEN 1
      ELSE COALESCE(sd.qianchuan_material_count, 0)
    END::BIGINT AS shortvideo_count,
    0::BIGINT AS shortvideo_duration_minutes,
    sd.video_view_count AS shortvideo_view_count,
    0::BIGINT AS shortvideo_exposure_user_count,
    0::BIGINT AS shortvideo_product_click_user,
    sd.qianchuan_overall_order_count AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    sd.user_pay_amount AS shortvideo_gmv,
    sd.user_pay_amount AS shortvideo_user_pay_amount,
    sd.refund_amount AS shortvideo_refund_amount,
    sd.qianchuan_overall_cost AS shortvideo_ad_cost,
    sd.live_room_pay_amount AS shortvideo_live_room_pay_amount,
    sd.search_after_view_pay_amount AS shortvideo_search_after_view_pay_amount,
    sd.shop_page_pay_amount AS shortvideo_shop_page_pay_amount,
    CASE
      WHEN sd.video_view_count > 0 AND sd.qianchuan_overall_order_count > 0
      THEN ROUND(sd.qianchuan_overall_order_count::NUMERIC / sd.video_view_count::NUMERIC, 6)
      ELSE NULL::NUMERIC(18, 6)
    END AS watch_to_buyer_rate,
    CASE
      WHEN sd.user_pay_amount > 0
      THEN ROUND(sd.refund_amount / sd.user_pay_amount, 6)
      ELSE NULL::NUMERIC(18, 6)
    END AS refund_rate,
    CASE
      WHEN NULLIF(sd.author_douyin_id, '') IS NOT NULL THEN 'matched_by_id'
      WHEN sd.detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
        THEN sd.qianchuan_match_status
      WHEN NULLIF(sd.author_nickname, '') IS NOT NULL
        AND sd.author_nickname <> '(未命名达人)'
      THEN 'matched_by_name'
      ELSE 'missing_influencer_id'
    END AS match_status,
    (
      NULLIF(sd.author_douyin_id, '') IS NOT NULL
      OR (
        NULLIF(sd.author_nickname, '') IS NOT NULL
        AND sd.author_nickname <> '(未命名达人)'
        AND sd.detail_grain = 'trade_video_day'
      )
    ) AS is_matched,
    (
      sd.video_id <> ''
      OR sd.qianchuan_material_count > 0
      OR sd.user_pay_amount > 0
      OR COALESCE(sd.qianchuan_metric_attributed, FALSE)
      OR sd.qianchuan_overall_impression_count > 0
      OR sd.qianchuan_overall_click_count > 0
      OR COALESCE(sd.qianchuan_overall_click_rate, 0) > 0
      OR COALESCE(sd.qianchuan_overall_conversion_rate, 0) > 0
      OR sd.qianchuan_overall_cost > 0
      OR sd.qianchuan_overall_gmv > 0
      OR COALESCE(sd.qianchuan_overall_pay_roi, 0) > 0
      OR COALESCE(sd.qianchuan_overall_order_cost, 0) > 0
      OR sd.qianchuan_user_pay_amount > 0
      OR COALESCE(sd.qianchuan_overall_cpm, 0) > 0
      OR COALESCE(sd.qianchuan_overall_cpc, 0) > 0
      OR sd.qianchuan_smart_coupon_amount > 0
      OR sd.qianchuan_platform_subsidy_amount > 0
      OR COALESCE(sd.qianchuan_net_gmv_roi, 0) > 0
      OR sd.qianchuan_net_gmv <> 0
      OR sd.qianchuan_net_order_count > 0
      OR COALESCE(sd.qianchuan_net_order_cost, 0) > 0
      OR COALESCE(sd.qianchuan_net_gmv_settlement_rate, 0) > 0
      OR COALESCE(sd.qianchuan_refund_rate_1h, 0) > 0
    ) AS has_shortvideo_data,
    ma.manual_attr_id::BIGINT AS manual_attr_id,
    ma.scope_type AS manual_scope_type,
    ma.platform::TEXT AS manual_platform,
    ma.author_douyin_id::TEXT AS manual_author_douyin_id,
    ma.author_name_snapshot::TEXT AS manual_author_name_snapshot,
    ma.video_id::TEXT AS manual_video_id,
    ma.product_id::TEXT AS manual_product_id,
    ma.fans_count::BIGINT AS manual_fans_count,
    ma.fans_count_updated_at::TEXT AS manual_fans_count_updated_at,
    ma.creator_type::TEXT AS manual_creator_type,
    ma.compat_mcn::TEXT AS manual_mcn,
    ma.creator_fee_amount::NUMERIC(18, 2) AS manual_creator_fee_amount,
    ma.creator_fee_type::TEXT AS manual_creator_fee_type,
    ma.creator_fee_note::TEXT AS manual_creator_fee_note,
    ma.created_by_user_id::TEXT AS manual_created_by_user_id,
    ma.created_by_name::TEXT AS manual_created_by_name,
    ma.updated_by_user_id::TEXT AS manual_updated_by_user_id,
    ma.updated_by_name::TEXT AS manual_updated_by_name,
    ma.created_at::TEXT AS manual_created_at,
    ma.updated_at::TEXT AS manual_updated_at,
    ma.is_deleted AS manual_is_deleted,
    CASE
      WHEN NULLIF(sd.author_douyin_id, '') IS NULL OR NULLIF(sd.video_id, '') IS NULL THEN FALSE
      WHEN p.can_manage_manual_attrs THEN TRUE
      WHEN COALESCE(array_length(sd.asset_owner_user_ids, 1), 0) = 0
        AND NULLIF(p.current_user_id, '') IS NOT NULL THEN TRUE
      WHEN p.current_user_id = ANY(sd.asset_owner_user_ids) THEN TRUE
      ELSE FALSE
    END AS manual_can_edit,
    CASE
      WHEN ma.manual_attr_id IS NULL THEN FALSE
      WHEN NULLIF(sd.author_douyin_id, '') IS NULL OR NULLIF(sd.video_id, '') IS NULL THEN FALSE
      WHEN p.can_manage_manual_attrs THEN TRUE
      WHEN COALESCE(array_length(sd.asset_owner_user_ids, 1), 0) = 0
        AND NULLIF(p.current_user_id, '') IS NOT NULL THEN TRUE
      WHEN p.current_user_id = ANY(sd.asset_owner_user_ids) THEN TRUE
      ELSE FALSE
    END AS manual_can_delete,
    sd.*
  FROM scoped_detail sd
  CROSS JOIN params p
  LEFT JOIN LATERAL (
    SELECT
      ma.manual_attr_id,
      ma.scope_type,
      ma.platform,
      ma.author_douyin_id,
      ma.author_name_snapshot,
      ma.video_id,
      ma.product_id,
      ma.fans_count,
      ma.fans_count_updated_at,
      ma.creator_type,
      to_jsonb(ma)->>'mcn' AS compat_mcn,
      ma.creator_fee_amount,
      ma.creator_fee_type,
      ma.creator_fee_note,
      ma.created_by_user_id,
      ma.created_by_name,
      ma.updated_by_user_id,
      ma.updated_by_name,
      ma.created_at,
      ma.updated_at,
      ma.is_deleted
    FROM ads.douyin_shortvideo_creator_manual_attrs ma
    WHERE ma.platform = 'douyin'
      AND ma.is_deleted = FALSE
      AND ma.author_douyin_id = NULLIF(sd.author_douyin_id, '')
      AND ma.scope_type = 'video'
      AND ma.video_id = NULLIF(sd.video_id, '')
      AND ma.product_id = ''
    ORDER BY
      ma.updated_at DESC,
      ma.manual_attr_id DESC
    LIMIT 1
  ) ma ON TRUE
),
video_rows AS (
  SELECT *
  FROM fact_rows
),
author_rows AS (
  SELECT
    f.platform,
    f.influencer_key,
    MAX(f.influencer_id) AS influencer_id,
    MAX(f.influencer_name) AS influencer_name,
    MAX(f.shop_id) FILTER (WHERE f.shop_id <> '') AS shop_id,
    MAX(f.shop_name) FILTER (WHERE f.shop_name <> '') AS shop_name,
    f.account_type,
    f.cooperation_status,
    f.cooperation_status_norm,
    COALESCE(SUM(f.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    0::BIGINT AS shortvideo_duration_minutes,
    COALESCE(SUM(f.video_view_count), 0)::BIGINT AS shortvideo_view_count,
    0::BIGINT AS shortvideo_exposure_user_count,
    0::BIGINT AS shortvideo_product_click_user,
    COALESCE(SUM(f.qianchuan_overall_order_count), 0)::BIGINT AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(f.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(f.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(SUM(f.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(f.qianchuan_overall_cost), 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(SUM(f.live_room_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(f.search_after_view_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(f.shop_page_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
    MAX(f.source_etl_loaded_at)::TEXT AS source_etl_loaded_at,
    CASE
      WHEN MAX(f.influencer_id) IS NOT NULL THEN 'matched_by_id'
      WHEN MAX(f.match_status) = 'matched_by_name' THEN 'matched_by_name'
      ELSE 'missing_influencer_id'
    END AS match_status
  FROM video_rows f
  GROUP BY
    f.platform,
    f.influencer_key,
    f.account_type,
    f.cooperation_status,
    f.cooperation_status_norm
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE f.influencer_id IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE f.match_status IN ('matched_by_id', 'matched_by_name'))::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE f.shortvideo_count > 0 OR f.shortvideo_gmv > 0 OR f.shortvideo_ad_cost > 0)::BIGINT AS shortvideo_influencer_count,
    COALESCE(SUM(f.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    COALESCE(SUM(f.shortvideo_duration_minutes), 0)::BIGINT AS shortvideo_duration_minutes,
    COALESCE(SUM(f.shortvideo_view_count), 0)::BIGINT AS shortvideo_view_count,
    COALESCE(SUM(f.shortvideo_exposure_user_count), 0)::BIGINT AS shortvideo_exposure_user_count,
    COALESCE(SUM(f.shortvideo_product_click_user), 0)::BIGINT AS shortvideo_product_click_user,
    COALESCE(SUM(f.shortvideo_order_count), 0)::BIGINT AS shortvideo_order_count,
    COALESCE(SUM(f.shortvideo_refund_order_count), 0)::BIGINT AS shortvideo_refund_order_count,
    COALESCE(SUM(f.shortvideo_buyer_count), 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(f.shortvideo_gmv), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(f.shortvideo_user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(SUM(f.shortvideo_refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(f.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(SUM(f.shortvideo_live_room_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(f.shortvideo_search_after_view_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(f.shortvideo_shop_page_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount
  FROM author_rows f
),
status_summary AS (
  SELECT
    f.cooperation_status_norm,
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE f.influencer_id IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE f.match_status IN ('matched_by_id', 'matched_by_name'))::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE f.shortvideo_count > 0 OR f.shortvideo_gmv > 0 OR f.shortvideo_ad_cost > 0)::BIGINT AS shortvideo_influencer_count,
    COALESCE(SUM(f.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    COALESCE(SUM(f.shortvideo_buyer_count), 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(f.shortvideo_gmv), 0)::NUMERIC(18, 2) AS shortvideo_gmv
  FROM author_rows f
  GROUP BY f.cooperation_status_norm
),
status_summary_sorted AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      ORDER BY s.shortvideo_gmv DESC, s.influencer_count DESC, s.cooperation_status_norm ASC
    ) AS sort_order
  FROM status_summary s
)
SELECT json_build_object(
  'startDate', (SELECT p.start_date::TEXT FROM params p),
  'endDate', (SELECT p.end_date::TEXT FROM params p),
  'cooperationStatus', (SELECT p.cooperation_status_filter FROM params p),
  'keyword', (SELECT p.keyword_filter FROM params p),
  'summary', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        s.influencer_count,
        s.with_id_count,
        (s.influencer_count - s.with_id_count)::BIGINT AS without_id_count,
        s.matched_influencer_count,
        s.shortvideo_influencer_count,
        s.shortvideo_count,
        s.shortvideo_duration_minutes,
        s.shortvideo_view_count,
        s.shortvideo_exposure_user_count,
        s.shortvideo_product_click_user,
        s.shortvideo_order_count,
        s.shortvideo_refund_order_count,
        s.shortvideo_buyer_count,
        s.shortvideo_gmv,
        s.shortvideo_user_pay_amount,
        s.shortvideo_refund_amount,
        s.shortvideo_ad_cost,
        s.shortvideo_live_room_pay_amount,
        s.shortvideo_search_after_view_pay_amount,
        s.shortvideo_shop_page_pay_amount,
        CASE
          WHEN s.with_id_count > 0
            THEN ROUND((s.matched_influencer_count::NUMERIC / s.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        CASE
          WHEN s.shortvideo_view_count > 0
            THEN ROUND((s.shortvideo_order_count::NUMERIC / s.shortvideo_view_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS watch_to_buyer_rate
      FROM summary s
    ) t
  ),
  'statusSummary', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'cooperation_status', s.cooperation_status_norm,
          'influencer_count', s.influencer_count,
          'with_id_count', s.with_id_count,
          'matched_influencer_count', s.matched_influencer_count,
          'shortvideo_influencer_count', s.shortvideo_influencer_count,
          'shortvideo_count', s.shortvideo_count,
          'shortvideo_buyer_count', s.shortvideo_buyer_count,
          'shortvideo_gmv', s.shortvideo_gmv
        )
        ORDER BY s.sort_order
      )
      FROM status_summary_sorted s
    ),
    '[]'::JSON
  ),
  'rows', COALESCE(
    (
      SELECT json_agg(row_to_json(row_payload) ORDER BY row_payload.stat_date DESC, row_payload.sequence_no ASC)
      FROM (
        SELECT
          f.id,
          f.sequence_no,
          f.detail_grain,
          f.stat_date::TEXT AS stat_date,
          f.platform,
          f.shop_name,
          f.shop_id,
          f.account_type,
          f.account_types,
          f.video_title,
          f.video_id,
          f.is_promoted,
          f.play_url,
          f.publish_time::TEXT AS publish_time,
          f.author_nickname,
          f.author_douyin_id,
          f.author_name_snapshot,
          f.product_id,
          f.trade_source_ids,
          f.video_view_count,
          f.user_pay_amount,
          f.refund_amount,
          f.live_room_pay_amount,
          f.search_after_view_pay_amount,
          f.shop_page_pay_amount,
          f.trade_created_at::TEXT AS trade_created_at,
          f.trade_updated_at::TEXT AS trade_updated_at,
          f.asset_ids,
          f.platform_video_ids,
          f.ad_material_ids,
          f.asset_product_names,
          f.asset_owner_names,
          f.asset_owner_user_ids,
          f.asset_video_types,
          f.asset_content_scenes,
          f.asset_content_scene_groups,
          f.asset_content_scene_subtypes,
          f.qianchuan_material_ids,
          f.qianchuan_material_key,
          f.qianchuan_material_count,
          f.qianchuan_material_video_names,
          f.qianchuan_material_created_at_min::TEXT AS qianchuan_material_created_at_min,
          f.qianchuan_material_created_at_max::TEXT AS qianchuan_material_created_at_max,
          f.qianchuan_overall_impression_count,
          f.qianchuan_overall_click_count,
          f.qianchuan_overall_click_rate,
          f.qianchuan_overall_conversion_rate,
          f.qianchuan_overall_cost,
          f.qianchuan_overall_order_count,
          f.qianchuan_overall_gmv,
          f.qianchuan_overall_pay_roi,
          f.qianchuan_overall_order_cost,
          f.qianchuan_user_pay_amount,
          f.qianchuan_overall_cpm,
          f.qianchuan_overall_cpc,
          f.qianchuan_smart_coupon_amount,
          f.qianchuan_platform_subsidy_amount,
          f.qianchuan_net_gmv_roi,
          f.qianchuan_net_gmv,
          f.qianchuan_net_order_count,
          f.qianchuan_net_order_cost,
          f.qianchuan_net_gmv_settlement_rate,
          f.qianchuan_refund_rate_1h,
          f.qianchuan_source_file_names,
          ARRAY(
            SELECT item.value::TEXT
            FROM unnest(COALESCE(f.qianchuan_source_ids, '{}'::BIGINT[])) AS item(value)
          ) AS qianchuan_source_ids,
          f.qianchuan_ingest_time::TEXT AS qianchuan_ingest_time,
          f.qianchuan_metric_attributed,
          f.qianchuan_attribution_rank,
          f.mapping_status,
          f.qianchuan_match_status,
          f.trade_source_updated_at::TEXT AS trade_source_updated_at,
          f.qianchuan_source_updated_at::TEXT AS qianchuan_source_updated_at,
          f.source_max_updated_at::TEXT AS source_max_updated_at,
          f.detail_created_at::TEXT AS created_at,
          f.detail_updated_at::TEXT AS updated_at,
          f.source_etl_loaded_at::TEXT AS source_etl_loaded_at,
          f.influencer_key,
          f.influencer_id,
          f.influencer_name,
          f.influencer_nickname,
          f.anchor_desc,
          f.anchor_level,
          f.main_platform_fans,
          f.sales_30d,
          f.sales_90d,
          f.cooperation_status,
          f.cooperation_status_norm,
          f.cooperation_desc,
          f.owner_name,
          f.source_file_name,
          f.shortvideo_count,
          f.shortvideo_duration_minutes,
          f.shortvideo_view_count,
          f.shortvideo_exposure_user_count,
          f.shortvideo_product_click_user,
          f.shortvideo_order_count,
          f.shortvideo_refund_order_count,
          f.shortvideo_buyer_count,
          f.shortvideo_gmv,
          f.shortvideo_user_pay_amount,
          f.shortvideo_refund_amount,
          f.shortvideo_ad_cost,
          f.shortvideo_live_room_pay_amount,
          f.shortvideo_search_after_view_pay_amount,
          f.shortvideo_shop_page_pay_amount,
          f.watch_to_buyer_rate,
          f.refund_rate,
          f.match_status,
          f.is_matched,
          f.has_shortvideo_data,
          f.manual_attr_id,
          f.manual_scope_type,
          f.manual_platform,
          f.manual_author_douyin_id,
          f.manual_author_name_snapshot,
          f.manual_video_id,
          f.manual_product_id,
          f.manual_fans_count,
          f.manual_fans_count_updated_at,
          f.manual_creator_type,
          f.manual_mcn,
          f.manual_creator_fee_amount,
          f.manual_creator_fee_type,
          f.manual_creator_fee_note,
          f.manual_created_by_user_id,
          f.manual_created_by_name,
          f.manual_updated_by_user_id,
          f.manual_updated_by_name,
          f.manual_created_at,
          f.manual_updated_at,
          f.manual_is_deleted,
          f.manual_can_edit,
          f.manual_can_delete
        FROM video_rows f
      ) row_payload
    ),
    '[]'::JSON
  )
)::TEXT;
