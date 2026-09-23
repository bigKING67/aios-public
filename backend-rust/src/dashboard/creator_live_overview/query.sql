
WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS current_start_date,
    __END_DATE_LITERAL__::DATE AS current_end_date,
    __PREV_START_DATE_LITERAL__::DATE AS previous_start_date,
    __PREV_END_DATE_LITERAL__::DATE AS previous_end_date
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
    COALESCE(NULLIF(BTRIM(r.cooperation_status_norm), ''), '未分类') AS cooperation_status_norm,
    NULLIF(BTRIM(r.platform), '') AS platform
  FROM ads.influencer_live_roster r
),
roster_totals AS (
  SELECT
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NULL)::BIGINT AS without_id_count,
    COUNT(DISTINCT r.cooperation_status_norm)::BIGINT AS cooperation_status_count
  FROM roster r
),
current_trade AS (
  SELECT
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音') AS platform_key,
    NULLIF(BTRIM(t.influencer_id), '') AS anchor_id_key,
    MAX(t.influencer_id) AS influencer_id,
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
  WHERE t.stat_date BETWEEN p.current_start_date AND p.current_end_date
    AND NULLIF(BTRIM(t.influencer_id), '') IS NOT NULL
  GROUP BY
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音'),
    NULLIF(BTRIM(t.influencer_id), '')
),
previous_trade AS (
  SELECT
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音') AS platform_key,
    NULLIF(BTRIM(t.influencer_id), '') AS anchor_id_key,
    MAX(t.influencer_id) AS influencer_id,
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
  WHERE t.stat_date BETWEEN p.previous_start_date AND p.previous_end_date
    AND NULLIF(BTRIM(t.influencer_id), '') IS NOT NULL
  GROUP BY
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音'),
    NULLIF(BTRIM(t.influencer_id), '')
),
current_roster_enriched AS (
  SELECT
    r.id,
    r.anchor_id_key,
    r.platform_key,
    r.cooperation_status_norm,
    ct.influencer_id,
    ct.anchor_id_key AS matched_anchor_id_key,
    COALESCE(ct.live_session_count, 0)::BIGINT AS live_session_count,
    COALESCE(ct.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
    COALESCE(ct.live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
    COALESCE(ct.live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
    COALESCE(ct.live_product_click_user, 0)::BIGINT AS live_product_click_user,
    COALESCE(ct.live_order_count, 0)::BIGINT AS live_order_count,
    COALESCE(ct.live_refund_order_count, 0)::BIGINT AS live_refund_order_count,
    COALESCE(ct.live_buyer_count, 0)::BIGINT AS live_buyer_count,
    COALESCE(ct.live_gmv, 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(ct.live_user_pay_amount, 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(ct.live_refund_amount, 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(ct.live_ad_cost, 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM roster r
  LEFT JOIN current_trade ct
    ON ct.platform_key = r.platform_key
   AND ct.anchor_id_key = r.anchor_id_key
),
previous_roster_enriched AS (
  SELECT
    r.id,
    r.anchor_id_key,
    r.platform_key,
    pt.influencer_id,
    pt.anchor_id_key AS matched_anchor_id_key,
    COALESCE(pt.live_session_count, 0)::BIGINT AS live_session_count,
    COALESCE(pt.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
    COALESCE(pt.live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
    COALESCE(pt.live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
    COALESCE(pt.live_product_click_user, 0)::BIGINT AS live_product_click_user,
    COALESCE(pt.live_order_count, 0)::BIGINT AS live_order_count,
    COALESCE(pt.live_refund_order_count, 0)::BIGINT AS live_refund_order_count,
    COALESCE(pt.live_buyer_count, 0)::BIGINT AS live_buyer_count,
    COALESCE(pt.live_gmv, 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(pt.live_user_pay_amount, 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(pt.live_refund_amount, 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(pt.live_ad_cost, 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM roster r
  LEFT JOIN previous_trade pt
    ON pt.platform_key = r.platform_key
   AND pt.anchor_id_key = r.anchor_id_key
),
current_match_totals AS (
  SELECT
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NOT NULL AND r.matched_anchor_id_key IS NOT NULL)::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (
      WHERE COALESCE(r.live_session_count, 0) > 0
         OR COALESCE(r.live_gmv, 0) > 0
         OR COALESCE(r.live_buyer_count, 0) > 0
    )::BIGINT AS live_influencer_count,
    COALESCE(SUM(r.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(r.live_duration_minutes), 0)::BIGINT AS live_duration_minutes,
    COALESCE(SUM(r.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
    COALESCE(SUM(r.live_exposure_user_count), 0)::BIGINT AS live_exposure_user_count,
    COALESCE(SUM(r.live_product_click_user), 0)::BIGINT AS live_product_click_user,
    COALESCE(SUM(r.live_order_count), 0)::BIGINT AS live_order_count,
    COALESCE(SUM(r.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
    COALESCE(SUM(r.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(r.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(r.live_user_pay_amount), 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(SUM(r.live_refund_amount), 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(SUM(r.live_ad_cost), 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM current_roster_enriched r
),
previous_match_totals AS (
  SELECT
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NOT NULL AND r.matched_anchor_id_key IS NOT NULL)::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (
      WHERE COALESCE(r.live_session_count, 0) > 0
         OR COALESCE(r.live_gmv, 0) > 0
         OR COALESCE(r.live_buyer_count, 0) > 0
    )::BIGINT AS live_influencer_count,
    COALESCE(SUM(r.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(r.live_duration_minutes), 0)::BIGINT AS live_duration_minutes,
    COALESCE(SUM(r.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
    COALESCE(SUM(r.live_exposure_user_count), 0)::BIGINT AS live_exposure_user_count,
    COALESCE(SUM(r.live_product_click_user), 0)::BIGINT AS live_product_click_user,
    COALESCE(SUM(r.live_order_count), 0)::BIGINT AS live_order_count,
    COALESCE(SUM(r.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
    COALESCE(SUM(r.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(r.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(r.live_user_pay_amount), 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(SUM(r.live_refund_amount), 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(SUM(r.live_ad_cost), 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM previous_roster_enriched r
),
roster_identity_map AS (
  SELECT
    r.platform_key,
    r.anchor_id_key,
    COALESCE(
      NULLIF(MAX(BTRIM(r.influencer_name)), ''),
      NULLIF(MAX(BTRIM(r.influencer_id)), ''),
      '未知达人'
    ) AS influencer_name,
    COALESCE(NULLIF(MAX(BTRIM(r.platform)), ''), MAX(r.platform_key), '未归属') AS platform
  FROM roster r
  WHERE r.anchor_id_key IS NOT NULL
  GROUP BY r.platform_key, r.anchor_id_key
),
platform_current AS (
  SELECT
    ct.platform_key AS platform,
    COUNT(DISTINCT ct.anchor_id_key)::BIGINT AS live_influencer_count,
    COALESCE(SUM(ct.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(ct.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(ct.live_buyer_count), 0)::BIGINT AS live_buyer_count
  FROM current_trade ct
  INNER JOIN roster_identity_map rim
    ON rim.platform_key = ct.platform_key
   AND rim.anchor_id_key = ct.anchor_id_key
  GROUP BY ct.platform_key
),
platform_current_sorted AS (
  SELECT
    p.*,
    ROW_NUMBER() OVER (
      ORDER BY p.live_gmv DESC, p.live_influencer_count DESC, p.platform ASC
    ) AS sort_order
  FROM platform_current p
),
cooperation_status_current AS (
  SELECT
    r.cooperation_status_norm,
    COUNT(*)::BIGINT AS influencer_count,
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NOT NULL)::BIGINT AS with_id_count,
    COUNT(*) FILTER (WHERE r.anchor_id_key IS NOT NULL AND r.matched_anchor_id_key IS NOT NULL)::BIGINT AS matched_influencer_count,
    COUNT(*) FILTER (
      WHERE COALESCE(r.live_session_count, 0) > 0
         OR COALESCE(r.live_gmv, 0) > 0
         OR COALESCE(r.live_buyer_count, 0) > 0
    )::BIGINT AS live_influencer_count,
    COALESCE(SUM(r.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(r.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(r.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv
  FROM current_roster_enriched r
  GROUP BY r.cooperation_status_norm
),
cooperation_status_current_sorted AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      ORDER BY c.live_gmv DESC, c.influencer_count DESC, c.cooperation_status_norm ASC
    ) AS sort_order
  FROM cooperation_status_current c
),
current_calendar AS (
  SELECT
    generate_series(p.current_start_date, p.current_end_date, INTERVAL '1 day')::DATE AS stat_date
  FROM params p
),
previous_calendar AS (
  SELECT
    generate_series(p.previous_start_date, p.previous_end_date, INTERVAL '1 day')::DATE AS stat_date
  FROM params p
),
current_series AS (
  SELECT
    c.stat_date,
    COALESCE(SUM(t.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(t.live_duration_minutes), 0)::BIGINT AS live_duration_minutes,
    COALESCE(SUM(t.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
    COALESCE(SUM(t.live_exposure_user_count), 0)::BIGINT AS live_exposure_user_count,
    COALESCE(SUM(t.live_product_click_user), 0)::BIGINT AS live_product_click_user,
    COALESCE(SUM(t.live_order_count), 0)::BIGINT AS live_order_count,
    COALESCE(SUM(t.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
    COALESCE(SUM(t.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(t.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(t.live_user_pay_amount), 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(SUM(t.live_refund_amount), 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(SUM(t.live_ad_cost), 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM current_calendar c
  LEFT JOIN ads.influencer_live_detail t
    ON t.stat_date = c.stat_date
   AND EXISTS (
     SELECT 1
     FROM roster_identity_map rim
     WHERE rim.platform_key = COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音')
       AND rim.anchor_id_key = NULLIF(BTRIM(t.influencer_id), '')
   )
  GROUP BY c.stat_date
),
previous_series AS (
  SELECT
    c.stat_date,
    COALESCE(SUM(t.live_session_count), 0)::BIGINT AS live_session_count,
    COALESCE(SUM(t.live_duration_minutes), 0)::BIGINT AS live_duration_minutes,
    COALESCE(SUM(t.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
    COALESCE(SUM(t.live_exposure_user_count), 0)::BIGINT AS live_exposure_user_count,
    COALESCE(SUM(t.live_product_click_user), 0)::BIGINT AS live_product_click_user,
    COALESCE(SUM(t.live_order_count), 0)::BIGINT AS live_order_count,
    COALESCE(SUM(t.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
    COALESCE(SUM(t.live_buyer_count), 0)::BIGINT AS live_buyer_count,
    COALESCE(SUM(t.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(t.live_user_pay_amount), 0)::NUMERIC(18, 2) AS live_user_pay_amount,
    COALESCE(SUM(t.live_refund_amount), 0)::NUMERIC(18, 2) AS live_refund_amount,
    COALESCE(SUM(t.live_ad_cost), 0)::NUMERIC(18, 2) AS live_ad_cost
  FROM previous_calendar c
  LEFT JOIN ads.influencer_live_detail t
    ON t.stat_date = c.stat_date
   AND EXISTS (
     SELECT 1
     FROM roster_identity_map rim
     WHERE rim.platform_key = COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音')
       AND rim.anchor_id_key = NULLIF(BTRIM(t.influencer_id), '')
   )
  GROUP BY c.stat_date
),
current_series_contributors_raw AS (
  SELECT
    t.stat_date,
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音') AS platform,
    COALESCE(
      NULLIF(BTRIM(rim.influencer_name), ''),
      NULLIF(BTRIM(t.influencer_nickname), ''),
      NULLIF(BTRIM(t.influencer_id), ''),
      '未知达人'
    ) AS influencer_name,
    COALESCE(SUM(t.live_gmv), 0)::NUMERIC(18, 2) AS live_gmv,
    COALESCE(SUM(COALESCE(t.live_gmv, 0) - COALESCE(t.live_refund_amount, 0)), 0)::NUMERIC(18, 2) AS live_gsv
  FROM ads.influencer_live_detail t
  CROSS JOIN params p
  INNER JOIN roster_identity_map rim
    ON rim.platform_key = COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音')
   AND rim.anchor_id_key = NULLIF(BTRIM(t.influencer_id), '')
  WHERE t.stat_date BETWEEN p.current_start_date AND p.current_end_date
  GROUP BY
    t.stat_date,
    COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音'),
    COALESCE(
      NULLIF(BTRIM(rim.influencer_name), ''),
      NULLIF(BTRIM(t.influencer_nickname), ''),
      NULLIF(BTRIM(t.influencer_id), ''),
      '未知达人'
    )
),
current_series_contributors_ranked AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (
      PARTITION BY c.stat_date
      ORDER BY GREATEST(c.live_gmv, c.live_gsv) DESC, c.live_gmv DESC, c.live_gsv DESC, c.platform ASC, c.influencer_name ASC
    ) AS rank_no
  FROM current_series_contributors_raw c
  WHERE COALESCE(c.live_gmv, 0) > 0
     OR COALESCE(c.live_gsv, 0) > 0
),
data_bounds AS (
  SELECT
    MIN(t.stat_date)::DATE AS min_date,
    MAX(t.stat_date)::DATE AS max_date
  FROM ads.influencer_live_detail t
  INNER JOIN roster_identity_map rim
    ON rim.platform_key = COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音')
   AND rim.anchor_id_key = NULLIF(BTRIM(t.influencer_id), '')
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
        r.influencer_count,
        r.with_id_count,
        r.without_id_count,
        r.cooperation_status_count
      FROM roster_totals r
    ) t
  ),
  'currentTotals', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        cm.matched_influencer_count,
        CASE
          WHEN rt.with_id_count > 0
            THEN ROUND((cm.matched_influencer_count::NUMERIC / rt.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        cm.live_influencer_count AS matched_live_influencer_count,
        cm.live_session_count AS matched_live_session_count,
        cm.live_buyer_count AS matched_live_buyer_count,
        cm.live_gmv AS matched_live_gmv,
        cm.live_influencer_count,
        cm.live_session_count,
        cm.live_duration_minutes,
        cm.live_watch_user_count,
        cm.live_exposure_user_count,
        cm.live_product_click_user,
        cm.live_order_count,
        cm.live_refund_order_count,
        cm.live_buyer_count,
        cm.live_gmv,
        cm.live_user_pay_amount,
        cm.live_refund_amount,
        cm.live_ad_cost,
        CASE
          WHEN cm.live_watch_user_count > 0
            THEN ROUND((cm.live_buyer_count::NUMERIC / cm.live_watch_user_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS watch_to_buyer_rate,
        CASE
          WHEN cm.live_session_count > 0
            THEN ROUND((cm.live_gmv / cm.live_session_count::NUMERIC), 2)
          ELSE NULL::NUMERIC(18, 2)
        END AS gmv_per_session
      FROM roster_totals rt
      CROSS JOIN current_match_totals cm
    ) t
  ),
  'previousTotals', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        pm.matched_influencer_count,
        CASE
          WHEN rt.with_id_count > 0
            THEN ROUND((pm.matched_influencer_count::NUMERIC / rt.with_id_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS matched_coverage_rate,
        pm.live_influencer_count AS matched_live_influencer_count,
        pm.live_session_count AS matched_live_session_count,
        pm.live_buyer_count AS matched_live_buyer_count,
        pm.live_gmv AS matched_live_gmv,
        pm.live_influencer_count,
        pm.live_session_count,
        pm.live_duration_minutes,
        pm.live_watch_user_count,
        pm.live_exposure_user_count,
        pm.live_product_click_user,
        pm.live_order_count,
        pm.live_refund_order_count,
        pm.live_buyer_count,
        pm.live_gmv,
        pm.live_user_pay_amount,
        pm.live_refund_amount,
        pm.live_ad_cost,
        CASE
          WHEN pm.live_watch_user_count > 0
            THEN ROUND((pm.live_buyer_count::NUMERIC / pm.live_watch_user_count::NUMERIC), 6)
          ELSE NULL::NUMERIC(10, 6)
        END AS watch_to_buyer_rate,
        CASE
          WHEN pm.live_session_count > 0
            THEN ROUND((pm.live_gmv / pm.live_session_count::NUMERIC), 2)
          ELSE NULL::NUMERIC(18, 2)
        END AS gmv_per_session
      FROM roster_totals rt
      CROSS JOIN previous_match_totals pm
    ) t
  ),
  'currentSeries', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', s.stat_date::TEXT,
          'live_session_count', s.live_session_count,
          'live_duration_minutes', s.live_duration_minutes,
          'live_watch_user_count', s.live_watch_user_count,
          'live_exposure_user_count', s.live_exposure_user_count,
          'live_product_click_user', s.live_product_click_user,
          'live_order_count', s.live_order_count,
          'live_refund_order_count', s.live_refund_order_count,
          'live_buyer_count', s.live_buyer_count,
          'live_gmv', s.live_gmv,
          'live_user_pay_amount', s.live_user_pay_amount,
          'live_refund_amount', s.live_refund_amount,
          'live_ad_cost', s.live_ad_cost,
          'watch_to_buyer_rate',
            CASE
                  WHEN s.live_watch_user_count > 0
                    THEN ROUND((s.live_buyer_count::NUMERIC / s.live_watch_user_count::NUMERIC), 6)
                  ELSE NULL::NUMERIC(10, 6)
                END,
              'contributors', COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'platform', c.platform,
                      'influencer_name', c.influencer_name,
                      'live_gmv', c.live_gmv,
                      'live_gsv', c.live_gsv
                    )
                    ORDER BY c.rank_no
                  )
                  FROM current_series_contributors_ranked c
                  WHERE c.stat_date = s.stat_date
                    AND c.rank_no <= 12
                ),
                '[]'::JSON
              ),
              'contributor_count', (
                SELECT COUNT(*)::BIGINT
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
          'live_session_count', s.live_session_count,
          'live_duration_minutes', s.live_duration_minutes,
          'live_watch_user_count', s.live_watch_user_count,
          'live_exposure_user_count', s.live_exposure_user_count,
          'live_product_click_user', s.live_product_click_user,
          'live_order_count', s.live_order_count,
          'live_refund_order_count', s.live_refund_order_count,
          'live_buyer_count', s.live_buyer_count,
          'live_gmv', s.live_gmv,
          'live_user_pay_amount', s.live_user_pay_amount,
          'live_refund_amount', s.live_refund_amount,
          'live_ad_cost', s.live_ad_cost,
          'watch_to_buyer_rate',
            CASE
              WHEN s.live_watch_user_count > 0
                THEN ROUND((s.live_buyer_count::NUMERIC / s.live_watch_user_count::NUMERIC), 6)
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
          'live_influencer_count', p.live_influencer_count,
          'live_gmv', p.live_gmv,
          'live_session_count', p.live_session_count,
          'live_buyer_count', p.live_buyer_count
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
          'live_influencer_count', c.live_influencer_count,
          'live_session_count', c.live_session_count,
          'live_buyer_count', c.live_buyer_count,
          'live_gmv', c.live_gmv
        )
        ORDER BY c.sort_order
      )
      FROM cooperation_status_current_sorted c
    ),
    '[]'::JSON
  )
)::TEXT;
