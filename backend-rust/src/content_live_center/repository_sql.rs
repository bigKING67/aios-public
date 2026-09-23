pub(crate) const LIST_SESSIONS_SQL: &str = r#"
WITH live_sessions AS (
  SELECT DISTINCT ON (session_id)
    session_id,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    anchor_avatar,
    live_start_time,
    live_end_time,
    live_duration_minutes,
    live_order_count,
    live_gmv,
    live_user_pay_amount,
    source_updated_at,
    updated_at
  FROM (
    SELECT
      md5(
        COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
        || '|'
        || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
        || '|'
        || (
          CASE
            WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
              THEN DATE_TRUNC('minute', d.live_end_time)
            ELSE DATE_TRUNC('minute', d.live_start_time)
          END
        )::TEXT
      ) AS session_id,
      COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
      COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
      COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
      NULLIF(BTRIM(COALESCE(d.anchor_avatar, '')), '') AS anchor_avatar,
      d.live_start_time,
      d.live_end_time,
      COALESCE(d.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
      COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
      COALESCE(d.live_gmv, 0)::DOUBLE PRECISION AS live_gmv,
      COALESCE(d.live_user_pay_amount, 0)::DOUBLE PRECISION AS live_user_pay_amount,
      d.source_updated_at,
      d.updated_at
    FROM ads.douyin_live_detail d
    WHERE d.live_start_time IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
      AND COALESCE(d.is_self_live, FALSE) IS TRUE
      AND LOWER(COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '')) LIKE 'groland%'
  ) source
  ORDER BY session_id, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, live_start_time DESC
),
filtered AS (
  SELECT *
  FROM live_sessions s
  WHERE (
      $1::TEXT IS NULL
      OR LOWER(s.shop_name) LIKE '%' || LOWER($1::TEXT) || '%'
      OR LOWER(s.anchor_nickname) LIKE '%' || LOWER($1::TEXT) || '%'
      OR LOWER(s.anchor_douyin_id) LIKE '%' || LOWER($1::TEXT) || '%'
      OR LOWER(s.shop_id) LIKE '%' || LOWER($1::TEXT) || '%'
    )
    AND ($2::TEXT IS NULL OR s.shop_id = $2::TEXT)
    AND ($3::TEXT IS NULL OR s.anchor_douyin_id = $3::TEXT)
    AND ($4::DATE IS NULL OR s.live_start_time::DATE >= $4::DATE)
    AND ($5::DATE IS NULL OR s.live_start_time::DATE <= $5::DATE)
),
minute_summary AS (
  SELECT
    session_key,
    COALESCE(SUM(order_count), 0)::BIGINT AS minute_order_count,
    COUNT(*)::BIGINT AS minute_point_count
  FROM ads.douyin_live_session_minute_metrics
  GROUP BY session_key
),
active_recordings AS (
  SELECT DISTINCT ON (session_key)
    session_key,
    recording_id
  FROM ads.douyin_live_session_recordings
  WHERE status = 'active'
  ORDER BY session_key, updated_at DESC
),
segment_summary AS (
  SELECT
    recording_id,
    COUNT(*) FILTER (WHERE upload_status <> 'deleted')::BIGINT AS recording_segment_count
  FROM ads.douyin_live_session_recording_segments
  GROUP BY recording_id
),
latest_analysis AS (
  SELECT DISTINCT ON (session_key)
    session_key,
    status AS analysis_status
  FROM ads.douyin_live_session_analysis
  ORDER BY session_key, created_at DESC
)
SELECT
  s.*,
  COALESCE(ms.minute_order_count, 0)::BIGINT AS minute_order_count,
  COALESCE(ms.minute_point_count, 0)::BIGINT AS minute_point_count,
  COALESCE(ss.recording_segment_count, 0)::BIGINT AS recording_segment_count,
  la.analysis_status,
  COUNT(*) OVER()::BIGINT AS total_count
FROM filtered s
LEFT JOIN minute_summary ms ON ms.session_key = s.session_id
LEFT JOIN active_recordings ar ON ar.session_key = s.session_id
LEFT JOIN segment_summary ss ON ss.recording_id = ar.recording_id
LEFT JOIN latest_analysis la ON la.session_key = s.session_id
ORDER BY s.live_start_time DESC
LIMIT $6 OFFSET $7
"#;

pub(crate) const DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(d.live_start_time::DATE)::TEXT AS min_date,
  MAX(d.live_start_time::DATE)::TEXT AS max_date
FROM ads.douyin_live_detail d
WHERE d.live_start_time IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
  AND COALESCE(d.is_self_live, FALSE) IS TRUE
  AND LOWER(COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '')) LIKE 'groland%'
"#;

pub(crate) const DETAIL_SESSION_SQL: &str = r#"
WITH live_sessions AS (
  SELECT DISTINCT ON (session_id)
    session_id,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    anchor_avatar,
    live_start_time,
    live_end_time,
    live_duration_minutes,
    live_order_count,
    live_gmv,
    live_user_pay_amount,
    source_updated_at,
    updated_at
  FROM (
    SELECT
      md5(
        COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
        || '|'
        || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
        || '|'
        || (
          CASE
            WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
              THEN DATE_TRUNC('minute', d.live_end_time)
            ELSE DATE_TRUNC('minute', d.live_start_time)
          END
        )::TEXT
      ) AS session_id,
      COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
      COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
      COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
      NULLIF(BTRIM(COALESCE(d.anchor_avatar, '')), '') AS anchor_avatar,
      d.live_start_time,
      d.live_end_time,
      COALESCE(d.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
      COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
      COALESCE(d.live_gmv, 0)::DOUBLE PRECISION AS live_gmv,
      COALESCE(d.live_user_pay_amount, 0)::DOUBLE PRECISION AS live_user_pay_amount,
      d.source_updated_at,
      d.updated_at
    FROM ads.douyin_live_detail d
    WHERE d.live_start_time IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
      AND COALESCE(d.is_self_live, FALSE) IS TRUE
      AND LOWER(COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '')) LIKE 'groland%'
  ) source
  ORDER BY session_id, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, live_start_time DESC
),
minute_summary AS (
  SELECT
    session_key,
    COALESCE(SUM(order_count), 0)::BIGINT AS minute_order_count,
    COUNT(*)::BIGINT AS minute_point_count
  FROM ads.douyin_live_session_minute_metrics
  WHERE session_key = $1
  GROUP BY session_key
),
active_recordings AS (
  SELECT DISTINCT ON (session_key)
    session_key,
    recording_id
  FROM ads.douyin_live_session_recordings
  WHERE status = 'active'
    AND session_key = $1
  ORDER BY session_key, updated_at DESC
),
segment_summary AS (
  SELECT
    recording_id,
    COUNT(*) FILTER (WHERE upload_status <> 'deleted')::BIGINT AS recording_segment_count
  FROM ads.douyin_live_session_recording_segments
  GROUP BY recording_id
),
latest_analysis AS (
  SELECT DISTINCT ON (session_key)
    session_key,
    status AS analysis_status
  FROM ads.douyin_live_session_analysis
  WHERE session_key = $1
  ORDER BY session_key, created_at DESC
)
SELECT
  s.*,
  COALESCE(ms.minute_order_count, 0)::BIGINT AS minute_order_count,
  COALESCE(ms.minute_point_count, 0)::BIGINT AS minute_point_count,
  COALESCE(ss.recording_segment_count, 0)::BIGINT AS recording_segment_count,
  la.analysis_status
FROM live_sessions s
LEFT JOIN minute_summary ms ON ms.session_key = s.session_id
LEFT JOIN active_recordings ar ON ar.session_key = s.session_id
LEFT JOIN segment_summary ss ON ss.recording_id = ar.recording_id
LEFT JOIN latest_analysis la ON la.session_key = s.session_id
WHERE s.session_id = $1
"#;

pub(crate) const MINUTE_METRICS_SQL: &str = r#"
SELECT
  live_minute_time,
  minute_offset,
  order_count::BIGINT AS order_count,
  match_status,
  match_reason
FROM ads.douyin_live_session_minute_metrics
WHERE session_key = $1
ORDER BY live_minute_time ASC, source_row_id ASC
"#;

pub(crate) const SEGMENTS_SQL: &str = r#"
SELECT
  segment_id,
  recording_id,
  segment_index,
  bucket,
  raw_object_key,
  preview_object_key,
  file_name,
  mime_type,
  file_ext,
  file_size_bytes,
  sha256,
  duration_seconds::DOUBLE PRECISION AS duration_seconds,
  start_offset_seconds::DOUBLE PRECISION AS start_offset_seconds,
  end_offset_seconds::DOUBLE PRECISION AS end_offset_seconds,
  upload_status,
  processing_status,
  uploaded_by_user_id,
  uploaded_at,
  created_at,
  updated_at
FROM ads.douyin_live_session_recording_segments
WHERE recording_id = $1
  AND upload_status <> 'deleted'
ORDER BY segment_index ASC, created_at ASC
"#;

pub(crate) const ANALYSIS_SQL: &str = r#"
SELECT
  analysis_id,
  session_key,
  recording_id,
  status,
  model,
  analysis_profile,
  provider,
  prompt_version,
  input_snapshot,
  progress_percent,
  processing_stage,
  output_object_key,
  response_id,
  usage_json,
  analysis_json,
  error_message,
  created_by_user_id,
  created_at,
  started_at,
  completed_at,
  updated_at
FROM ads.douyin_live_session_analysis
WHERE session_key = $1
ORDER BY created_at DESC
LIMIT 20
"#;
