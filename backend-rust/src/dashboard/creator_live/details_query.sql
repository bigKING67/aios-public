
WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS start_date,
    __END_DATE_LITERAL__::DATE AS end_date,
    __COOPERATION_STATUS_LITERAL__::TEXT AS cooperation_status_filter,
    __KEYWORD_LITERAL__::TEXT AS keyword_filter
),
roster AS (
  SELECT
    r.id,
    r.sequence_no,
    r.influencer_name,
    r.influencer_id,
    NULLIF(BTRIM(r.influencer_id), '') AS anchor_id_key,
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
    r.anchor_desc,
    r.anchor_level,
    r.platform,
    r.main_platform_fans,
    r.sales_30d,
    r.sales_90d,
    r.cooperation_status,
    COALESCE(NULLIF(BTRIM(r.cooperation_status_norm), ''), '未分类') AS cooperation_status_norm,
    r.cooperation_desc,
    r.owner_name,
    r.source_file_name,
    r.source_etl_loaded_at::TEXT AS source_etl_loaded_at
  FROM ads.influencer_live_roster r
  CROSS JOIN params p
  WHERE p.cooperation_status_filter IS NULL
     OR COALESCE(NULLIF(BTRIM(r.cooperation_status_norm), ''), '未分类') = p.cooperation_status_filter
),
trade AS (
  SELECT
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音') AS platform_key,
    NULLIF(BTRIM(t.influencer_id), '') AS anchor_id_key,
    MAX(t.influencer_id) AS influencer_id,
    MAX(NULLIF(BTRIM(t.influencer_nickname), '')) AS influencer_nickname,
    MAX(NULLIF(BTRIM(t.shop_id), '')) AS shop_id,
    MAX(NULLIF(BTRIM(t.shop_name), '')) AS shop_name,
    SUM(COALESCE(t.live_session_count, 0))::BIGINT AS live_session_count,
    SUM(COALESCE(t.live_duration_minutes, 0))::BIGINT AS live_duration_minutes,
    SUM(COALESCE(t.live_watch_user_count, 0))::BIGINT AS live_watch_user_count,
    SUM(COALESCE(t.live_exposure_user_count, 0))::BIGINT AS live_exposure_user_count,
    SUM(COALESCE(t.live_product_click_user, 0))::BIGINT AS live_product_click_user,
    SUM(COALESCE(t.live_order_count, 0))::BIGINT AS live_order_count,
    SUM(COALESCE(t.live_refund_order_count, 0))::BIGINT AS live_refund_order_count,
    SUM(COALESCE(t.live_buyer_count, 0))::BIGINT AS live_buyer_count,
    SUM(COALESCE(t.live_gmv, 0))::NUMERIC(18, 2) AS live_gmv,
    SUM(COALESCE(t.live_user_pay_amount, 0))::NUMERIC(18, 2) AS live_user_pay_amount,
    SUM(COALESCE(t.live_refund_amount, 0))::NUMERIC(18, 2) AS live_refund_amount,
    SUM(COALESCE(t.live_ad_cost, 0))::NUMERIC(18, 2) AS live_ad_cost
  FROM ads.influencer_live_detail t
  CROSS JOIN params p
  WHERE t.stat_date BETWEEN p.start_date AND p.end_date
    AND NULLIF(BTRIM(t.influencer_id), '') IS NOT NULL
  GROUP BY
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音'),
    NULLIF(BTRIM(t.influencer_id), '')
),
joined_rows AS (
  SELECT
    r.id,
    r.sequence_no,
    r.influencer_name,
    COALESCE(NULLIF(BTRIM(r.influencer_id), ''), t.influencer_id) AS influencer_id,
    r.anchor_id_key,
    r.platform_key,
    r.anchor_desc,
    r.anchor_level,
    COALESCE(NULLIF(BTRIM(r.platform), ''), t.platform_key) AS platform,
    r.main_platform_fans,
    r.sales_30d,
    r.sales_90d,
    r.cooperation_status,
    r.cooperation_status_norm,
    r.cooperation_desc,
    r.owner_name,
    r.source_file_name,
    r.source_etl_loaded_at,
    t.platform_key AS matched_platform_key,
    t.anchor_id_key AS matched_anchor_id_key,
    t.influencer_nickname,
    t.shop_id,
    t.shop_name,
    COALESCE(t.live_session_count, 0)::BIGINT AS live_session_count,
    COALESCE(t.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
    COALESCE(t.live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
    COALESCE(t.live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
    COALESCE(t.live_product_click_user, 0)::BIGINT AS live_product_click_user,
    COALESCE(t.live_order_count, 0)::BIGINT AS live_order_count,
    COALESCE(t.live_refund_order_count, 0)::BIGINT AS live_refund_order_count,
    COALESCE(t.live_buyer_count, 0)::BIGINT AS live_buyer_count,
    COALESCE(t.live_gmv, 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(t.live_user_pay_amount, 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(t.live_refund_amount, 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(t.live_ad_cost, 0)::NUMERIC(18, 2) AS live_ad_cost,
    CASE
      WHEN r.anchor_id_key IS NULL THEN 'missing_influencer_id'
      WHEN t.anchor_id_key IS NULL THEN 'unmatched'
      ELSE 'matched'
    END AS match_status,
    (t.anchor_id_key IS NOT NULL) AS is_matched,
    CASE
      WHEN COALESCE(t.live_session_count, 0) > 0
        OR COALESCE(t.live_gmv, 0) > 0
        OR COALESCE(t.live_buyer_count, 0) > 0
      THEN TRUE
      ELSE FALSE
    END AS has_live_data
  FROM roster r
  LEFT JOIN trade t
    ON t.platform_key = r.platform_key
   AND t.anchor_id_key = r.anchor_id_key
),
filtered_rows AS (
  SELECT
    j.*
  FROM joined_rows j
  CROSS JOIN params p
  WHERE p.keyword_filter IS NULL
     OR (
       j.influencer_name ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.influencer_id, '') ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.anchor_desc, '') ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.owner_name, '') ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.cooperation_desc, '') ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.influencer_nickname, '') ILIKE ('%' || p.keyword_filter || '%')
       OR COALESCE(j.shop_name, '') ILIKE ('%' || p.keyword_filter || '%')
     )
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE f.anchor_id_key IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE f.is_matched)::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE f.has_live_data)::BIGINT AS live_influencer_count,
    COALESCE(SUM(f.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(f.live_duration_minutes), 0)::BIGINT AS live_duration_minutes,
    COALESCE(SUM(f.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
    COALESCE(SUM(f.live_exposure_user_count), 0)::BIGINT AS live_exposure_user_count,
    COALESCE(SUM(f.live_product_click_user), 0)::BIGINT AS live_product_click_user,
    COALESCE(SUM(f.live_order_count), 0)::BIGINT AS live_order_count,
    COALESCE(SUM(f.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
    COALESCE(SUM(f.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(f.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(f.live_user_pay_amount), 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(SUM(f.live_refund_amount), 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(SUM(f.live_ad_cost), 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM filtered_rows f
),
status_summary AS (
  SELECT
    f.cooperation_status_norm,
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE f.anchor_id_key IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE f.is_matched)::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (WHERE f.has_live_data)::BIGINT AS live_influencer_count,
    COALESCE(SUM(f.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(f.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(f.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv
  FROM filtered_rows f
  GROUP BY f.cooperation_status_norm
),
status_summary_sorted AS (
  SELECT
    s.*,
    ROW_NUMBER() OVER (
      ORDER BY s.live_gmv DESC, s.influencer_count DESC, s.cooperation_status_norm ASC
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
        s.live_influencer_count,
        s.live_session_count,
        s.live_duration_minutes,
        s.live_watch_user_count,
        s.live_exposure_user_count,
        s.live_product_click_user,
        s.live_order_count,
        s.live_refund_order_count,
        s.live_buyer_count,
        s.live_gmv,
        s.live_user_pay_amount,
        s.live_refund_amount,
        s.live_ad_cost,
        CASE
          WHEN s.with_id_count > 0
            THEN ROUND((s.matched_influencer_count::NUMERIC / s.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        CASE
          WHEN s.live_watch_user_count > 0
            THEN ROUND((s.live_buyer_count::NUMERIC / s.live_watch_user_count::NUMERIC), 6)
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
          'live_influencer_count', s.live_influencer_count,
          'live_session_count', s.live_session_count,
          'live_buyer_count', s.live_buyer_count,
          'live_gmv', s.live_gmv
        )
        ORDER BY s.sort_order
      )
      FROM status_summary_sorted s
    ),
    '[]'::JSON
  ),
  'rows', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', f.id,
          'sequence_no', f.sequence_no,
          'influencer_name', f.influencer_name,
          'influencer_id', f.influencer_id,
          'anchor_desc', f.anchor_desc,
          'anchor_level', f.anchor_level,
          'platform', f.platform,
          'main_platform_fans', f.main_platform_fans,
          'sales_30d', f.sales_30d,
          'sales_90d', f.sales_90d,
          'cooperation_status', f.cooperation_status,
          'cooperation_status_norm', f.cooperation_status_norm,
          'cooperation_desc', f.cooperation_desc,
          'owner_name', f.owner_name,
          'source_file_name', f.source_file_name,
          'source_etl_loaded_at', f.source_etl_loaded_at,
          'influencer_nickname', f.influencer_nickname,
          'shop_id', f.shop_id,
          'shop_name', f.shop_name,
          'live_session_count', f.live_session_count,
          'live_duration_minutes', f.live_duration_minutes,
          'live_watch_user_count', f.live_watch_user_count,
          'live_exposure_user_count', f.live_exposure_user_count,
          'live_product_click_user', f.live_product_click_user,
          'live_order_count', f.live_order_count,
          'live_refund_order_count', f.live_refund_order_count,
          'live_buyer_count', f.live_buyer_count,
          'live_gmv', f.live_gmv,
          'live_user_pay_amount', f.live_user_pay_amount,
          'live_refund_amount', f.live_refund_amount,
          'live_ad_cost', f.live_ad_cost,
          'watch_to_buyer_rate',
            CASE
              WHEN f.live_watch_user_count > 0
                THEN ROUND((f.live_buyer_count::NUMERIC / f.live_watch_user_count::NUMERIC), 6)
              ELSE NULL::NUMERIC(10, 6)
            END,
          'refund_rate',
            CASE
              WHEN f.live_gmv > 0
                THEN ROUND((f.live_refund_amount::NUMERIC / f.live_gmv::NUMERIC), 6)
              ELSE NULL::NUMERIC(10, 6)
            END,
          'match_status', f.match_status,
          'is_matched', f.is_matched,
          'has_live_data', f.has_live_data
        )
        ORDER BY
          f.cooperation_status_norm ASC,
          f.has_live_data DESC,
          f.live_gmv DESC,
          f.sequence_no NULLS LAST,
          f.id
      )
      FROM filtered_rows f
    ),
    '[]'::JSON
  )
)::TEXT;
