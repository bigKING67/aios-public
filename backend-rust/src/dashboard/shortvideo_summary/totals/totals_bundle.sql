WITH scope AS (
  SELECT 'overviewCurrent'::TEXT AS bucket, $1::DATE AS start_date, $2::DATE AS end_date, NULL::TEXT AS identity
  UNION ALL
  SELECT 'overviewPrevious'::TEXT, $3::DATE, $4::DATE, NULL::TEXT
  UNION ALL
  SELECT 'selfCurrent'::TEXT, $1::DATE, $2::DATE, 'self'::TEXT
  UNION ALL
  SELECT 'selfPrevious'::TEXT, $3::DATE, $4::DATE, 'self'::TEXT
  UNION ALL
  SELECT 'cooperationCurrent'::TEXT, $1::DATE, $2::DATE, 'cooperation'::TEXT
  UNION ALL
  SELECT 'cooperationPrevious'::TEXT, $3::DATE, $4::DATE, 'cooperation'::TEXT
),
scoped_detail AS (
  SELECT
    d.*,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%' THEN 'self'
      WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%' THEN 'cooperation'
      ELSE 'unclassified'
    END AS shortvideo_identity_type
  FROM ads.douyin_shortvideo_detail d
  WHERE d.detail_grain = 'trade_video_day'
),
bucket_agg AS (
  SELECT
    sc.bucket,
    COUNT(DISTINCT CASE
      WHEN NULLIF(BTRIM(sd.video_id), '') IS NULL THEN NULL
      ELSE CONCAT_WS(
        '||',
        sd.stat_date::TEXT,
        BTRIM(sd.video_id),
        COALESCE(NULLIF(BTRIM(sd.author_douyin_id), ''), '(空达人)')
      )
    END)::BIGINT AS shortvideo_count,
    COALESCE(SUM(sd.video_view_count), 0)::BIGINT AS video_view_count,
    COALESCE(SUM(sd.user_pay_amount), 0)::DOUBLE PRECISION AS shortvideo_gmv,
    COALESCE(SUM(sd.user_pay_amount), 0)::DOUBLE PRECISION AS shortvideo_user_pay_amount,
    COALESCE(SUM(sd.refund_amount), 0)::DOUBLE PRECISION AS shortvideo_refund_amount,
    COALESCE(SUM(sd.live_room_pay_amount), 0)::DOUBLE PRECISION AS shortvideo_live_room_pay_amount,
    COALESCE(SUM(sd.search_after_view_pay_amount), 0)::DOUBLE PRECISION AS shortvideo_search_after_view_pay_amount,
    COALESCE(SUM(sd.shop_page_pay_amount), 0)::DOUBLE PRECISION AS shortvideo_shop_page_pay_amount,
    COUNT(DISTINCT NULLIF(BTRIM(sd.author_douyin_id), ''))::BIGINT AS author_count
  FROM scope sc
  LEFT JOIN scoped_detail sd
    ON sd.stat_date BETWEEN sc.start_date AND sc.end_date
   AND (sc.identity IS NULL OR sd.shortvideo_identity_type = sc.identity)
  GROUP BY sc.bucket
)
SELECT COALESCE(
  jsonb_object_agg(
    b.bucket,
    jsonb_build_object(
      'shortvideo_count', b.shortvideo_count,
      'video_view_count', b.video_view_count,
      'shortvideo_gmv', b.shortvideo_gmv,
      'shortvideo_user_pay_amount', b.shortvideo_user_pay_amount,
      'shortvideo_refund_amount', b.shortvideo_refund_amount,
      'shortvideo_live_room_pay_amount', b.shortvideo_live_room_pay_amount,
      'shortvideo_search_after_view_pay_amount', b.shortvideo_search_after_view_pay_amount,
      'shortvideo_shop_page_pay_amount', b.shortvideo_shop_page_pay_amount,
      'shortvideo_play_to_pay_rate', CASE
        WHEN b.video_view_count > 0
          THEN ROUND((b.shortvideo_user_pay_amount::NUMERIC / b.video_view_count::NUMERIC), 6)::DOUBLE PRECISION
        ELSE NULL::DOUBLE PRECISION
      END,
      'shortvideo_refund_rate', CASE
        WHEN b.shortvideo_user_pay_amount > 0
          THEN ROUND((b.shortvideo_refund_amount::NUMERIC / b.shortvideo_user_pay_amount::NUMERIC), 6)::DOUBLE PRECISION
        ELSE NULL::DOUBLE PRECISION
      END,
      'author_count', b.author_count
    )
  ),
  '{}'::JSONB
) AS totals_payload
FROM bucket_agg b
