WITH source_ranked AS (
  SELECT
    COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS join_shop_id,
    COALESCE(NULLIF(BTRIM(src.influencer_douyin_id), ''), '') AS join_anchor_douyin_id,
    src.live_start_time AS join_live_start_time,
    COALESCE(NULLIF(BTRIM(src.product_id), ''), 'UNKNOWN_PRODUCT') AS join_product_id,
    COALESCE(NULLIF(BTRIM(src.sku_name), ''), '汇总') AS join_sku_name,
    src.influencer_avatar_url,
    src.influencer_nickname,
    src.influencer_level,
    src.influencer_douyin_id,
    src.influencer_type,
    src.influencer_org,
    src.follower_count_before_live,
    src.live_time_range_text,
    src.live_duration_text,
    src.live_platform,
    src.live_user_pay_amount,
    src.pay_per_thousand_views,
    src.estimated_commission_cost,
    src.penalty_count,
    src.source_file_name,
    src.source_file_mtime,
    src.ingest_time,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(NULLIF(BTRIM(src.shop_id), ''), ''),
        COALESCE(NULLIF(BTRIM(src.influencer_douyin_id), ''), ''),
        src.live_start_time,
        COALESCE(NULLIF(BTRIM(src.product_id), ''), 'UNKNOWN_PRODUCT'),
        COALESCE(NULLIF(BTRIM(src.sku_name), ''), '汇总')
      ORDER BY
        COALESCE(src.source_file_mtime, src.ingest_time, src.live_start_time) DESC,
        src.ingest_time DESC,
        src.id DESC
    ) AS rn
  FROM ods.douyin_livestream_goods src
  WHERE src.live_start_time IS NOT NULL
    AND DATE(src.live_start_time) BETWEEN $1::DATE AND $2::DATE
)
SELECT row_to_json(t)::TEXT AS payload
FROM (
  SELECT
    d.stat_date::TEXT AS stat_date,
    d.live_start_time::TEXT AS live_start_time,
    d.live_end_time::TEXT AS live_end_time,
    COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
    CASE
      WHEN NULLIF(BTRIM(d.anchor_douyin_id), '') IS NULL THEN '(缺失主播ID)'
      ELSE COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '(未命名主播)')
    END AS anchor_nickname,
    COALESCE(NULLIF(BTRIM(d.anchor_type), ''), '未归类') AS anchor_type,
    COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
    COALESCE(NULLIF(BTRIM(d.shop_name), ''), '(未命名店铺)') AS shop_name,
    d.live_identity_type,
    COALESCE(d.live_duration_minutes, 0)::DOUBLE PRECISION AS live_duration_minutes,
    COALESCE(NULLIF(BTRIM(d.product_name), ''), '(未命名商品)') AS product_name,
    COALESCE(NULLIF(BTRIM(d.product_id), ''), 'UNKNOWN_PRODUCT') AS product_id,
    COALESCE(NULLIF(BTRIM(d.sku_name), ''), '汇总') AS sku_name,
    COALESCE(
      NULLIF(BTRIM(d.sku_row_type), ''),
      CASE WHEN d.sku_name = '汇总' THEN 'product_summary' ELSE 'sku' END
    ) AS sku_row_type,
    COALESCE(NULLIF(BTRIM(d.product_image_url), ''), '') AS product_image_url,
    COALESCE(d.product_user_pay_amount, 0)::DOUBLE PRECISION AS product_user_pay_amount,
    COALESCE(d.product_sales_volume, 0)::DOUBLE PRECISION AS product_sales_volume,
    COALESCE(d.product_buyer_count, 0)::DOUBLE PRECISION AS product_buyer_count,
    COALESCE(d.product_order_count, 0)::DOUBLE PRECISION AS product_order_count,
    COALESCE(d.presale_order_count, 0)::DOUBLE PRECISION AS presale_order_count,
    COALESCE(d.presale_full_amount, 0)::DOUBLE PRECISION AS presale_full_amount,
    COALESCE(d.product_exposure_user_count, 0)::DOUBLE PRECISION AS product_exposure_user_count,
    COALESCE(d.product_click_user_count, 0)::DOUBLE PRECISION AS product_click_user_count,
    CASE
      WHEN COALESCE(d.product_exposure_user_count, 0) > 0
        THEN ROUND(
          COALESCE(d.product_click_user_count, 0)::NUMERIC
          / COALESCE(d.product_exposure_user_count, 0)::NUMERIC,
          6
        )::DOUBLE PRECISION
      ELSE 0::DOUBLE PRECISION
    END AS product_exposure_to_click_rate_user,
    CASE
      WHEN COALESCE(d.product_click_user_count, 0) > 0
        THEN ROUND(
          COALESCE(d.product_buyer_count, 0)::NUMERIC
          / COALESCE(d.product_click_user_count, 0)::NUMERIC,
          6
        )::DOUBLE PRECISION
      ELSE 0::DOUBLE PRECISION
    END AS product_click_to_pay_rate_user,
    COALESCE(d.refund_user_count, 0)::DOUBLE PRECISION AS refund_user_count,
    COALESCE(d.refund_amount, 0)::DOUBLE PRECISION AS refund_amount,
    COALESCE(d.refund_order_count, 0)::DOUBLE PRECISION AS refund_order_count,
    d.source_updated_at::TEXT AS source_updated_at,
    d.created_at::TEXT AS created_at,
    d.updated_at::TEXT AS updated_at,
    sr.influencer_avatar_url,
    sr.influencer_nickname,
    sr.influencer_level,
    sr.influencer_douyin_id,
    sr.influencer_type,
    sr.influencer_org,
    sr.follower_count_before_live,
    sr.live_time_range_text,
    sr.live_duration_text,
    sr.live_platform,
    sr.live_user_pay_amount::DOUBLE PRECISION AS live_user_pay_amount,
    sr.pay_per_thousand_views::DOUBLE PRECISION AS pay_per_thousand_views,
    sr.estimated_commission_cost::DOUBLE PRECISION AS estimated_commission_cost,
    sr.penalty_count,
    sr.source_file_name,
    sr.source_file_mtime::TEXT AS source_file_mtime,
    sr.ingest_time::TEXT AS ingest_time
  FROM ads.douyin_live_goods_detail d
  LEFT JOIN source_ranked sr
    ON sr.rn = 1
   AND sr.join_shop_id = COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
   AND sr.join_anchor_douyin_id = COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
   AND sr.join_live_start_time = d.live_start_time
   AND sr.join_product_id = COALESCE(NULLIF(BTRIM(d.product_id), ''), 'UNKNOWN_PRODUCT')
   AND sr.join_sku_name = COALESCE(NULLIF(BTRIM(d.sku_name), ''), '汇总')
  WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
    AND d.live_identity_type IN ('self', 'influencer')
    AND ($3::TEXT = 'all' OR d.live_identity_type = $3::TEXT)
  ORDER BY
    d.live_start_time DESC,
    CASE WHEN d.sku_row_type = 'product_summary' OR d.sku_name = '汇总' THEN 0 ELSE 1 END ASC,
    d.product_user_pay_amount DESC,
    d.product_name ASC,
    d.sku_name ASC
) t
