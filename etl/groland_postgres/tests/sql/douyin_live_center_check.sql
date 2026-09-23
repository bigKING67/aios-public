DO $$
DECLARE
  v_invalid INTEGER;
  v_missing TEXT[];
BEGIN
  IF to_regclass('ads.douyin_live_session_minute_metrics') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_session_minute_metrics not found';
  END IF;

  IF to_regclass('ads.douyin_live_session_recordings') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_session_recordings not found';
  END IF;

  IF to_regclass('ads.douyin_live_session_recording_segments') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_session_recording_segments not found';
  END IF;

  IF to_regclass('ads.douyin_live_session_analysis') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_session_analysis not found';
  END IF;

  IF to_regprocedure('ads.refresh_douyin_live_session_minute_metrics(date,date)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_douyin_live_session_minute_metrics(date,date) not found';
  END IF;

  WITH live_center_tables(table_name) AS (
    VALUES
      ('douyin_live_session_minute_metrics'),
      ('douyin_live_session_recordings'),
      ('douyin_live_session_recording_segments'),
      ('douyin_live_session_analysis')
  )
  SELECT COALESCE(
    ARRAY_AGG(FORMAT('table:ads.%s', t.table_name) ORDER BY t.table_name),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_tables t
  JOIN pg_class c
    ON c.oid = TO_REGCLASS(FORMAT('ads.%I', t.table_name))
  WHERE NULLIF(BTRIM(OBJ_DESCRIPTION(c.oid, 'pg_class')), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center table comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  WITH live_center_tables(table_name) AS (
    VALUES
      ('douyin_live_session_minute_metrics'),
      ('douyin_live_session_recordings'),
      ('douyin_live_session_recording_segments'),
      ('douyin_live_session_analysis')
  )
  SELECT COALESCE(
    ARRAY_AGG(FORMAT('column:ads.%s.%s', c.relname, a.attname) ORDER BY c.relname, a.attnum),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_tables t
  JOIN pg_class c
    ON c.oid = TO_REGCLASS(FORMAT('ads.%I', t.table_name))
  JOIN pg_attribute a
    ON a.attrelid = c.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
  WHERE NULLIF(BTRIM(COL_DESCRIPTION(c.oid, a.attnum)), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center column comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  WITH live_center_tables(table_name) AS (
    VALUES
      ('douyin_live_session_minute_metrics'),
      ('douyin_live_session_recordings'),
      ('douyin_live_session_recording_segments'),
      ('douyin_live_session_analysis')
  )
  SELECT COALESCE(
    ARRAY_AGG(FORMAT('constraint:ads.%s.%s', c.relname, con.conname) ORDER BY c.relname, con.conname),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_tables t
  JOIN pg_class c
    ON c.oid = TO_REGCLASS(FORMAT('ads.%I', t.table_name))
  JOIN pg_constraint con
    ON con.conrelid = c.oid
  WHERE NULLIF(BTRIM(OBJ_DESCRIPTION(con.oid, 'pg_constraint')), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center constraint comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  WITH live_center_tables(table_name) AS (
    VALUES
      ('douyin_live_session_minute_metrics'),
      ('douyin_live_session_recordings'),
      ('douyin_live_session_recording_segments'),
      ('douyin_live_session_analysis')
  )
  SELECT COALESCE(
    ARRAY_AGG(FORMAT('index:ads.%s', idx.relname) ORDER BY idx.relname),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_tables t
  JOIN pg_class tbl
    ON tbl.oid = TO_REGCLASS(FORMAT('ads.%I', t.table_name))
  JOIN pg_index ix
    ON ix.indrelid = tbl.oid
  JOIN pg_class idx
    ON idx.oid = ix.indexrelid
  WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      WHERE con.conindid = idx.oid
    )
    AND NULLIF(BTRIM(OBJ_DESCRIPTION(idx.oid, 'pg_class')), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center index comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  WITH live_center_triggers(table_name, trigger_name) AS (
    VALUES
      ('douyin_live_session_minute_metrics', 'trg_touch_douyin_live_session_minute_metrics_updated_at'),
      ('douyin_live_session_recordings', 'trg_touch_douyin_live_session_recordings_updated_at'),
      ('douyin_live_session_recording_segments', 'trg_touch_douyin_live_session_recording_segments_updated_at'),
      ('douyin_live_session_analysis', 'trg_touch_douyin_live_session_analysis_updated_at')
  )
  SELECT COALESCE(
    ARRAY_AGG(FORMAT('trigger:ads.%s.%s', t.table_name, t.trigger_name) ORDER BY t.table_name, t.trigger_name),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_triggers t
  LEFT JOIN pg_trigger trg
    ON trg.tgrelid = TO_REGCLASS(FORMAT('ads.%I', t.table_name))
   AND trg.tgname = t.trigger_name
  WHERE trg.oid IS NULL
     OR NULLIF(BTRIM(OBJ_DESCRIPTION(trg.oid, 'pg_trigger')), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center trigger comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  WITH live_center_routines(label, signature) AS (
    VALUES
      (
        'function:ads.fn_touch_douyin_live_center_updated_at()',
        'ads.fn_touch_douyin_live_center_updated_at()'
      ),
      (
        'procedure:ads.refresh_douyin_live_session_minute_metrics(date,date)',
        'ads.refresh_douyin_live_session_minute_metrics(date,date)'
      )
  )
  SELECT COALESCE(
    ARRAY_AGG(r.label ORDER BY r.label),
    ARRAY[]::TEXT[]
  )
  INTO v_missing
  FROM live_center_routines r
  WHERE TO_REGPROCEDURE(r.signature) IS NULL
     OR NULLIF(BTRIM(OBJ_DESCRIPTION(TO_REGPROCEDURE(r.signature), 'pg_proc')), '') IS NULL;

  IF ARRAY_LENGTH(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'douyin_live_center routine comments missing: %', ARRAY_TO_STRING(v_missing, ', ');
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_minute_metrics
  WHERE session_key IS NULL
     OR LENGTH(session_key) <> 32
     OR live_minute_time IS NULL
     OR live_start_time IS NULL
     OR minute_offset < 0
     OR order_count < 0
     OR source_row_id IS NULL
     OR match_status NOT IN ('matched', 'overlap_resolved');

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_minute_metrics basic contract failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT session_key, live_minute_time, source_row_id, COUNT(*) AS row_count
    FROM ads.douyin_live_session_minute_metrics
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
  ) dup;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_minute_metrics duplicate check failed, groups: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_minute_metrics m
  WHERE m.session_key <> md5(
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
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_minute_metrics stable session_key contract failed, rows: %', v_invalid;
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NOT NULL
     AND to_regclass('ods.douyin_livestream_minute_raw') IS NOT NULL THEN
    WITH minute_rows AS (
      SELECT
        m.id AS source_row_id,
        m.live_minute_time,
        BTRIM(COALESCE(m.live_room_douyin_id, '')) AS anchor_douyin_id,
        GREATEST(COALESCE(m.order_count, 0), 0) AS order_count
      FROM ods.douyin_livestream_minute_raw m
      WHERE NULLIF(BTRIM(COALESCE(m.live_room_douyin_id, '')), '') IS NOT NULL
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
        COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
        COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
        COALESCE(d.is_self_live, FALSE) AS is_self_live,
        COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
        d.live_start_time,
        CASE
          WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
            THEN d.live_end_time
          ELSE d.live_start_time + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
        END AS live_end_boundary,
        d.source_updated_at,
        d.updated_at
      FROM ads.douyin_live_detail d
      WHERE d.live_start_time IS NOT NULL
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
        ) AS window_rank
      FROM live_window_source
    ),
    live_windows AS (
      SELECT
        session_key,
        anchor_douyin_id,
        anchor_nickname,
        is_self_live,
        live_order_count,
        match_start_time,
        match_end_boundary
      FROM live_window_ranked
      WHERE window_rank = 1
    ),
    candidates AS (
      SELECT
        m.source_row_id,
        m.live_minute_time,
        m.order_count,
        w.session_key,
        ROW_NUMBER() OVER (
          PARTITION BY m.source_row_id
          ORDER BY w.match_start_time DESC, w.match_end_boundary DESC NULLS LAST, w.session_key
        ) AS candidate_rank
      FROM minute_rows m
      JOIN live_windows w
        ON m.anchor_douyin_id = w.anchor_douyin_id
       AND m.live_minute_time >= w.match_start_time
       AND m.live_minute_time < w.match_end_boundary
    ),
    expected AS (
      SELECT
        session_key,
        COUNT(*)::BIGINT AS source_rows,
        COALESCE(SUM(order_count), 0)::BIGINT AS source_orders
      FROM candidates
      WHERE candidate_rank = 1
      GROUP BY session_key
    ),
    ads_summary AS (
      SELECT
        session_key,
        COUNT(*)::BIGINT AS minute_rows,
        COALESCE(SUM(order_count), 0)::BIGINT AS minute_orders
      FROM ads.douyin_live_session_minute_metrics
      GROUP BY session_key
    )
    SELECT COUNT(*)
    INTO v_invalid
    FROM live_windows w
    JOIN expected e
      ON e.session_key = w.session_key
    LEFT JOIN ads_summary a
      ON a.session_key = w.session_key
    WHERE w.is_self_live IS TRUE
      AND LOWER(COALESCE(NULLIF(BTRIM(w.anchor_nickname), ''), '')) LIKE 'groland%'
      AND w.live_order_count > 0
      AND e.source_orders > 0
      AND (
        COALESCE(a.minute_rows, 0) = 0
        OR COALESCE(a.minute_orders, 0) <> e.source_orders
      );

    IF v_invalid > 0 THEN
      RAISE EXCEPTION 'groland live-center minute bridge freshness failed, sessions: %', v_invalid;
    END IF;

    WITH minute_rows AS (
      SELECT
        m.id AS source_row_id,
        m.live_minute_time,
        m.live_minute_time::DATE AS source_day,
        BTRIM(COALESCE(m.live_room_douyin_id, '')) AS anchor_douyin_id,
        GREATEST(COALESCE(m.order_count, 0), 0) AS order_count
      FROM ods.douyin_livestream_minute_raw m
      WHERE NULLIF(BTRIM(COALESCE(m.live_room_douyin_id, '')), '') IS NOT NULL
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
        COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
        COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
        COALESCE(d.is_self_live, FALSE) AS is_self_live,
        COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
        d.live_start_time,
        CASE
          WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
            THEN d.live_end_time
          ELSE d.live_start_time + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
        END AS live_end_boundary,
        d.source_updated_at,
        d.updated_at
      FROM ads.douyin_live_detail d
      WHERE d.live_start_time IS NOT NULL
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
        ) AS window_rank
      FROM live_window_source
    ),
    live_windows AS (
      SELECT
        session_key,
        anchor_douyin_id,
        anchor_nickname,
        is_self_live,
        live_order_count,
        match_start_time,
        match_end_boundary
      FROM live_window_ranked
      WHERE window_rank = 1
    ),
    candidates AS (
      SELECT
        m.source_row_id,
        m.source_day,
        m.live_minute_time,
        m.order_count,
        w.session_key,
        ROW_NUMBER() OVER (
          PARTITION BY m.source_row_id
          ORDER BY w.match_start_time DESC, w.match_end_boundary DESC NULLS LAST, w.session_key
        ) AS candidate_rank
      FROM minute_rows m
      JOIN live_windows w
        ON m.anchor_douyin_id = w.anchor_douyin_id
       AND m.live_minute_time >= w.match_start_time
       AND m.live_minute_time < w.match_end_boundary
    ),
    expected_by_day AS (
      SELECT
        session_key,
        source_day,
        COUNT(*)::BIGINT AS source_rows,
        COALESCE(SUM(order_count), 0)::BIGINT AS source_orders
      FROM candidates
      WHERE candidate_rank = 1
      GROUP BY 1, 2
    ),
    ads_by_day AS (
      SELECT
        session_key,
        live_minute_time::DATE AS bridge_day,
        COUNT(*)::BIGINT AS minute_rows
      FROM ads.douyin_live_session_minute_metrics
      GROUP BY 1, 2
    )
    SELECT COUNT(*)
    INTO v_invalid
    FROM live_windows w
    JOIN expected_by_day e
      ON e.session_key = w.session_key
    LEFT JOIN ads_by_day a
      ON a.session_key = e.session_key
     AND a.bridge_day = e.source_day
    WHERE w.is_self_live IS TRUE
      AND LOWER(COALESCE(NULLIF(BTRIM(w.anchor_nickname), ''), '')) LIKE 'groland%'
      AND w.live_order_count > 0
      AND e.source_rows > 0
      AND e.source_orders > 0
      AND COALESCE(a.minute_rows, 0) = 0;

    IF v_invalid > 0 THEN
      RAISE EXCEPTION 'groland live-center minute bridge day-gap freshness failed, session_days: %', v_invalid;
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT session_key, COUNT(*) AS row_count
    FROM ads.douyin_live_session_recordings
    WHERE status = 'active'
    GROUP BY session_key
    HAVING COUNT(*) > 1
  ) dup;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_recordings active uniqueness failed, sessions: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_recordings
  WHERE status NOT IN ('active', 'archived', 'deleted')
     OR NULLIF(BTRIM(session_key), '') IS NULL
     OR NULLIF(BTRIM(anchor_douyin_id), '') IS NULL
     OR live_start_time IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_recordings basic contract failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_recording_segments
  WHERE segment_index <= 0
     OR raw_object_key NOT LIKE 'live-recordings/%'
     OR NULLIF(BTRIM(bucket), '') IS NULL
	     OR NULLIF(BTRIM(file_name), '') IS NULL
	     OR (file_size_bytes IS NOT NULL AND file_size_bytes < 0)
	     OR (multipart_part_size_bytes IS NOT NULL AND multipart_part_size_bytes <= 0)
	     OR (multipart_upload_id IS NOT NULL AND NULLIF(BTRIM(multipart_upload_id), '') IS NULL)
	     OR (duration_seconds IS NOT NULL AND duration_seconds < 0)
     OR (
       start_offset_seconds IS NOT NULL
       AND end_offset_seconds IS NOT NULL
       AND end_offset_seconds < start_offset_seconds
     )
     OR upload_status NOT IN ('pending', 'uploading', 'uploaded', 'failed', 'deleted')
     OR processing_status NOT IN ('pending', 'processing', 'ready', 'failed', 'skipped');

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_recording_segments contract failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_analysis
  WHERE status NOT IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
     OR NULLIF(BTRIM(session_key), '') IS NULL
     OR analysis_json IS NULL
     OR input_snapshot IS NULL
     OR usage_json IS NULL
     OR (
       analysis_profile IS NOT NULL
       AND analysis_profile NOT IN ('auto', 'l1_text', 'l2_multimodal')
     )
     OR progress_percent < 0
     OR progress_percent > 100;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_analysis contract failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_session_analysis
  WHERE status = 'succeeded'
    AND prompt_version LIKE 'v4%'
    AND (
      jsonb_typeof(analysis_json) <> 'object'
      OR NULLIF(BTRIM(COALESCE(analysis_json->>'summary', '')), '') IS NULL
      OR NOT (
        analysis_json ? 'primaryDecision'
        OR analysis_json ? 'primary_decision'
      )
      OR NOT (analysis_json ? 'timeline')
      OR jsonb_typeof(COALESCE(analysis_json->'timeline', '[]'::JSONB)) <> 'array'
      OR NOT (
        analysis_json ? 'evidenceLedger'
        OR analysis_json ? 'evidence_ledger'
      )
      OR NOT (
        analysis_json ? 'reviewTasks'
        OR analysis_json ? 'review_tasks'
      )
      OR jsonb_typeof(COALESCE(analysis_json->'reviewTasks', analysis_json->'review_tasks', '[]'::JSONB)) <> 'array'
      OR NOT (
        analysis_json ? 'analysisSelfEval'
        OR analysis_json ? 'analysis_self_eval'
      )
      OR NOT (analysis_json ? 'metrics')
      OR jsonb_typeof(COALESCE(analysis_json->'metrics', '{}'::JSONB)) <> 'object'
      OR NOT (analysis_json ? 'recording')
      OR jsonb_typeof(COALESCE(analysis_json->'recording', '{}'::JSONB)) <> 'object'
      OR NOT (analysis_json ? 'input')
      OR jsonb_typeof(COALESCE(analysis_json->'input', '{}'::JSONB)) <> 'object'
      OR NULLIF(BTRIM(COALESCE(analysis_json->>'generatedAt', analysis_json->>'generated_at', '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(provider, analysis_json->>'provider', '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(model, analysis_json->>'model', '')), '') IS NULL
    );

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_session_analysis V4 succeeded contract failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin_live_center checks passed';
END;
$$;
