-- Postinstall contract check for the canonical platform-video identity guards.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/marketing_content_platform_video_identity_check.sql

DO $$
DECLARE
  v_external_index OID := to_regclass('ads.idx_marketing_content_platform_videos_external_video_active');
  v_fallback_index OID := to_regclass('ads.idx_marketing_content_platform_videos_item_note_active');
  v_external_definition TEXT;
  v_fallback_definition TEXT;
BEGIN
  IF v_external_index IS NULL OR v_fallback_index IS NULL THEN
    RAISE EXCEPTION 'canonical platform-video identity indexes are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid IN (v_external_index, v_fallback_index)
      AND (
        indrelid <> 'ads.marketing_content_platform_videos'::REGCLASS
        OR NOT indisunique
        OR NOT indisvalid
        OR NOT indisready
      )
  ) THEN
    RAISE EXCEPTION 'canonical platform-video identity indexes are not unique, valid, ready table guards';
  END IF;

  v_external_definition := LOWER(REGEXP_REPLACE(pg_get_indexdef(v_external_index), '\s+', ' ', 'g'));
  v_fallback_definition := LOWER(REGEXP_REPLACE(pg_get_indexdef(v_fallback_index), '\s+', ' ', 'g'));

  IF v_external_definition NOT LIKE '%nullif(btrim(external_video_id)%'
    OR v_external_definition NOT LIKE '%relation_status = ''active''%'
    OR v_external_definition NOT LIKE '%is not null%'
    OR v_external_definition LIKE '%asset_id%'
    OR v_external_definition LIKE '%account_id%'
    OR v_external_definition LIKE '%external_item_id%'
    OR v_external_definition LIKE '%external_note_id%' THEN
    RAISE EXCEPTION 'external-video identity index definition drifted';
  END IF;

  IF v_fallback_definition NOT LIKE '%coalesce(nullif(btrim(account_id)%'
    OR v_fallback_definition NOT LIKE '%coalesce(nullif(btrim(external_item_id)%'
    OR v_fallback_definition NOT LIKE '%coalesce(nullif(btrim(external_note_id)%'
    OR v_fallback_definition NOT LIKE '%nullif(btrim(external_video_id)%is null%'
    OR v_fallback_definition NOT LIKE '%relation_status = ''active''%'
    OR v_fallback_definition LIKE '%asset_id%' THEN
    RAISE EXCEPTION 'fallback platform-video identity index definition drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ads.marketing_content_platform_videos
    WHERE relation_status = 'active'
      AND NULLIF(BTRIM(external_video_id), '') IS NOT NULL
    GROUP BY platform, NULLIF(BTRIM(external_video_id), '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'active external-video identity duplicates remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ads.marketing_content_platform_videos
    WHERE relation_status = 'active'
      AND NULLIF(BTRIM(external_video_id), '') IS NULL
      AND COALESCE(
        NULLIF(BTRIM(external_item_id), ''),
        NULLIF(BTRIM(external_note_id), '')
      ) IS NOT NULL
    GROUP BY
      platform,
      COALESCE(NULLIF(BTRIM(account_id), ''), ''),
      COALESCE(NULLIF(BTRIM(external_item_id), ''), ''),
      COALESCE(NULLIF(BTRIM(external_note_id), ''), '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'active fallback platform-video identity duplicates remain';
  END IF;

  RAISE NOTICE 'canonical platform-video identity checks passed';
END;
$$;
