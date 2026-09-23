BEGIN;

COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.session_key IS
  '场次公开标识：md5(shop_id|anchor_douyin_id|canonical_session_boundary)。已结束场次使用分钟级 live_end_time；未结束场次使用分钟级 live_start_time，避免开始时间秒级或补数纠偏导致前端选中场次丢失分钟线。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.session_key IS
  '直播场次公开标识，对应分钟桥接表和前端选中的稳定场次 key。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.session_key IS
  '被分析的直播场次稳定公开标识。';

CREATE TEMP TABLE tmp_douyin_live_session_minute_metrics_stable
ON COMMIT DROP
AS
WITH normalized AS (
  SELECT
    md5(
      COALESCE(NULLIF(BTRIM(m.shop_id), ''), '')
      || '|'
      || COALESCE(NULLIF(BTRIM(m.anchor_douyin_id), ''), '')
      || '|'
      || (
        CASE
          WHEN m.live_end_time IS NOT NULL AND m.live_end_time > m.live_start_time
            THEN DATE_TRUNC('minute', m.live_end_time)
          ELSE DATE_TRUNC('minute', m.live_start_time)
        END
      )::TEXT
    ) AS stable_session_key,
    m.*
  FROM ads.douyin_live_session_minute_metrics m
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY stable_session_key, live_minute_time, source_row_id
      ORDER BY source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM normalized
)
SELECT
  stable_session_key AS session_key,
  shop_id,
  shop_name,
  anchor_douyin_id,
  anchor_nickname,
  live_start_time,
  live_end_time,
  live_minute_time,
  minute_offset,
  order_count,
  source_row_id,
  match_status,
  match_reason,
  source_updated_at,
  created_at,
  updated_at
FROM ranked
WHERE rn = 1;

DELETE FROM ads.douyin_live_session_minute_metrics;

INSERT INTO ads.douyin_live_session_minute_metrics (
  session_key,
  shop_id,
  shop_name,
  anchor_douyin_id,
  anchor_nickname,
  live_start_time,
  live_end_time,
  live_minute_time,
  minute_offset,
  order_count,
  source_row_id,
  match_status,
  match_reason,
  source_updated_at,
  created_at,
  updated_at
)
SELECT
  session_key,
  shop_id,
  shop_name,
  anchor_douyin_id,
  anchor_nickname,
  live_start_time,
  live_end_time,
  live_minute_time,
  minute_offset,
  order_count,
  source_row_id,
  match_status,
  match_reason,
  source_updated_at,
  created_at,
  updated_at
FROM tmp_douyin_live_session_minute_metrics_stable;

CREATE TEMP TABLE tmp_douyin_live_center_session_key_map
ON COMMIT DROP
AS
SELECT DISTINCT ON (raw_session_key)
  raw_session_key,
  stable_session_key
FROM (
  SELECT
    md5(
      COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
      || '|'
      || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
      || '|'
      || d.live_start_time::TEXT
    ) AS raw_session_key,
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
    ) AS stable_session_key,
    d.source_updated_at,
    d.updated_at
  FROM ads.douyin_live_detail d
  WHERE d.live_start_time IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
) source
ORDER BY raw_session_key, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST;

WITH recording_targets AS (
  SELECT
    r.recording_id,
    r.session_key AS current_session_key,
    COALESCE(m.stable_session_key, r.session_key) AS target_session_key,
    (m.stable_session_key IS NULL OR r.session_key = m.stable_session_key) AS already_stable,
    r.updated_at,
    r.created_at
  FROM ads.douyin_live_session_recordings r
  LEFT JOIN tmp_douyin_live_center_session_key_map m
    ON m.raw_session_key = r.session_key
  WHERE r.status = 'active'
),
active_ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY target_session_key
      ORDER BY already_stable DESC, updated_at DESC, created_at DESC, recording_id
    ) AS rn
  FROM recording_targets
)
UPDATE ads.douyin_live_session_recordings r
SET
  status = 'archived',
  updated_at = CURRENT_TIMESTAMP
FROM active_ranked a
WHERE r.recording_id = a.recording_id
  AND a.rn > 1;

UPDATE ads.douyin_live_session_recordings r
SET
  session_key = m.stable_session_key,
  updated_at = CURRENT_TIMESTAMP
FROM tmp_douyin_live_center_session_key_map m
WHERE r.session_key = m.raw_session_key
  AND r.session_key <> m.stable_session_key;

UPDATE ads.douyin_live_session_analysis a
SET
  session_key = r.session_key,
  updated_at = CURRENT_TIMESTAMP
FROM ads.douyin_live_session_recordings r
WHERE a.recording_id = r.recording_id
  AND a.session_key <> r.session_key;

UPDATE ads.douyin_live_session_analysis a
SET
  session_key = m.stable_session_key,
  updated_at = CURRENT_TIMESTAMP
FROM tmp_douyin_live_center_session_key_map m
WHERE a.session_key = m.raw_session_key
  AND a.session_key <> m.stable_session_key;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_session_minute_metrics(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF to_regclass('ods.douyin_livestream_minute_raw') IS NULL THEN
    RAISE EXCEPTION 'required source table missing: ods.douyin_livestream_minute_raw';
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'required session table missing: ads.douyin_live_detail';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(live_minute_time::DATE)),
    COALESCE(p_end_date, MAX(live_minute_time::DATE))
  INTO v_start_date, v_end_date
  FROM ods.douyin_livestream_minute_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'douyin_live_session_minute_metrics refresh skipped: no minute rows';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'invalid refresh window: % > %', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_live_session_minute_metrics
  WHERE live_minute_time::DATE BETWEEN v_start_date AND v_end_date;

  WITH minute_rows AS (
    SELECT
      m.id AS source_row_id,
      m.live_minute_time,
      BTRIM(COALESCE(m.live_room_douyin_id, '')) AS anchor_douyin_id,
      GREATEST(COALESCE(m.order_count, 0), 0) AS order_count,
      m.updated_at AS source_updated_at
    FROM ods.douyin_livestream_minute_raw m
    WHERE m.live_minute_time::DATE BETWEEN v_start_date AND v_end_date
      AND NULLIF(BTRIM(COALESCE(m.live_room_douyin_id, '')), '') IS NOT NULL
  ),
  live_window_source AS (
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
      ) AS session_key,
      COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
      COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
      COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
      d.live_start_time,
      d.live_end_time,
      CASE
        WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
          THEN d.live_end_time
        ELSE d.live_start_time + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
      END AS live_end_boundary,
      d.source_updated_at,
      d.updated_at
    FROM ads.douyin_live_detail d
    WHERE d.live_start_time::DATE <= v_end_date
      AND (
        d.live_end_time::DATE >= v_start_date
        OR (
          d.live_end_time IS NULL
          AND (
            d.live_start_time
            + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
          )::DATE >= v_start_date
        )
      )
      AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
  ),
  live_window_ranked AS (
    SELECT
      *,
      MIN(live_start_time) OVER (PARTITION BY session_key) AS match_start_time,
      MAX(live_end_boundary) OVER (PARTITION BY session_key) AS match_end_boundary,
      ROW_NUMBER() OVER (
        PARTITION BY session_key
        ORDER BY source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, live_start_time DESC
      ) AS rn
    FROM live_window_source
  ),
  live_windows AS (
    SELECT
      session_key,
      shop_id,
      shop_name,
      anchor_douyin_id,
      anchor_nickname,
      match_start_time AS live_start_time,
      live_end_time,
      match_start_time,
      match_end_boundary
    FROM live_window_ranked
    WHERE rn = 1
  ),
  candidates AS (
    SELECT
      m.source_row_id,
      m.live_minute_time,
      m.order_count,
      m.source_updated_at,
      w.session_key,
      w.shop_id,
      w.shop_name,
      w.anchor_douyin_id,
      w.anchor_nickname,
      w.live_start_time,
      w.live_end_time,
      FLOOR(EXTRACT(EPOCH FROM (m.live_minute_time - w.match_start_time)) / 60)::INTEGER AS minute_offset,
      COUNT(*) OVER (PARTITION BY m.source_row_id) AS match_count,
      ROW_NUMBER() OVER (
        PARTITION BY m.source_row_id
        ORDER BY w.match_start_time DESC, w.match_end_boundary DESC NULLS LAST, w.shop_id, w.session_key
      ) AS rn
    FROM minute_rows m
    JOIN live_windows w
      ON m.anchor_douyin_id = w.anchor_douyin_id
     AND m.live_minute_time >= w.match_start_time
     AND m.live_minute_time < w.match_end_boundary
  )
  INSERT INTO ads.douyin_live_session_minute_metrics (
    session_key,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    live_start_time,
    live_end_time,
    live_minute_time,
    minute_offset,
    order_count,
    source_row_id,
    match_status,
    match_reason,
    source_updated_at
  )
  SELECT
    session_key,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    live_start_time,
    live_end_time,
    live_minute_time,
    minute_offset,
    order_count,
    source_row_id,
    CASE WHEN match_count > 1 THEN 'overlap_resolved' ELSE 'matched' END AS match_status,
    CASE
      WHEN match_count > 1 THEN '同主播多个稳定直播窗口重叠，按最近匹配窗口归属'
      ELSE '同主播稳定场次窗口唯一命中'
    END AS match_reason,
    source_updated_at
  FROM candidates
  WHERE rn = 1
    AND minute_offset >= 0
  ON CONFLICT (session_key, live_minute_time, source_row_id) DO UPDATE SET
    shop_id = EXCLUDED.shop_id,
    shop_name = EXCLUDED.shop_name,
    anchor_douyin_id = EXCLUDED.anchor_douyin_id,
    anchor_nickname = EXCLUDED.anchor_nickname,
    live_start_time = EXCLUDED.live_start_time,
    live_end_time = EXCLUDED.live_end_time,
    minute_offset = EXCLUDED.minute_offset,
    order_count = EXCLUDED.order_count,
    match_status = EXCLUDED.match_status,
    match_reason = EXCLUDED.match_reason,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = NOW();

  RAISE NOTICE 'douyin_live_session_minute_metrics refreshed for % to %', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_session_minute_metrics(DATE, DATE) IS
  '按日期窗口刷新直播中台分钟成交桥接表：使用稳定 session_key 归属分钟行，已结束场次按分钟级 live_end_time 定位，未结束场次回退分钟级 live_start_time，并合并同一稳定场次的开始时间纠偏窗口。';

COMMIT;
