WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS current_start_date,
    __END_DATE_LITERAL__::DATE AS current_end_date,
    __PREV_START_DATE_LITERAL__::DATE AS previous_start_date,
    __PREV_END_DATE_LITERAL__::DATE AS previous_end_date
),
range_scope AS (
  SELECT 'current'::TEXT AS period, p.current_start_date AS start_date, p.current_end_date AS end_date
  FROM params p
  UNION ALL
  SELECT 'previous'::TEXT, p.previous_start_date, p.previous_end_date
  FROM params p
),
scoped_detail AS (
  SELECT
    rs.period,
    d.detail_grain,
    d.stat_date,
    '抖音'::TEXT AS platform,
    COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
    COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
    COALESCE(NULLIF(BTRIM(d.account_type), ''), '未归类') AS account_type,
    COALESCE(NULLIF(BTRIM(d.video_id), ''), '') AS video_id,
    COALESCE(NULLIF(BTRIM(d.author_nickname), ''), '(未命名达人)') AS influencer_name,
    COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') AS influencer_id,
    COALESCE(NULLIF(BTRIM(d.product_id), ''), '') AS product_id,
    COALESCE(d.qianchuan_material_ids, '{}'::TEXT[]) AS qianchuan_material_ids,
    COALESCE(NULLIF(BTRIM(d.qianchuan_material_key), ''), '') AS qianchuan_material_key,
    COALESCE(d.qianchuan_material_count, 0)::INTEGER AS qianchuan_material_count,
    d.publish_time,
    d.qianchuan_material_created_at_max,
    CASE
      WHEN NULLIF(BTRIM(d.video_id), '') IS NOT NULL THEN 'video:' || NULLIF(BTRIM(d.video_id), '')
      ELSE NULL
    END AS metric_entity_key,
    CASE
      WHEN NULLIF(BTRIM(d.video_id), '') IS NOT NULL
        AND d.publish_time IS NOT NULL
        AND d.publish_time::DATE BETWEEN rs.start_date AND rs.end_date
      THEN TRUE
      ELSE FALSE
    END AS is_new_metric_entity,
    COALESCE(d.video_view_count, 0)::BIGINT AS video_view_count,
    COALESCE(d.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(d.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
    COALESCE(d.live_room_pay_amount, 0)::NUMERIC(18, 2) AS live_room_pay_amount,
    COALESCE(d.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS search_after_view_pay_amount,
    COALESCE(d.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shop_page_pay_amount,
    COALESCE(d.qianchuan_overall_cost, 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(d.qianchuan_overall_gmv, 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(d.qianchuan_net_gmv, 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    (
      COALESCE(d.qianchuan_overall_gmv, 0) > 0
      OR COALESCE(d.user_pay_amount, 0) > 0
    ) AS has_order_signal,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%'
        OR COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
      THEN '已合作挂车'
      ELSE '未分类'
    END AS cooperation_status_norm,
    CASE
      WHEN NULLIF(BTRIM(d.author_douyin_id), '') IS NOT NULL THEN 'matched_by_id'
      WHEN NULLIF(BTRIM(d.author_nickname), '') IS NOT NULL THEN 'matched_by_name'
      ELSE 'missing_influencer_id'
    END AS match_status
  FROM range_scope rs
  INNER JOIN ads.douyin_shortvideo_detail d
    ON d.stat_date BETWEEN rs.start_date AND rs.end_date
   AND (
     (
       d.detail_grain = 'trade_video_day'
       AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
       AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
     )
     OR (
       d.detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
       AND (
         COALESCE(array_length(d.qianchuan_material_ids, 1), 0) > 0
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
),
author_period AS (
  SELECT
    sd.period,
    sd.platform,
    COALESCE(NULLIF(sd.influencer_id, ''), NULLIF(sd.influencer_name, ''), '未知达人') AS influencer_key,
    NULLIF(sd.influencer_id, '') AS influencer_id,
    COALESCE(NULLIF(sd.influencer_name, ''), NULLIF(sd.influencer_id, ''), '未知达人') AS influencer_name,
    sd.account_type,
    sd.cooperation_status_norm,
    CASE
      WHEN MAX(sd.match_status) = 'matched_by_id' THEN 'matched_by_id'
      WHEN MAX(sd.match_status) = 'matched_by_name' THEN 'matched_by_name'
      ELSE 'missing_influencer_id'
    END AS match_status,
    COUNT(DISTINCT CASE
      WHEN NULLIF(sd.metric_entity_key, '') IS NULL THEN NULL
      ELSE CONCAT_WS(
        '||',
        sd.metric_entity_key,
        COALESCE(NULLIF(sd.influencer_id, ''), NULLIF(sd.influencer_name, ''), '未知达人')
      )
    END)::BIGINT AS shortvideo_count,
    0::BIGINT AS shortvideo_duration_minutes,
    COALESCE(SUM(sd.video_view_count), 0)::BIGINT AS shortvideo_view_count,
    0::BIGINT AS shortvideo_exposure_user_count,
    0::BIGINT AS shortvideo_product_click_user,
    0::BIGINT AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(SUM(sd.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(sd.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(SUM(sd.live_room_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(sd.search_after_view_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(sd.shop_page_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount
  FROM scoped_detail sd
  GROUP BY
    sd.period,
    sd.platform,
    COALESCE(NULLIF(sd.influencer_id, ''), NULLIF(sd.influencer_name, ''), '未知达人'),
    NULLIF(sd.influencer_id, ''),
    COALESCE(NULLIF(sd.influencer_name, ''), NULLIF(sd.influencer_id, ''), '未知达人'),
    sd.account_type,
    sd.cooperation_status_norm
),
period_totals AS (
  SELECT
    ap.period,
    COUNT(*) FILTER (WHERE ap.match_status IN ('matched_by_id', 'matched_by_name'))::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE ap.shortvideo_count > 0 OR ap.shortvideo_gmv > 0)::BIGINT AS matched_shortvideo_influencer_count,
    COALESCE(SUM(ap.shortvideo_count), 0)::BIGINT AS matched_shortvideo_count,
    COALESCE(SUM(ap.shortvideo_buyer_count), 0)::BIGINT AS matched_shortvideo_buyer_count,
    COALESCE(SUM(ap.shortvideo_gmv), 0)::NUMERIC(18, 2) AS matched_shortvideo_gmv,
    COUNT(*) FILTER (WHERE ap.shortvideo_count > 0 OR ap.shortvideo_gmv > 0)::BIGINT AS shortvideo_influencer_count,
    COALESCE(SUM(ap.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    COALESCE(SUM(ap.shortvideo_duration_minutes), 0)::BIGINT AS shortvideo_duration_minutes,
    COALESCE(SUM(ap.shortvideo_view_count), 0)::BIGINT AS shortvideo_view_count,
    COALESCE(SUM(ap.shortvideo_exposure_user_count), 0)::BIGINT AS shortvideo_exposure_user_count,
    COALESCE(SUM(ap.shortvideo_product_click_user), 0)::BIGINT AS shortvideo_product_click_user,
    COALESCE(SUM(ap.shortvideo_order_count), 0)::BIGINT AS shortvideo_order_count,
    COALESCE(SUM(ap.shortvideo_refund_order_count), 0)::BIGINT AS shortvideo_refund_order_count,
    COALESCE(SUM(ap.shortvideo_buyer_count), 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(ap.shortvideo_gmv), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(ap.shortvideo_user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(SUM(ap.shortvideo_refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(ap.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(SUM(ap.shortvideo_live_room_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(ap.shortvideo_search_after_view_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(ap.shortvideo_shop_page_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
    COUNT(*) FILTER (WHERE ap.influencer_id IS NOT NULL)::BIGINT AS with_id_count
  FROM author_period ap
  GROUP BY ap.period
),
metric_period_totals AS (
  SELECT
    sd.period,
    COUNT(DISTINCT sd.metric_entity_key)
      FILTER (WHERE NULLIF(sd.metric_entity_key, '') IS NOT NULL)::BIGINT AS metric_total_video_count,
    COUNT(DISTINCT sd.metric_entity_key)
      FILTER (
        WHERE NULLIF(sd.metric_entity_key, '') IS NOT NULL
          AND sd.is_new_metric_entity
      )::BIGINT AS metric_new_video_count,
    COUNT(DISTINCT sd.metric_entity_key)
      FILTER (
        WHERE NULLIF(sd.metric_entity_key, '') IS NOT NULL
          AND sd.has_order_signal
      )::BIGINT AS metric_ordered_video_count,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS cart_gmv,
    COALESCE(SUM(sd.user_pay_amount - sd.refund_amount), 0)::NUMERIC(18, 2) AS cart_gsv,
    COALESCE(SUM(sd.qianchuan_gmv), 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(SUM(sd.qianchuan_gsv), 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    COALESCE(SUM(sd.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS qianchuan_cost
  FROM scoped_detail sd
  GROUP BY sd.period
),
current_roster_totals AS (
  SELECT
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE ap.influencer_id IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE ap.influencer_id IS NULL)::BIGINT AS without_id_count,
    COUNT(DISTINCT ap.cooperation_status_norm)::BIGINT AS cooperation_status_count
  FROM author_period ap
  WHERE ap.period = 'current'
),
platform_current AS (
  SELECT
    ap.platform,
    COUNT(*) FILTER (WHERE ap.shortvideo_count > 0 OR ap.shortvideo_gmv > 0)::BIGINT AS shortvideo_influencer_count,
    COALESCE(SUM(ap.shortvideo_gmv), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(ap.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    COALESCE(SUM(ap.shortvideo_buyer_count), 0)::BIGINT AS shortvideo_buyer_count
  FROM author_period ap
  WHERE ap.period = 'current'
  GROUP BY ap.platform
),
platform_current_sorted AS (
  SELECT
    p.*,
    ROW_NUMBER() OVER (
      ORDER BY p.shortvideo_gmv DESC, p.shortvideo_count DESC, p.platform ASC
    ) AS sort_order
  FROM platform_current p
),
cooperation_status_current AS (
  SELECT
    ap.cooperation_status_norm,
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE ap.influencer_id IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE ap.match_status IN ('matched_by_id', 'matched_by_name'))::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE ap.shortvideo_count > 0 OR ap.shortvideo_gmv > 0)::BIGINT AS shortvideo_influencer_count,
    COALESCE(SUM(ap.shortvideo_count), 0)::BIGINT AS shortvideo_count,
    COALESCE(SUM(ap.shortvideo_buyer_count), 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(ap.shortvideo_gmv), 0)::NUMERIC(18, 2) AS shortvideo_gmv
  FROM author_period ap
  WHERE ap.period = 'current'
  GROUP BY ap.cooperation_status_norm
),
cooperation_status_current_sorted AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      ORDER BY c.shortvideo_gmv DESC, c.influencer_count DESC, c.cooperation_status_norm ASC
    ) AS sort_order
  FROM cooperation_status_current c
),
current_calendar AS (
  SELECT generate_series(p.current_start_date, p.current_end_date, INTERVAL '1 day')::DATE AS stat_date
  FROM params p
),
previous_calendar AS (
  SELECT generate_series(p.previous_start_date, p.previous_end_date, INTERVAL '1 day')::DATE AS stat_date
  FROM params p
),
series_agg AS (
  SELECT
    sd.period,
    sd.stat_date,
    COUNT(DISTINCT CASE
      WHEN NULLIF(sd.metric_entity_key, '') IS NULL THEN NULL
      ELSE CONCAT_WS(
        '||',
        sd.stat_date::TEXT,
        sd.metric_entity_key,
        COALESCE(NULLIF(sd.influencer_id, ''), NULLIF(sd.influencer_name, ''), '未知达人')
      )
    END)::BIGINT AS shortvideo_count,
    0::BIGINT AS shortvideo_duration_minutes,
    COALESCE(SUM(sd.video_view_count), 0)::BIGINT AS shortvideo_view_count,
    0::BIGINT AS shortvideo_exposure_user_count,
    0::BIGINT AS shortvideo_product_click_user,
    0::BIGINT AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(SUM(sd.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(sd.user_pay_amount - sd.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_gsv,
    COALESCE(SUM(sd.qianchuan_gmv), 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(SUM(sd.qianchuan_gsv), 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    COALESCE(SUM(sd.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(SUM(sd.live_room_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(sd.search_after_view_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(sd.shop_page_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount
  FROM scoped_detail sd
  GROUP BY sd.period, sd.stat_date
),
current_series AS (
  SELECT
    c.stat_date,
    COALESCE(s.shortvideo_count, 0)::BIGINT AS shortvideo_count,
    COALESCE(s.shortvideo_duration_minutes, 0)::BIGINT AS shortvideo_duration_minutes,
    COALESCE(s.shortvideo_view_count, 0)::BIGINT AS shortvideo_view_count,
    COALESCE(s.shortvideo_exposure_user_count, 0)::BIGINT AS shortvideo_exposure_user_count,
    COALESCE(s.shortvideo_product_click_user, 0)::BIGINT AS shortvideo_product_click_user,
    COALESCE(s.shortvideo_order_count, 0)::BIGINT AS shortvideo_order_count,
    COALESCE(s.shortvideo_refund_order_count, 0)::BIGINT AS shortvideo_refund_order_count,
    COALESCE(s.shortvideo_buyer_count, 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(s.shortvideo_gmv, 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(s.shortvideo_user_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(s.shortvideo_refund_amount, 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(s.shortvideo_gsv, 0)::NUMERIC(18, 2) AS shortvideo_gsv,
    COALESCE(s.qianchuan_gmv, 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(s.qianchuan_gsv, 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    COALESCE(s.shortvideo_ad_cost, 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(s.shortvideo_live_room_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(s.shortvideo_search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(s.shortvideo_shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount
  FROM current_calendar c
  LEFT JOIN series_agg s
    ON s.period = 'current'
   AND s.stat_date = c.stat_date
),
previous_series AS (
  SELECT
    c.stat_date,
    COALESCE(s.shortvideo_count, 0)::BIGINT AS shortvideo_count,
    COALESCE(s.shortvideo_duration_minutes, 0)::BIGINT AS shortvideo_duration_minutes,
    COALESCE(s.shortvideo_view_count, 0)::BIGINT AS shortvideo_view_count,
    COALESCE(s.shortvideo_exposure_user_count, 0)::BIGINT AS shortvideo_exposure_user_count,
    COALESCE(s.shortvideo_product_click_user, 0)::BIGINT AS shortvideo_product_click_user,
    COALESCE(s.shortvideo_order_count, 0)::BIGINT AS shortvideo_order_count,
    COALESCE(s.shortvideo_refund_order_count, 0)::BIGINT AS shortvideo_refund_order_count,
    COALESCE(s.shortvideo_buyer_count, 0)::BIGINT AS shortvideo_buyer_count,
    COALESCE(s.shortvideo_gmv, 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(s.shortvideo_user_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
    COALESCE(s.shortvideo_refund_amount, 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(s.shortvideo_gsv, 0)::NUMERIC(18, 2) AS shortvideo_gsv,
    COALESCE(s.qianchuan_gmv, 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(s.qianchuan_gsv, 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    COALESCE(s.shortvideo_ad_cost, 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
    COALESCE(s.shortvideo_live_room_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
    COALESCE(s.shortvideo_search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
    COALESCE(s.shortvideo_shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount
  FROM previous_calendar c
  LEFT JOIN series_agg s
    ON s.period = 'previous'
   AND s.stat_date = c.stat_date
),
current_series_contributors_raw AS (
  SELECT
    sd.stat_date,
    sd.platform,
    COALESCE(NULLIF(sd.influencer_name, ''), NULLIF(sd.influencer_id, ''), '未知达人') AS influencer_name,
    COALESCE(SUM(sd.qianchuan_gmv), 0)::NUMERIC(18, 2) AS qianchuan_gmv,
    COALESCE(SUM(sd.qianchuan_gsv), 0)::NUMERIC(18, 2) AS qianchuan_gsv,
    COALESCE(SUM(sd.shortvideo_ad_cost), 0)::NUMERIC(18, 2) AS qianchuan_cost,
    COALESCE(SUM(sd.user_pay_amount), 0)::NUMERIC(18, 2) AS shortvideo_gmv,
    COALESCE(SUM(sd.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
    COALESCE(SUM(sd.user_pay_amount - sd.refund_amount), 0)::NUMERIC(18, 2) AS shortvideo_gsv
  FROM scoped_detail sd
  WHERE sd.period = 'current'
  GROUP BY
    sd.stat_date,
    sd.platform,
    COALESCE(NULLIF(sd.influencer_name, ''), NULLIF(sd.influencer_id, ''), '未知达人')
),
current_series_contributors_ranked AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      PARTITION BY c.stat_date
      ORDER BY
        GREATEST(ABS(c.shortvideo_gmv), ABS(c.shortvideo_refund_amount), ABS(c.shortvideo_gsv)) DESC,
        c.qianchuan_gsv DESC,
        c.qianchuan_gmv DESC,
        c.shortvideo_gmv DESC,
        c.shortvideo_refund_amount DESC,
        c.shortvideo_gsv ASC,
        c.platform ASC,
        c.influencer_name ASC
    ) AS rank_no
  FROM current_series_contributors_raw c
  WHERE COALESCE(c.shortvideo_gmv, 0) <> 0
     OR COALESCE(c.shortvideo_refund_amount, 0) <> 0
     OR COALESCE(c.shortvideo_gsv, 0) <> 0
     OR COALESCE(c.qianchuan_gmv, 0) <> 0
     OR COALESCE(c.qianchuan_gsv, 0) <> 0
     OR COALESCE(c.qianchuan_cost, 0) <> 0
),
data_bounds AS (
  SELECT
    MIN(d.stat_date)::DATE AS min_date,
    MAX(d.stat_date)::DATE AS max_date
  FROM ads.douyin_shortvideo_detail d
  WHERE (
      d.detail_grain = 'trade_video_day'
      AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
      AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
    )
    OR (
      d.detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
      AND (
        COALESCE(array_length(d.qianchuan_material_ids, 1), 0) > 0
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
SELECT json_build_object(
  'startDate', (SELECT p.current_start_date::TEXT FROM params p),
  'endDate', (SELECT p.current_end_date::TEXT FROM params p),
  'prevStartDate', (SELECT p.previous_start_date::TEXT FROM params p),
  'prevEndDate', (SELECT p.previous_end_date::TEXT FROM params p),
  'dataDateBounds', json_build_object(
    'minDate', (SELECT d.min_date::TEXT FROM data_bounds d),
    'maxDate', (SELECT d.max_date::TEXT FROM data_bounds d)
  ),
  'rosterTotals', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        COALESCE(r.influencer_count, 0)::BIGINT AS influencer_count,
        COALESCE(r.with_id_count, 0)::BIGINT AS with_id_count,
        COALESCE(r.without_id_count, 0)::BIGINT AS without_id_count,
        COALESCE(r.cooperation_status_count, 0)::BIGINT AS cooperation_status_count
      FROM current_roster_totals r
    ) t
  ),
  'currentTotals', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        COALESCE(ct.matched_influencer_count, 0)::BIGINT AS matched_influencer_count,
        CASE
          WHEN COALESCE(ct.with_id_count, 0) > 0
            THEN ROUND((ct.matched_influencer_count::NUMERIC / ct.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        COALESCE(ct.matched_shortvideo_influencer_count, 0)::BIGINT AS matched_shortvideo_influencer_count,
        COALESCE(ct.matched_shortvideo_count, 0)::BIGINT AS matched_shortvideo_count,
        COALESCE(ct.matched_shortvideo_buyer_count, 0)::BIGINT AS matched_shortvideo_buyer_count,
        COALESCE(ct.matched_shortvideo_gmv, 0)::NUMERIC(18, 2) AS matched_shortvideo_gmv,
        COALESCE(ct.shortvideo_influencer_count, 0)::BIGINT AS shortvideo_influencer_count,
        COALESCE(ct.shortvideo_count, 0)::BIGINT AS shortvideo_count,
        COALESCE(ct.shortvideo_duration_minutes, 0)::BIGINT AS shortvideo_duration_minutes,
        COALESCE(ct.shortvideo_view_count, 0)::BIGINT AS shortvideo_view_count,
        COALESCE(ct.shortvideo_exposure_user_count, 0)::BIGINT AS shortvideo_exposure_user_count,
        COALESCE(ct.shortvideo_product_click_user, 0)::BIGINT AS shortvideo_product_click_user,
        COALESCE(ct.shortvideo_order_count, 0)::BIGINT AS shortvideo_order_count,
        COALESCE(ct.shortvideo_refund_order_count, 0)::BIGINT AS shortvideo_refund_order_count,
        COALESCE(ct.shortvideo_buyer_count, 0)::BIGINT AS shortvideo_buyer_count,
        COALESCE(ct.shortvideo_gmv, 0)::NUMERIC(18, 2) AS shortvideo_gmv,
        COALESCE(ct.shortvideo_user_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
        COALESCE(ct.shortvideo_refund_amount, 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
        COALESCE(ct.shortvideo_ad_cost, 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
        COALESCE(ct.shortvideo_live_room_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
        COALESCE(ct.shortvideo_search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
        COALESCE(ct.shortvideo_shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
        CASE
          WHEN COALESCE(ct.shortvideo_view_count, 0) > 0
            THEN ROUND((ct.shortvideo_order_count::NUMERIC / ct.shortvideo_view_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS watch_to_buyer_rate,
        CASE
          WHEN COALESCE(ct.shortvideo_count, 0) > 0
            THEN ROUND((ct.shortvideo_gmv / ct.shortvideo_count::NUMERIC), 2)
          ELSE NULL::NUMERIC(18, 2)
        END AS gmv_per_session
      FROM (SELECT 'current'::TEXT AS period) period_scope
      LEFT JOIN period_totals ct
        ON ct.period = period_scope.period
    ) t
  ),
  'previousTotals', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        COALESCE(pt.matched_influencer_count, 0)::BIGINT AS matched_influencer_count,
        CASE
          WHEN COALESCE(pt.with_id_count, 0) > 0
            THEN ROUND((pt.matched_influencer_count::NUMERIC / pt.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        COALESCE(pt.matched_shortvideo_influencer_count, 0)::BIGINT AS matched_shortvideo_influencer_count,
        COALESCE(pt.matched_shortvideo_count, 0)::BIGINT AS matched_shortvideo_count,
        COALESCE(pt.matched_shortvideo_buyer_count, 0)::BIGINT AS matched_shortvideo_buyer_count,
        COALESCE(pt.matched_shortvideo_gmv, 0)::NUMERIC(18, 2) AS matched_shortvideo_gmv,
        COALESCE(pt.shortvideo_influencer_count, 0)::BIGINT AS shortvideo_influencer_count,
        COALESCE(pt.shortvideo_count, 0)::BIGINT AS shortvideo_count,
        COALESCE(pt.shortvideo_duration_minutes, 0)::BIGINT AS shortvideo_duration_minutes,
        COALESCE(pt.shortvideo_view_count, 0)::BIGINT AS shortvideo_view_count,
        COALESCE(pt.shortvideo_exposure_user_count, 0)::BIGINT AS shortvideo_exposure_user_count,
        COALESCE(pt.shortvideo_product_click_user, 0)::BIGINT AS shortvideo_product_click_user,
        COALESCE(pt.shortvideo_order_count, 0)::BIGINT AS shortvideo_order_count,
        COALESCE(pt.shortvideo_refund_order_count, 0)::BIGINT AS shortvideo_refund_order_count,
        COALESCE(pt.shortvideo_buyer_count, 0)::BIGINT AS shortvideo_buyer_count,
        COALESCE(pt.shortvideo_gmv, 0)::NUMERIC(18, 2) AS shortvideo_gmv,
        COALESCE(pt.shortvideo_user_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
        COALESCE(pt.shortvideo_refund_amount, 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
        COALESCE(pt.shortvideo_ad_cost, 0)::NUMERIC(18, 2) AS shortvideo_ad_cost,
        COALESCE(pt.shortvideo_live_room_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
        COALESCE(pt.shortvideo_search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
        COALESCE(pt.shortvideo_shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
        CASE
          WHEN COALESCE(pt.shortvideo_view_count, 0) > 0
            THEN ROUND((pt.shortvideo_order_count::NUMERIC / pt.shortvideo_view_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS watch_to_buyer_rate,
        CASE
          WHEN COALESCE(pt.shortvideo_count, 0) > 0
            THEN ROUND((pt.shortvideo_gmv / pt.shortvideo_count::NUMERIC), 2)
          ELSE NULL::NUMERIC(18, 2)
        END AS gmv_per_session
      FROM (SELECT 'previous'::TEXT AS period) period_scope
      LEFT JOIN period_totals pt
        ON pt.period = period_scope.period
    ) t
  ),
  'currentSeries', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', s.stat_date::TEXT,
          'shortvideo_count', s.shortvideo_count,
          'shortvideo_duration_minutes', s.shortvideo_duration_minutes,
          'shortvideo_view_count', s.shortvideo_view_count,
          'shortvideo_exposure_user_count', s.shortvideo_exposure_user_count,
          'shortvideo_product_click_user', s.shortvideo_product_click_user,
          'shortvideo_order_count', s.shortvideo_order_count,
          'shortvideo_refund_order_count', s.shortvideo_refund_order_count,
          'shortvideo_buyer_count', s.shortvideo_buyer_count,
          'shortvideo_gmv', s.shortvideo_gmv,
          'shortvideo_user_pay_amount', s.shortvideo_user_pay_amount,
          'shortvideo_refund_amount', s.shortvideo_refund_amount,
          'shortvideo_ad_cost', s.shortvideo_ad_cost,
          'shortvideo_live_room_pay_amount', s.shortvideo_live_room_pay_amount,
          'shortvideo_search_after_view_pay_amount', s.shortvideo_search_after_view_pay_amount,
          'shortvideo_shop_page_pay_amount', s.shortvideo_shop_page_pay_amount,
          'watch_to_buyer_rate',
            CASE
              WHEN s.shortvideo_view_count > 0
                THEN ROUND((s.shortvideo_order_count::NUMERIC / s.shortvideo_view_count::NUMERIC), 6)
              ELSE NULL::NUMERIC(10, 6)
            END,
          'contributors', COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'platform', c.platform,
                  'influencer_name', c.influencer_name,
                  'shortvideo_gmv', c.shortvideo_gmv,
                  'shortvideo_refund_amount', c.shortvideo_refund_amount,
                  'shortvideo_gsv', c.shortvideo_gsv
                )
                ORDER BY c.rank_no
              )
              FROM current_series_contributors_ranked c
              WHERE c.stat_date = s.stat_date
                AND c.rank_no <= 8
            ),
            '[]'::JSON
          ),
          'contributor_count', (
            SELECT COUNT(*)
            FROM current_series_contributors_ranked c
            WHERE c.stat_date = s.stat_date
          )
        )
        ORDER BY s.stat_date
      )
      FROM current_series s
    ),
    '[]'::JSON
  ),
  'previousSeries', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', s.stat_date::TEXT,
          'shortvideo_count', s.shortvideo_count,
          'shortvideo_duration_minutes', s.shortvideo_duration_minutes,
          'shortvideo_view_count', s.shortvideo_view_count,
          'shortvideo_exposure_user_count', s.shortvideo_exposure_user_count,
          'shortvideo_product_click_user', s.shortvideo_product_click_user,
          'shortvideo_order_count', s.shortvideo_order_count,
          'shortvideo_refund_order_count', s.shortvideo_refund_order_count,
          'shortvideo_buyer_count', s.shortvideo_buyer_count,
          'shortvideo_gmv', s.shortvideo_gmv,
          'shortvideo_user_pay_amount', s.shortvideo_user_pay_amount,
          'shortvideo_refund_amount', s.shortvideo_refund_amount,
          'shortvideo_ad_cost', s.shortvideo_ad_cost,
          'shortvideo_live_room_pay_amount', s.shortvideo_live_room_pay_amount,
          'shortvideo_search_after_view_pay_amount', s.shortvideo_search_after_view_pay_amount,
          'shortvideo_shop_page_pay_amount', s.shortvideo_shop_page_pay_amount,
          'watch_to_buyer_rate',
            CASE
              WHEN s.shortvideo_view_count > 0
                THEN ROUND((s.shortvideo_order_count::NUMERIC / s.shortvideo_view_count::NUMERIC), 6)
              ELSE NULL::NUMERIC(10, 6)
            END
        )
        ORDER BY s.stat_date
      )
      FROM previous_series s
    ),
    '[]'::JSON
  ),
  'platformCurrent', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'platform', p.platform,
          'shortvideo_influencer_count', p.shortvideo_influencer_count,
          'shortvideo_gmv', p.shortvideo_gmv,
          'shortvideo_count', p.shortvideo_count,
          'shortvideo_buyer_count', p.shortvideo_buyer_count
        )
        ORDER BY p.sort_order
      )
      FROM platform_current_sorted p
    ),
    '[]'::JSON
  ),
  'cooperationStatusCurrent', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'cooperation_status', c.cooperation_status_norm,
          'influencer_count', c.influencer_count,
          'with_id_count', c.with_id_count,
          'matched_influencer_count', c.matched_influencer_count,
          'shortvideo_influencer_count', c.shortvideo_influencer_count,
          'shortvideo_count', c.shortvideo_count,
          'shortvideo_buyer_count', c.shortvideo_buyer_count,
          'shortvideo_gmv', c.shortvideo_gmv
        )
        ORDER BY c.sort_order
      )
      FROM cooperation_status_current_sorted c
    ),
    '[]'::JSON
  )
)::TEXT;
