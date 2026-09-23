CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_mc_platform_video_identity_active
  ON ads.marketing_content_platform_videos (
    platform,
    COALESCE(account_id, ''),
    COALESCE(external_video_id, ''),
    COALESCE(external_item_id, ''),
    COALESCE(external_note_id, '')
  )
  WHERE relation_status = 'active'
    AND COALESCE(
      NULLIF(external_video_id, ''),
      NULLIF(external_item_id, ''),
      NULLIF(external_note_id, '')
    ) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_mc_ad_material_identity_active
  ON ads.marketing_content_ad_materials (
    ad_platform,
    COALESCE(account_id, ''),
    external_material_id
  )
  WHERE relation_status = 'active';

CREATE INDEX IF NOT EXISTS idx_dwd_mc_ad_stats_match_lookup
  ON dwd.marketing_content_ad_material_stats_di (
    ad_platform,
    COALESCE(account_id, ''),
    external_material_id,
    match_status
  );

CREATE INDEX IF NOT EXISTS idx_dwd_mc_ad_stats_unmatched_queue
  ON dwd.marketing_content_ad_material_stats_di (
    match_status,
    ad_platform,
    COALESCE(account_id, ''),
    external_material_id
  )
  WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous');

CREATE INDEX IF NOT EXISTS idx_dwd_mc_video_stats_unmatched_queue
  ON dwd.marketing_content_platform_video_stats_di (
    match_status,
    platform,
    COALESCE(account_id, ''),
    COALESCE(external_video_id, ''),
    COALESCE(external_item_id, ''),
    COALESCE(external_note_id, '')
  )
  WHERE match_status IN ('unmatched', 'pending_confirm', 'ambiguous');

CREATE INDEX IF NOT EXISTS idx_dws_mc_asset_daily_asset_date
  ON dws.marketing_content_asset_daily_summary(asset_id, stat_date DESC);

CREATE INDEX IF NOT EXISTS idx_dws_mc_asset_lifetime_roi
  ON dws.marketing_content_asset_lifetime_summary(
    total_roi DESC NULLS LAST,
    total_cost DESC,
    last_stat_date DESC NULLS LAST
  );

CREATE INDEX IF NOT EXISTS idx_ads_mc_assets_performance
  ON ads.marketing_content_assets(
    roi DESC NULLS LAST,
    spend DESC NULLS LAST,
    updated_at DESC
  )
  WHERE is_deleted = FALSE;
