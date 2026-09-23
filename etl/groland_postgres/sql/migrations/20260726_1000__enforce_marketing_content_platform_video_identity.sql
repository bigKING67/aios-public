CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_external_video_active
  ON ads.marketing_content_platform_videos (
    platform,
    NULLIF(BTRIM(external_video_id), '')
  )
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_item_note_active
  ON ads.marketing_content_platform_videos (
    platform,
    COALESCE(NULLIF(BTRIM(account_id), ''), ''),
    COALESCE(NULLIF(BTRIM(external_item_id), ''), ''),
    COALESCE(NULLIF(BTRIM(external_note_id), ''), '')
  )
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NULL
    AND COALESCE(
      NULLIF(BTRIM(external_item_id), ''),
      NULLIF(BTRIM(external_note_id), '')
    ) IS NOT NULL;
