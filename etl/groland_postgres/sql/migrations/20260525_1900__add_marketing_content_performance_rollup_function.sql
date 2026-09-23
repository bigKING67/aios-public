CREATE OR REPLACE FUNCTION ads.refresh_marketing_content_asset_performance(
  p_asset_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  daily_rows BIGINT,
  lifetime_rows BIGINT,
  asset_snapshot_rows BIGINT,
  first_stat_date DATE,
  last_stat_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_daily_rows BIGINT := 0;
  v_lifetime_rows BIGINT := 0;
  v_asset_snapshot_rows BIGINT := 0;
  v_first_stat_date DATE;
  v_last_stat_date DATE;
  v_remembered_rows BIGINT;
BEGIN
  IF p_start_date IS NOT NULL
     AND p_end_date IS NOT NULL
     AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date cannot be later than p_end_date';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS marketing_content_rollup_affected_assets (
    asset_id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  TRUNCATE TABLE marketing_content_rollup_affected_assets;

  WITH ad_source AS (
    SELECT
      ad.stat_date,
      ad.asset_id,
      COALESCE(NULLIF(ad.ad_platform, ''), 'unknown') AS platform,
      COALESCE(NULLIF(ad.account_id, ''), '') AS account_id,
      MAX(ad.account_name) AS account_name,
      COUNT(DISTINCT NULLIF(COALESCE(ad.ad_material_id::TEXT, ad.external_material_id), ''))::INTEGER AS material_count,
      COUNT(DISTINCT NULLIF(COALESCE(ad.platform_video_id::TEXT, ad.external_video_id), ''))::INTEGER AS video_count,
      COALESCE(SUM(ad.impressions), 0)::BIGINT AS impressions,
      0::BIGINT AS plays,
      COALESCE(SUM(ad.clicks), 0)::BIGINT AS clicks,
      COALESCE(SUM(ad.conversions), 0)::BIGINT AS conversions,
      COALESCE(SUM(ad.cost), 0)::NUMERIC(14, 2) AS cost,
      COALESCE(SUM(ad.gmv), 0)::NUMERIC(14, 2) AS gmv,
      COALESCE(SUM(ad.likes), 0)::BIGINT AS likes,
      COALESCE(SUM(ad.comments), 0)::BIGINT AS comments,
      COALESCE(SUM(ad.shares), 0)::BIGINT AS shares,
      0::BIGINT AS collects,
      COALESCE(SUM(ad.follows), 0)::BIGINT AS follows,
      COALESCE(SUM(ad.live_room_entries), 0)::BIGINT AS live_room_entries
    FROM dwd.marketing_content_ad_material_stats_di ad
    WHERE ad.asset_id IS NOT NULL
      AND ad.match_status = 'matched'
      AND (p_asset_id IS NULL OR ad.asset_id = p_asset_id)
      AND (p_start_date IS NULL OR ad.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR ad.stat_date <= p_end_date)
    GROUP BY
      ad.stat_date,
      ad.asset_id,
      COALESCE(NULLIF(ad.ad_platform, ''), 'unknown'),
      COALESCE(NULLIF(ad.account_id, ''), '')
  ),
  video_source AS (
    SELECT
      video.stat_date,
      video.asset_id,
      COALESCE(NULLIF(video.platform, ''), 'unknown') AS platform,
      COALESCE(NULLIF(video.account_id, ''), '') AS account_id,
      MAX(video.account_name) AS account_name,
      0::INTEGER AS material_count,
      COUNT(DISTINCT NULLIF(COALESCE(
        video.platform_video_id::TEXT,
        video.external_video_id,
        video.external_note_id,
        video.external_item_id
      ), ''))::INTEGER AS video_count,
      COALESCE(SUM(video.impressions), 0)::BIGINT AS impressions,
      COALESCE(SUM(COALESCE(video.plays, video.reads, 0)), 0)::BIGINT AS plays,
      COALESCE(SUM(video.clicks), 0)::BIGINT AS clicks,
      0::BIGINT AS conversions,
      0::NUMERIC(14, 2) AS cost,
      0::NUMERIC(14, 2) AS gmv,
      COALESCE(SUM(video.likes), 0)::BIGINT AS likes,
      COALESCE(SUM(video.comments), 0)::BIGINT AS comments,
      COALESCE(SUM(video.shares), 0)::BIGINT AS shares,
      COALESCE(SUM(video.collects), 0)::BIGINT AS collects,
      COALESCE(SUM(video.follows), 0)::BIGINT AS follows,
      0::BIGINT AS live_room_entries
    FROM dwd.marketing_content_platform_video_stats_di video
    WHERE video.asset_id IS NOT NULL
      AND video.match_status = 'matched'
      AND (p_asset_id IS NULL OR video.asset_id = p_asset_id)
      AND (p_start_date IS NULL OR video.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR video.stat_date <= p_end_date)
    GROUP BY
      video.stat_date,
      video.asset_id,
      COALESCE(NULLIF(video.platform, ''), 'unknown'),
      COALESCE(NULLIF(video.account_id, ''), '')
  ),
  daily_source AS (
    SELECT
      source.stat_date,
      source.asset_id,
      source.platform,
      source.account_id,
      MAX(source.account_name) AS account_name,
      COALESCE(SUM(source.material_count), 0)::INTEGER AS material_count,
      COALESCE(SUM(source.video_count), 0)::INTEGER AS video_count,
      COALESCE(SUM(source.impressions), 0)::BIGINT AS impressions,
      COALESCE(SUM(source.plays), 0)::BIGINT AS plays,
      COALESCE(SUM(source.clicks), 0)::BIGINT AS clicks,
      COALESCE(SUM(source.conversions), 0)::BIGINT AS conversions,
      COALESCE(SUM(source.cost), 0)::NUMERIC(14, 2) AS cost,
      COALESCE(SUM(source.gmv), 0)::NUMERIC(14, 2) AS gmv,
      COALESCE(SUM(source.likes), 0)::BIGINT AS likes,
      COALESCE(SUM(source.comments), 0)::BIGINT AS comments,
      COALESCE(SUM(source.shares), 0)::BIGINT AS shares,
      COALESCE(SUM(source.collects), 0)::BIGINT AS collects,
      COALESCE(SUM(source.follows), 0)::BIGINT AS follows,
      COALESCE(SUM(source.live_room_entries), 0)::BIGINT AS live_room_entries
    FROM (
      SELECT * FROM ad_source
      UNION ALL
      SELECT * FROM video_source
    ) source
    GROUP BY
      source.stat_date,
      source.asset_id,
      source.platform,
      source.account_id
  ),
  daily_enriched AS (
    SELECT
      daily.stat_date,
      daily.asset_id,
      daily.platform,
      daily.account_id,
      daily.account_name,
      asset.product_name,
      asset.creator_name,
      daily.material_count,
      daily.video_count,
      daily.impressions,
      daily.plays,
      daily.clicks,
      daily.conversions,
      daily.cost,
      daily.gmv,
      CASE WHEN daily.cost > 0 THEN daily.gmv / NULLIF(daily.cost, 0) ELSE NULL END AS roi,
      CASE WHEN daily.impressions > 0 THEN daily.clicks::NUMERIC / NULLIF(daily.impressions, 0) ELSE NULL END AS ctr,
      CASE WHEN daily.clicks > 0 THEN daily.conversions::NUMERIC / NULLIF(daily.clicks, 0) ELSE NULL END AS cvr,
      daily.likes,
      daily.comments,
      daily.shares,
      daily.collects,
      daily.follows,
      daily.live_room_entries,
      CASE WHEN daily.impressions > 0 THEN daily.live_room_entries::NUMERIC / NULLIF(daily.impressions, 0) ELSE NULL END AS live_room_entry_rate
    FROM daily_source daily
    JOIN ads.marketing_content_assets asset
      ON asset.asset_id = daily.asset_id
     AND asset.is_deleted = FALSE
  ),
  upserted AS (
    INSERT INTO dws.marketing_content_asset_daily_summary (
      stat_date,
      asset_id,
      platform,
      account_id,
      account_name,
      product_name,
      creator_name,
      material_count,
      video_count,
      impressions,
      plays,
      clicks,
      conversions,
      cost,
      gmv,
      roi,
      ctr,
      cvr,
      likes,
      comments,
      shares,
      collects,
      follows,
      live_room_entries,
      live_room_entry_rate,
      updated_at
    )
    SELECT
      stat_date,
      asset_id,
      platform,
      account_id,
      account_name,
      product_name,
      creator_name,
      material_count,
      video_count,
      impressions,
      plays,
      clicks,
      conversions,
      cost,
      gmv,
      roi,
      ctr,
      cvr,
      likes,
      comments,
      shares,
      collects,
      follows,
      live_room_entries,
      live_room_entry_rate,
      CURRENT_TIMESTAMP
    FROM daily_enriched
    ON CONFLICT (stat_date, asset_id, platform, account_id)
    DO UPDATE SET
      account_name = EXCLUDED.account_name,
      product_name = EXCLUDED.product_name,
      creator_name = EXCLUDED.creator_name,
      material_count = EXCLUDED.material_count,
      video_count = EXCLUDED.video_count,
      impressions = EXCLUDED.impressions,
      plays = EXCLUDED.plays,
      clicks = EXCLUDED.clicks,
      conversions = EXCLUDED.conversions,
      cost = EXCLUDED.cost,
      gmv = EXCLUDED.gmv,
      roi = EXCLUDED.roi,
      ctr = EXCLUDED.ctr,
      cvr = EXCLUDED.cvr,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      shares = EXCLUDED.shares,
      collects = EXCLUDED.collects,
      follows = EXCLUDED.follows,
      live_room_entries = EXCLUDED.live_room_entries,
      live_room_entry_rate = EXCLUDED.live_room_entry_rate,
      updated_at = CURRENT_TIMESTAMP
    RETURNING asset_id, stat_date
  ),
  remembered AS (
    INSERT INTO marketing_content_rollup_affected_assets(asset_id)
    SELECT DISTINCT upserted.asset_id
    FROM upserted
    ON CONFLICT (asset_id) DO NOTHING
    RETURNING asset_id
  )
  SELECT
    COUNT(*)::BIGINT,
    MIN(stat_date),
    MAX(stat_date),
    (SELECT COUNT(*)::BIGINT FROM remembered)
  INTO v_daily_rows, v_first_stat_date, v_last_stat_date, v_remembered_rows
  FROM upserted;

  WITH base AS (
    SELECT
      daily.asset_id,
      MIN(daily.stat_date) AS first_stat_date,
      MAX(daily.stat_date) AS last_stat_date,
      COUNT(DISTINCT NULLIF(daily.platform, ''))::INTEGER AS platform_count,
      COUNT(DISTINCT NULLIF(daily.account_id, ''))::INTEGER AS account_count,
      COALESCE(SUM(daily.material_count), 0)::INTEGER AS material_count,
      COALESCE(SUM(daily.video_count), 0)::INTEGER AS video_count,
      COALESCE(SUM(daily.impressions), 0)::BIGINT AS total_impressions,
      COALESCE(SUM(daily.plays), 0)::BIGINT AS total_plays,
      COALESCE(SUM(daily.clicks), 0)::BIGINT AS total_clicks,
      COALESCE(SUM(daily.conversions), 0)::BIGINT AS total_conversions,
      COALESCE(SUM(daily.cost), 0)::NUMERIC(14, 2) AS total_cost,
      COALESCE(SUM(daily.gmv), 0)::NUMERIC(14, 2) AS total_gmv
    FROM dws.marketing_content_asset_daily_summary daily
    JOIN marketing_content_rollup_affected_assets affected ON affected.asset_id = daily.asset_id
    GROUP BY daily.asset_id
  ),
  lifetime AS (
    SELECT
      base.asset_id,
      base.first_stat_date,
      base.last_stat_date,
      base.platform_count,
      base.account_count,
      base.material_count,
      base.video_count,
      base.total_impressions,
      base.total_plays,
      base.total_clicks,
      base.total_conversions,
      base.total_cost,
      base.total_gmv,
      CASE WHEN base.total_cost > 0 THEN base.total_gmv / NULLIF(base.total_cost, 0) ELSE NULL END AS total_roi,
      COALESCE(SUM(daily.cost) FILTER (
        WHERE daily.stat_date >= base.last_stat_date - INTERVAL '6 days'
      ), 0)::NUMERIC(14, 2) AS last_7d_cost,
      COALESCE(SUM(daily.gmv) FILTER (
        WHERE daily.stat_date >= base.last_stat_date - INTERVAL '6 days'
      ), 0)::NUMERIC(14, 2) AS last_7d_gmv,
      CASE
        WHEN COALESCE(SUM(daily.cost) FILTER (
          WHERE daily.stat_date >= base.last_stat_date - INTERVAL '6 days'
        ), 0) > 0
          THEN COALESCE(SUM(daily.gmv) FILTER (
            WHERE daily.stat_date >= base.last_stat_date - INTERVAL '6 days'
          ), 0) / NULLIF(COALESCE(SUM(daily.cost) FILTER (
            WHERE daily.stat_date >= base.last_stat_date - INTERVAL '6 days'
          ), 0), 0)
        ELSE NULL
      END AS last_7d_roi,
      COALESCE(SUM(daily.cost) FILTER (
        WHERE daily.stat_date >= base.last_stat_date - INTERVAL '29 days'
      ), 0)::NUMERIC(14, 2) AS last_30d_cost,
      COALESCE(SUM(daily.gmv) FILTER (
        WHERE daily.stat_date >= base.last_stat_date - INTERVAL '29 days'
      ), 0)::NUMERIC(14, 2) AS last_30d_gmv,
      CASE
        WHEN COALESCE(SUM(daily.cost) FILTER (
          WHERE daily.stat_date >= base.last_stat_date - INTERVAL '29 days'
        ), 0) > 0
          THEN COALESCE(SUM(daily.gmv) FILTER (
            WHERE daily.stat_date >= base.last_stat_date - INTERVAL '29 days'
          ), 0) / NULLIF(COALESCE(SUM(daily.cost) FILTER (
            WHERE daily.stat_date >= base.last_stat_date - INTERVAL '29 days'
          ), 0), 0)
        ELSE NULL
      END AS last_30d_roi
    FROM base
    JOIN dws.marketing_content_asset_daily_summary daily ON daily.asset_id = base.asset_id
    GROUP BY
      base.asset_id,
      base.first_stat_date,
      base.last_stat_date,
      base.platform_count,
      base.account_count,
      base.material_count,
      base.video_count,
      base.total_impressions,
      base.total_plays,
      base.total_clicks,
      base.total_conversions,
      base.total_cost,
      base.total_gmv
  ),
  upserted AS (
    INSERT INTO dws.marketing_content_asset_lifetime_summary (
      asset_id,
      first_stat_date,
      last_stat_date,
      platform_count,
      account_count,
      material_count,
      video_count,
      total_impressions,
      total_plays,
      total_clicks,
      total_conversions,
      total_cost,
      total_gmv,
      total_roi,
      last_7d_cost,
      last_7d_gmv,
      last_7d_roi,
      last_30d_cost,
      last_30d_gmv,
      last_30d_roi,
      updated_at
    )
    SELECT
      lifetime.asset_id,
      lifetime.first_stat_date,
      lifetime.last_stat_date,
      lifetime.platform_count,
      lifetime.account_count,
      lifetime.material_count,
      lifetime.video_count,
      lifetime.total_impressions,
      lifetime.total_plays,
      lifetime.total_clicks,
      lifetime.total_conversions,
      lifetime.total_cost,
      lifetime.total_gmv,
      lifetime.total_roi,
      lifetime.last_7d_cost,
      lifetime.last_7d_gmv,
      lifetime.last_7d_roi,
      lifetime.last_30d_cost,
      lifetime.last_30d_gmv,
      lifetime.last_30d_roi,
      CURRENT_TIMESTAMP
    FROM lifetime
    ON CONFLICT (asset_id)
    DO UPDATE SET
      first_stat_date = EXCLUDED.first_stat_date,
      last_stat_date = EXCLUDED.last_stat_date,
      platform_count = EXCLUDED.platform_count,
      account_count = EXCLUDED.account_count,
      material_count = EXCLUDED.material_count,
      video_count = EXCLUDED.video_count,
      total_impressions = EXCLUDED.total_impressions,
      total_plays = EXCLUDED.total_plays,
      total_clicks = EXCLUDED.total_clicks,
      total_conversions = EXCLUDED.total_conversions,
      total_cost = EXCLUDED.total_cost,
      total_gmv = EXCLUDED.total_gmv,
      total_roi = EXCLUDED.total_roi,
      last_7d_cost = EXCLUDED.last_7d_cost,
      last_7d_gmv = EXCLUDED.last_7d_gmv,
      last_7d_roi = EXCLUDED.last_7d_roi,
      last_30d_cost = EXCLUDED.last_30d_cost,
      last_30d_gmv = EXCLUDED.last_30d_gmv,
      last_30d_roi = EXCLUDED.last_30d_roi,
      updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT COUNT(*)::BIGINT
  INTO v_lifetime_rows
  FROM upserted;

  WITH snapshot AS (
    SELECT
      daily.asset_id,
      COALESCE(SUM(daily.impressions), 0)::BIGINT AS impressions,
      COALESCE(SUM(daily.clicks), 0)::BIGINT AS clicks,
      COALESCE(SUM(daily.conversions), 0)::BIGINT AS conversions,
      COALESCE(SUM(daily.cost), 0)::NUMERIC(14, 2) AS spend,
      COALESCE(SUM(daily.gmv), 0)::NUMERIC(14, 2) AS gmv
    FROM dws.marketing_content_asset_daily_summary daily
    JOIN marketing_content_rollup_affected_assets affected ON affected.asset_id = daily.asset_id
    GROUP BY daily.asset_id
  ),
  updated AS (
    UPDATE ads.marketing_content_assets asset
    SET
      spend = snapshot.spend,
      gmv = snapshot.gmv,
      roi = CASE WHEN snapshot.spend > 0 THEN snapshot.gmv / NULLIF(snapshot.spend, 0) ELSE NULL END,
      ctr = CASE WHEN snapshot.impressions > 0 THEN snapshot.clicks::NUMERIC / NULLIF(snapshot.impressions, 0) ELSE NULL END,
      cvr = CASE WHEN snapshot.clicks > 0 THEN snapshot.conversions::NUMERIC / NULLIF(snapshot.clicks, 0) ELSE NULL END,
      profile_status = CASE
        WHEN asset.profile_status IN ('incomplete', 'basic_complete', 'platform_bound') THEN 'performance_ready'
        ELSE asset.profile_status
      END
    FROM snapshot
    WHERE asset.asset_id = snapshot.asset_id
      AND asset.is_deleted = FALSE
    RETURNING 1
  )
  SELECT COUNT(*)::BIGINT
  INTO v_asset_snapshot_rows
  FROM updated;

  daily_rows := COALESCE(v_daily_rows, 0);
  lifetime_rows := COALESCE(v_lifetime_rows, 0);
  asset_snapshot_rows := COALESCE(v_asset_snapshot_rows, 0);
  first_stat_date := v_first_stat_date;
  last_stat_date := v_last_stat_date;
  RETURN NEXT;
END;
$$;
