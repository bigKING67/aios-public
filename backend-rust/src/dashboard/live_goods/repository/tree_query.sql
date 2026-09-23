WITH source AS (
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
    COALESCE(NULLIF(BTRIM(d.sku_row_type), ''), CASE WHEN d.sku_name = '汇总' THEN 'product_summary' ELSE 'sku' END) AS sku_row_type,
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
    COALESCE(d.refund_order_count, 0)::DOUBLE PRECISION AS refund_order_count
  FROM ads.douyin_live_goods_detail d
  WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
    AND d.live_identity_type IN ('self', 'influencer')
    AND ($3::TEXT = 'all' OR d.live_identity_type = $3::TEXT)
),
group_metrics AS (
  SELECT
    shop_id,
    anchor_douyin_id,
    live_start_time,
    product_id,
    MAX(product_name) AS product_name,
    MAX(CASE WHEN sku_row_type = 'product_summary' OR sku_name = '汇总' THEN product_user_pay_amount ELSE NULL END) AS summary_pay_amount,
    SUM(CASE WHEN sku_row_type <> 'product_summary' AND sku_name <> '汇总' THEN product_user_pay_amount ELSE 0 END) AS sku_pay_amount
  FROM source
  GROUP BY shop_id, anchor_douyin_id, live_start_time, product_id
),
ranked_groups AS (
  SELECT
    group_metrics.*,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(NULLIF(summary_pay_amount, 0::DOUBLE PRECISION), sku_pay_amount, 0) DESC,
        live_start_time DESC,
        product_name ASC
    ) AS rn
  FROM group_metrics
)
SELECT row_to_json(t)::TEXT AS payload
FROM (
  SELECT
    s.stat_date,
    s.live_start_time,
    s.live_end_time,
    s.anchor_douyin_id,
    s.anchor_nickname,
    s.anchor_type,
    s.shop_id,
    s.shop_name,
    s.live_identity_type,
    s.live_duration_minutes,
    s.product_name,
    s.product_id,
    s.sku_name,
    s.sku_row_type,
    s.product_image_url,
    s.product_user_pay_amount,
    s.product_sales_volume,
    s.product_buyer_count,
    s.product_order_count,
    s.presale_order_count,
    s.presale_full_amount,
    s.product_exposure_user_count,
    s.product_click_user_count,
    s.product_exposure_to_click_rate_user,
    s.product_click_to_pay_rate_user,
    s.refund_user_count,
    s.refund_amount,
    s.refund_order_count
  FROM source s
  INNER JOIN ranked_groups rg
    ON rg.shop_id = s.shop_id
   AND rg.anchor_douyin_id = s.anchor_douyin_id
   AND rg.live_start_time = s.live_start_time
   AND rg.product_id = s.product_id
  WHERE rg.rn <= 500
  ORDER BY
    rg.rn ASC,
    CASE WHEN s.sku_row_type = 'product_summary' OR s.sku_name = '汇总' THEN 0 ELSE 1 END ASC,
    s.product_user_pay_amount DESC,
    s.sku_name ASC
) t
