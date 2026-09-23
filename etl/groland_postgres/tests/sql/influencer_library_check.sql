DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.influencer_library') IS NULL THEN
    RAISE EXCEPTION 'table ads.influencer_library not found';
  END IF;

  IF to_regprocedure('ads.fn_influencer_library_parse_number(text)') IS NULL THEN
    RAISE EXCEPTION 'function ads.fn_influencer_library_parse_number(text) not found';
  END IF;

  IF to_regclass('ads.influencer_library_follow_log') IS NULL THEN
    RAISE EXCEPTION 'table ads.influencer_library_follow_log not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'influencer_library_follow_log'
    AND column_name = 'followed_at'
    AND data_type = 'timestamp without time zone';

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'ads.influencer_library_follow_log.followed_at type check failed';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'influencer_library_follow_log'
    AND column_name = 'followed_at'
    AND column_default ILIKE '%date_trunc%'
    AND column_default ILIKE '%minute%'
    AND column_default ILIKE '%Asia/Shanghai%';

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'ads.influencer_library_follow_log.followed_at default check failed';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.influencer_library
  WHERE platform IS NULL
     OR BTRIM(platform) = ''
     OR influencer_name IS NULL
     OR BTRIM(influencer_name) = ''
     OR cooperation_status_norm IS NULL
     OR BTRIM(cooperation_status_norm) = ''
     OR source_type IS NULL
     OR BTRIM(source_type) = ''
     OR tags IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.influencer_library basic field check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.influencer_library
  WHERE created_by_user_id IS NULL
    AND COALESCE(created_by, '') <> 'migration';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.influencer_library public seed ownership check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT library_dedupe_key
    FROM ads.influencer_library
    WHERE is_deleted = FALSE
    GROUP BY library_dedupe_key
    HAVING COUNT(*) > 1
  ) duplicated;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.influencer_library active dedupe check failed, duplicated keys: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.influencer_library_follow_log
  WHERE followed_at IS NULL
     OR follow_note IS NULL
     OR BTRIM(follow_note) = ''
     OR is_deleted IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.influencer_library_follow_log basic field check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    WITH latest_follow AS (
      SELECT DISTINCT ON (follow_log.influencer_library_id)
        follow_log.influencer_library_id,
        follow_log.followed_at::DATE AS last_followed_at,
        follow_log.follow_note
      FROM ads.influencer_library_follow_log AS follow_log
      WHERE follow_log.is_deleted = FALSE
      ORDER BY
        follow_log.influencer_library_id,
        follow_log.followed_at DESC,
        follow_log.created_at DESC,
        follow_log.id DESC
    )
    SELECT library.id
    FROM ads.influencer_library AS library
    JOIN latest_follow
      ON latest_follow.influencer_library_id = library.id
    WHERE library.is_deleted = FALSE
      AND (
        library.last_followed_at IS DISTINCT FROM latest_follow.last_followed_at
        OR library.follow_note IS DISTINCT FROM latest_follow.follow_note
      )
  ) mismatched_snapshot;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.influencer_library latest follow snapshot check failed, rows: %', v_invalid;
  END IF;

  IF ads.fn_influencer_library_parse_number('12.3万') <> 123000 THEN
    RAISE EXCEPTION 'ads.fn_influencer_library_parse_number 12.3万 check failed';
  END IF;

  RAISE NOTICE 'ads.influencer_library checks passed';
END;
$$;
