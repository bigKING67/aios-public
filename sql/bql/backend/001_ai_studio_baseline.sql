-- AIOS 百雀羚 AI 创作中心 baseline (bql_aios).
-- Generated from the live groland schema on 2026-10-22 (pg_dump --schema-only of the
-- AI studio allowlist, PostgreSQL 17.8). See
-- .trellis/tasks/10-22-bql-ai-studio-db-rebuild/design.md (D1) for the allowlist.
-- Empty compatibility tables (ad materials, dwd/dws stats) stay until the own-asset
-- table is restructured; kept code reads them without existence checks.

-- content_segments_confirmed_no_overlap is a gist exclusion constraint on uuid.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;

-- Functions

CREATE OR REPLACE FUNCTION ads.marketing_content_assets_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION ads.refresh_marketing_content_asset_performance(p_asset_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(daily_rows bigint, lifetime_rows bigint, asset_snapshot_rows bigint, first_stat_date date, last_stat_date date)
 LANGUAGE plpgsql
AS $function$
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
$function$;

-- Auth, content assets, production and AI studio tables

CREATE TABLE ads.content_asset_lineage (
    output_asset_id uuid NOT NULL,
    run_id uuid NOT NULL,
    ordinal integer NOT NULL,
    segment_id uuid NOT NULL,
    source_asset_id uuid NOT NULL,
    source_content_hash text NOT NULL,
    source_start_ms integer NOT NULL,
    source_end_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_asset_lineage_check CHECK ((source_end_ms > source_start_ms)),
    CONSTRAINT content_asset_lineage_ordinal_check CHECK ((ordinal >= 1)),
    CONSTRAINT content_asset_lineage_source_content_hash_check CHECK ((source_content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_asset_lineage_source_start_ms_check CHECK ((source_start_ms >= 0))
);

CREATE TABLE ads.content_production_jobs (
    job_id uuid NOT NULL,
    project_id uuid NOT NULL,
    revision integer NOT NULL,
    preview boolean NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    claim_token uuid,
    heartbeat_at timestamp with time zone,
    stage text DEFAULT '等待制作'::text NOT NULL,
    output_object_key text,
    receipt jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT content_production_jobs_check CHECK (((status <> 'completed'::text) OR ((output_object_key IS NOT NULL) AND (receipt IS NOT NULL)))),
    CONSTRAINT content_production_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text, 'cancelled'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE ads.content_production_plan_attempts (
    attempt_id uuid NOT NULL,
    run_id uuid NOT NULL,
    execution_version integer NOT NULL,
    input jsonb NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    result jsonb,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT content_production_plan_attempts_execution_version_check CHECK ((execution_version > 0)),
    CONSTRAINT content_production_plan_attempts_input_check CHECK ((jsonb_typeof(input) = 'object'::text)),
    CONSTRAINT content_production_plan_attempts_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'superseded'::text])))
);

CREATE TABLE ads.content_production_plans (
    run_id uuid NOT NULL,
    revision integer NOT NULL,
    execution_version integer NOT NULL,
    document jsonb NOT NULL,
    origin text NOT NULL,
    attempt_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_production_plans_document_check CHECK ((jsonb_typeof(document) = 'object'::text)),
    CONSTRAINT content_production_plans_execution_version_check CHECK ((execution_version > 0)),
    CONSTRAINT content_production_plans_origin_check CHECK ((origin = ANY (ARRAY['model'::text, 'user'::text]))),
    CONSTRAINT content_production_plans_revision_check CHECK ((revision > 0))
);

CREATE TABLE ads.content_production_projects (
    project_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    title text NOT NULL,
    revision integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_production_projects_revision_check CHECK ((revision > 0))
);

CREATE TABLE ads.content_production_revisions (
    project_id uuid NOT NULL,
    revision integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_production_revisions_revision_check CHECK ((revision > 0)),
    CONSTRAINT content_production_revisions_snapshot_check CHECK ((jsonb_typeof(snapshot) = 'object'::text))
);

CREATE TABLE ads.content_production_run_renders (
    run_id uuid NOT NULL,
    execution_version integer NOT NULL,
    plan_revision integer NOT NULL,
    job_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_production_run_renders_execution_version_check CHECK ((execution_version > 0))
);

CREATE TABLE ads.content_production_runs (
    run_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    idempotency_key text NOT NULL,
    request jsonb NOT NULL,
    source_snapshot jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    execution_version integer DEFAULT 1 NOT NULL,
    plan_revision integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'planning'::text NOT NULL,
    waiting_reason text,
    active_attempt uuid,
    project_id uuid,
    project_revision integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    render_job_id uuid,
    pause_requested boolean DEFAULT false NOT NULL,
    CONSTRAINT content_production_runs_check CHECK (((project_id IS NULL) = (project_revision IS NULL))),
    CONSTRAINT content_production_runs_delivery_check CHECK (((status <> 'succeeded'::text) OR (render_job_id IS NOT NULL))),
    CONSTRAINT content_production_runs_execution_version_check CHECK ((execution_version > 0)),
    CONSTRAINT content_production_runs_idempotency_key_check CHECK (((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 100))),
    CONSTRAINT content_production_runs_pause_check CHECK (((NOT pause_requested) OR (status = 'running'::text))),
    CONSTRAINT content_production_runs_plan_revision_check CHECK ((plan_revision >= 0)),
    CONSTRAINT content_production_runs_request_check CHECK ((jsonb_typeof(request) = 'object'::text)),
    CONSTRAINT content_production_runs_source_snapshot_check CHECK ((jsonb_typeof(source_snapshot) = 'object'::text)),
    CONSTRAINT content_production_runs_stage_check CHECK ((stage = ANY (ARRAY['planning'::text, 'production'::text, 'inspection'::text, 'delivery'::text]))),
    CONSTRAINT content_production_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'waiting'::text, 'paused'::text, 'cancelling'::text, 'cancelled'::text, 'failed'::text, 'succeeded'::text]))),
    CONSTRAINT content_production_runs_version_check CHECK ((version > 0))
);

CREATE TABLE ads.content_production_semantic_jobs (
    job_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    catalog_id uuid NOT NULL,
    request_hash text NOT NULL,
    snapshot jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT '等待语义分析'::text NOT NULL,
    claim_token uuid,
    heartbeat_at timestamp with time zone,
    result jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT content_production_semantic_jobs_check CHECK (((status = 'completed'::text) = (result IS NOT NULL))),
    CONSTRAINT content_production_semantic_jobs_request_hash_check CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_production_semantic_jobs_snapshot_check CHECK ((jsonb_typeof(snapshot) = 'object'::text)),
    CONSTRAINT content_production_semantic_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text, 'cancelled'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE ads.content_production_shot_catalogs (
    catalog_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    asset_id uuid NOT NULL,
    content_hash text NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_production_shot_catalogs_content_hash_check CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_production_shot_catalogs_snapshot_check CHECK ((jsonb_typeof(snapshot) = 'object'::text))
);

CREATE TABLE ads.content_production_shot_jobs (
    job_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    asset_id uuid NOT NULL,
    raw_sha256 text NOT NULL,
    snapshot jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT '等待提取'::text NOT NULL,
    claim_token uuid,
    heartbeat_at timestamp with time zone,
    catalog_id uuid,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT content_production_shot_jobs_check CHECK (((status <> 'completed'::text) OR (catalog_id IS NOT NULL))),
    CONSTRAINT content_production_shot_jobs_raw_sha256_check CHECK ((raw_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_production_shot_jobs_snapshot_check CHECK ((jsonb_typeof(snapshot) = 'object'::text)),
    CONSTRAINT content_production_shot_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text, 'cancelled'::text, 'completed'::text, 'failed'::text])))
);

CREATE TABLE ads.content_remix_batch_runs (
    batch_id uuid NOT NULL,
    ordinal integer NOT NULL,
    run_id uuid NOT NULL,
    combination_hash text NOT NULL,
    segments jsonb NOT NULL,
    output_asset_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_remix_batch_runs_combination_hash_check CHECK ((combination_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_remix_batch_runs_ordinal_check CHECK ((ordinal >= 1)),
    CONSTRAINT content_remix_batch_runs_segments_check CHECK (((jsonb_typeof(segments) = 'array'::text) AND (jsonb_array_length(segments) >= 1)))
);

CREATE TABLE ads.content_remix_batches (
    batch_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_digest text NOT NULL,
    task_type text DEFAULT 'framework_remix'::text NOT NULL,
    preset_key text NOT NULL,
    preset_version integer NOT NULL,
    structure jsonb NOT NULL,
    constraints jsonb NOT NULL,
    requested_count integer NOT NULL,
    planned_count integer NOT NULL,
    seed bigint NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    shortfall_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_remix_batches_check CHECK (((planned_count >= 1) AND (planned_count <= requested_count))),
    CONSTRAINT content_remix_batches_check1 CHECK (((planned_count < requested_count) = (shortfall_reason IS NOT NULL))),
    CONSTRAINT content_remix_batches_constraints_check CHECK ((jsonb_typeof(constraints) = 'object'::text)),
    CONSTRAINT content_remix_batches_idempotency_key_check CHECK (((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 100))),
    CONSTRAINT content_remix_batches_owner_user_id_check CHECK (((length(owner_user_id) >= 1) AND (length(owner_user_id) <= 200))),
    CONSTRAINT content_remix_batches_request_digest_check CHECK ((request_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_remix_batches_requested_count_check CHECK (((requested_count >= 1) AND (requested_count <= 100))),
    CONSTRAINT content_remix_batches_shortfall_reason_check CHECK (((shortfall_reason IS NULL) OR ((length(shortfall_reason) >= 1) AND (length(shortfall_reason) <= 1000)))),
    CONSTRAINT content_remix_batches_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'partially_failed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT content_remix_batches_structure_check CHECK ((jsonb_typeof(structure) = 'object'::text)),
    CONSTRAINT content_remix_batches_task_type_check CHECK ((task_type = 'framework_remix'::text))
);

CREATE TABLE ads.content_segment_presets (
    preset_key text NOT NULL,
    version integer NOT NULL,
    dimension text NOT NULL,
    name text NOT NULL,
    labels jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_segment_presets_dimension_check CHECK ((dimension = ANY (ARRAY['framework'::text, 'picture'::text, 'custom'::text, 'selling_point'::text]))),
    CONSTRAINT content_segment_presets_labels_check CHECK (((jsonb_typeof(labels) = 'array'::text) AND ((jsonb_array_length(labels) >= 1) AND (jsonb_array_length(labels) <= 50)))),
    CONSTRAINT content_segment_presets_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100))),
    CONSTRAINT content_segment_presets_preset_key_check CHECK ((preset_key ~ '^[a-z][a-z0-9_]{0,63}$'::text)),
    CONSTRAINT content_segment_presets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text]))),
    CONSTRAINT content_segment_presets_version_check CHECK ((version > 0))
);

CREATE TABLE ads.content_segment_suggestion_jobs (
    job_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    asset_id uuid NOT NULL,
    source_content_hash text NOT NULL,
    preset_key text NOT NULL,
    preset_version integer NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT '等待切段'::text NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    claim_token uuid,
    heartbeat_at timestamp with time zone,
    error_code text,
    error_message text,
    model text,
    prompt_version text,
    request_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    usage jsonb,
    result_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_segment_suggestion_jobs_attempt_check CHECK ((attempt >= 0)),
    CONSTRAINT content_segment_suggestion_jobs_check CHECK (((status <> 'succeeded'::text) OR (result_summary IS NOT NULL))),
    CONSTRAINT content_segment_suggestion_jobs_check1 CHECK (((status <> 'failed'::text) OR (error_code IS NOT NULL))),
    CONSTRAINT content_segment_suggestion_jobs_check2 CHECK (((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'cancelled'::text])) = (finished_at IS NOT NULL))),
    CONSTRAINT content_segment_suggestion_jobs_error_code_check CHECK (((error_code IS NULL) OR (error_code ~ '^[a-z][a-z0-9_]{0,63}$'::text))),
    CONSTRAINT content_segment_suggestion_jobs_error_message_check CHECK (((error_message IS NULL) OR (length(error_message) <= 500))),
    CONSTRAINT content_segment_suggestion_jobs_model_check CHECK (((model IS NULL) OR ((length(model) >= 1) AND (length(model) <= 200)))),
    CONSTRAINT content_segment_suggestion_jobs_owner_user_id_check CHECK (((length(owner_user_id) >= 1) AND (length(owner_user_id) <= 200))),
    CONSTRAINT content_segment_suggestion_jobs_prompt_version_check CHECK (((prompt_version IS NULL) OR ((length(prompt_version) >= 1) AND (length(prompt_version) <= 100)))),
    CONSTRAINT content_segment_suggestion_jobs_request_settings_check CHECK ((jsonb_typeof(request_settings) = 'object'::text)),
    CONSTRAINT content_segment_suggestion_jobs_result_summary_check CHECK (((result_summary IS NULL) OR (jsonb_typeof(result_summary) = 'object'::text))),
    CONSTRAINT content_segment_suggestion_jobs_source_content_hash_check CHECK ((source_content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_segment_suggestion_jobs_stage_check CHECK (((length(stage) >= 1) AND (length(stage) <= 100))),
    CONSTRAINT content_segment_suggestion_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT content_segment_suggestion_jobs_usage_check CHECK (((usage IS NULL) OR (jsonb_typeof(usage) = 'object'::text)))
);

CREATE TABLE ads.content_segments (
    segment_id uuid NOT NULL,
    owner_user_id text NOT NULL,
    asset_id uuid NOT NULL,
    source_content_hash text NOT NULL,
    source_duration_ms integer,
    start_ms integer NOT NULL,
    end_ms integer NOT NULL,
    preset_key text NOT NULL,
    preset_version integer NOT NULL,
    label_key text NOT NULL,
    product_name text,
    origin text NOT NULL,
    status text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    confirmed_by text,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    continues_previous boolean DEFAULT false NOT NULL,
    additional_label_keys text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT content_segments_additional_labels_check CHECK (((cardinality(additional_label_keys) <= 31) AND (COALESCE(array_ndims(additional_label_keys), 1) = 1) AND (array_position(additional_label_keys, NULL::text) IS NULL) AND (array_position(additional_label_keys, ''::text) IS NULL) AND (NOT (label_key = ANY (additional_label_keys))))),
    CONSTRAINT content_segments_check CHECK ((start_ms < end_ms)),
    CONSTRAINT content_segments_check1 CHECK (((status <> 'confirmed'::text) OR ((confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL)))),
    CONSTRAINT content_segments_evidence_check CHECK ((jsonb_typeof(evidence) = 'object'::text)),
    CONSTRAINT content_segments_label_key_check CHECK (((length(label_key) >= 1) AND (length(label_key) <= 64))),
    CONSTRAINT content_segments_origin_check CHECK ((origin = ANY (ARRAY['ai'::text, 'human'::text]))),
    CONSTRAINT content_segments_owner_user_id_check CHECK (((length(owner_user_id) >= 1) AND (length(owner_user_id) <= 200))),
    CONSTRAINT content_segments_product_name_check CHECK (((product_name IS NULL) OR ((length(product_name) >= 1) AND (length(product_name) <= 200)))),
    CONSTRAINT content_segments_revision_check CHECK ((revision > 0)),
    CONSTRAINT content_segments_source_content_hash_check CHECK ((source_content_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT content_segments_source_duration_ms_check CHECK (((source_duration_ms IS NULL) OR (source_duration_ms > 0))),
    CONSTRAINT content_segments_start_ms_check CHECK ((start_ms >= 0)),
    CONSTRAINT content_segments_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'confirmed'::text, 'rejected'::text, 'stale'::text])))
);

CREATE TABLE ads.marketing_content_ad_materials (
    ad_material_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    platform_video_id uuid,
    ad_platform text NOT NULL,
    account_id text,
    account_name text,
    advertiser_id text,
    external_material_id text NOT NULL,
    external_video_id text,
    material_name text,
    material_title text,
    material_cover_url text,
    material_status text DEFAULT 'unknown'::text NOT NULL,
    created_at_on_platform timestamp with time zone,
    first_seen_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    relation_status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    confidence numeric(5,2),
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delivery_mode text,
    objective text,
    objective_source text,
    performance_source_table text,
    last_performance_seen_at timestamp with time zone,
    data_quality_status text,
    CONSTRAINT marketing_content_ad_materials_delivery_mode_check CHECK (((delivery_mode IS NULL) OR (delivery_mode = 'qianchuan_all_domain'::text))),
    CONSTRAINT marketing_content_ad_materials_objective_check CHECK (((objective IS NULL) OR (objective = ANY (ARRAY['product_all_domain_shortvideo'::text, 'live_all_domain_shortvideo'::text, 'unknown'::text])))),
    CONSTRAINT marketing_content_ad_materials_quality_status_check CHECK (((data_quality_status IS NULL) OR (data_quality_status = ANY (ARRAY['ok'::text, 'missing_binding'::text, 'duplicate_binding'::text, 'duplicate_material_date'::text, 'cross_source_conflict'::text, 'insufficient_data'::text])))),
    CONSTRAINT marketing_content_ad_materials_relation_status_check CHECK ((relation_status = ANY (ARRAY['active'::text, 'pending_confirm'::text, 'rejected'::text, 'archived'::text]))),
    CONSTRAINT marketing_content_ad_materials_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'api_upload'::text, 'api_import'::text, 'report_import'::text, 'fuzzy_match_confirmed'::text])))
);

COMMENT ON TABLE ads.marketing_content_ad_materials IS '营销内容广告素材关联表：沉淀外部广告平台素材、账户、视频素材与内容资产的匹配关系。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.ad_material_id IS '广告素材关联记录主键。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.asset_id IS '关联的内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.platform_video_id IS '关联的平台视频记录 ID，可为空表示仅有广告素材身份。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.ad_platform IS '广告投放平台编码，例如 qianchuan。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.account_id IS '广告账户 ID。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.account_name IS '广告账户名称。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.advertiser_id IS '广告主或投放主体 ID。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.external_material_id IS '外部广告平台素材 ID，千川场景对应 material_id。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.external_video_id IS '外部广告平台视频 ID。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.material_name IS '广告素材名称。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.material_title IS '广告素材标题。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.material_cover_url IS '广告素材封面 URL。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.material_status IS '广告素材状态，未知时为 unknown。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.created_at_on_platform IS '广告素材在外部平台创建时间。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.first_seen_at IS '该广告素材关联首次被系统发现时间。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.last_seen_at IS '该广告素材关联最近一次被系统发现时间。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.relation_status IS '素材与内容资产的关联状态：active、pending_confirm、rejected 或 archived。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.source IS '关联来源：manual、api_upload、api_import、report_import 或 fuzzy_match_confirmed。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.confidence IS '素材与内容资产匹配置信度，数值越高表示匹配越可信。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.raw_payload IS '广告素材关联的原始导入、报表或匹配证据 JSON。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.created_at IS '广告素材关联记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_ad_materials.updated_at IS '广告素材关联记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE ads.marketing_content_asset_events (
    event_id bigint NOT NULL,
    asset_id uuid,
    event_type text NOT NULL,
    actor text,
    message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE ads.marketing_content_asset_events IS '营销内容资产事件表：记录资产上传、处理、绑定、归档等操作事件及上下文 payload。';

COMMENT ON COLUMN ads.marketing_content_asset_events.event_id IS '内容资产事件记录主键。';

COMMENT ON COLUMN ads.marketing_content_asset_events.asset_id IS '关联的内容资产 ID，可为空表示系统级或导入级事件。';

COMMENT ON COLUMN ads.marketing_content_asset_events.event_type IS '事件类型编码，例如 transcript_completed、processing_job_worker_triggered 或 upload_completed。';

COMMENT ON COLUMN ads.marketing_content_asset_events.actor IS '触发事件的系统、worker 或用户标识。';

COMMENT ON COLUMN ads.marketing_content_asset_events.message IS '面向运营侧展示的事件说明文本。';

COMMENT ON COLUMN ads.marketing_content_asset_events.payload IS '事件上下文 JSON，保存任务 ID、模型、错误、对象存储 key 等结构化明细。';

COMMENT ON COLUMN ads.marketing_content_asset_events.created_at IS '事件记录创建时间。';

CREATE SEQUENCE ads.marketing_content_asset_events_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE ads.marketing_content_asset_events_event_id_seq OWNED BY ads.marketing_content_asset_events.event_id;

CREATE TABLE ads.marketing_content_asset_import_runs (
    run_id uuid NOT NULL,
    mode text NOT NULL,
    status text NOT NULL,
    source_url text NOT NULL,
    spreadsheet_token text,
    sheet_ids text[] DEFAULT '{}'::text[] NOT NULL,
    dry_run_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    attachment_count integer DEFAULT 0 NOT NULL,
    uploaded_count integer DEFAULT 0 NOT NULL,
    external_only_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    error_message text,
    requested_by text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_import_runs_mode_check CHECK ((mode = ANY (ARRAY['dry_run'::text, 'sample_upload'::text, 'full_upload'::text]))),
    CONSTRAINT marketing_content_asset_import_runs_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_import_runs IS '营销内容资产导入批次表：记录飞书或外部来源导入任务的范围、状态、统计与错误信息。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.run_id IS '内容资产导入批次 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.mode IS '导入运行模式：dry_run、sample_upload 或 full_upload。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.status IS '导入运行状态：requested、running、succeeded、failed 或 cancelled。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.source_url IS '导入来源地址，通常为飞书表格或文档 URL。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.spreadsheet_token IS '解析后的飞书电子表格 token。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.sheet_ids IS '本次导入覆盖的飞书 sheet ID 列表。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.dry_run_payload IS '导入预检或执行结果 JSON，包含样例候选、统计和触发来源等明细。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.total_rows IS '本次导入扫描到的源数据行数。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.attachment_count IS '本次导入识别到的附件数量。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.uploaded_count IS '本次导入成功上传或入库的内容资产数量。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.external_only_count IS '本次导入识别为仅外部链接、未直接上传附件的记录数量。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.skipped_count IS '本次导入因重复、规则过滤或无需处理而跳过的记录数量。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.failed_count IS '本次导入处理失败的记录数量。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.error_message IS '导入批次失败或取消时记录的错误说明。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.requested_by IS '发起导入的用户、API 或 worker 标识。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.started_at IS '导入批次开始处理时间。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.finished_at IS '导入批次结束处理时间。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.created_at IS '导入批次记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.updated_at IS '导入批次记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE ads.marketing_content_asset_objects (
    object_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    object_role text NOT NULL,
    storage_provider text DEFAULT 'tos'::text NOT NULL,
    bucket text DEFAULT 'aios-content-assets'::text NOT NULL,
    region text,
    object_key text NOT NULL,
    content_type text,
    file_ext text,
    size_bytes bigint,
    sha256 text,
    etag text,
    width integer,
    height integer,
    duration_seconds numeric(12,3),
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_objects_role_check CHECK ((object_role = ANY (ARRAY['raw'::text, 'preview'::text, 'cover'::text, 'frame'::text, 'transcript'::text, 'analysis'::text, 'analysis_proxy'::text]))),
    CONSTRAINT marketing_content_asset_objects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'missing'::text, 'deleted'::text, 'failed'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_objects IS '营销内容资产对象表：记录原始文件、预览、封面、转写结果等存储对象及媒体元数据。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.object_id IS '内容资产存储对象记录 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.asset_id IS '关联的内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.object_role IS '对象角色：raw、preview、cover、frame、transcript、analysis 或 analysis_proxy。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.storage_provider IS '对象存储服务商编码，当前主要为 tos。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.bucket IS '对象所在存储桶名称。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.region IS '对象所在存储区域。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.object_key IS '对象存储 key，用于定位原片、预览、封面、字幕或分析结果文件。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.content_type IS '对象 MIME 类型。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.file_ext IS '对象文件扩展名。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.size_bytes IS '对象文件大小，单位为字节。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.sha256 IS '对象内容 SHA-256 校验值。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.etag IS '对象存储返回的 ETag 或等价版本标识。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.width IS '图片或视频对象宽度，单位为像素。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.height IS '图片或视频对象高度，单位为像素。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.duration_seconds IS '音视频对象时长，单位为秒。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.status IS '对象状态：active、missing、deleted 或 failed。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.metadata IS '对象补充元数据 JSON，保存来源、回填、模型、进度和处理证据等明细。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.created_at IS '对象记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_objects.updated_at IS '对象记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE ads.marketing_content_asset_processing_jobs (
    job_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    input_object_key text,
    output_object_key text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    queued_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_processing_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['preview'::text, 'cover'::text, 'frames'::text, 'transcript'::text, 'analysis'::text]))),
    CONSTRAINT marketing_content_asset_processing_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_processing_jobs IS '营销内容资产处理任务表：承载预览、封面、字幕、分析等异步任务的队列状态与执行元数据。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.job_id IS '内容资产异步处理任务 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.asset_id IS '任务所属内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.job_type IS '任务类型：preview、cover、frames、transcript 或 analysis。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.status IS '任务状态：queued、running、succeeded、failed 或 cancelled。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.attempts IS '任务已尝试执行次数。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.max_attempts IS '任务允许的最大执行尝试次数。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.input_object_key IS '任务输入对象 key，通常指向原片或待处理媒体文件。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.output_object_key IS '任务输出对象 key，任务成功后指向预览、封面、字幕或分析结果。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.error_message IS '任务失败或重试时记录的错误信息。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.metadata IS '任务执行元数据 JSON，保存处理阶段、进度、Prefect 触发信息、模型设置和请求人等明细。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.queued_at IS '任务进入队列时间。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.started_at IS '任务开始执行时间。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.finished_at IS '任务结束执行时间。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.created_at IS '任务记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.updated_at IS '任务记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE ads.marketing_content_asset_sources (
    source_id bigint NOT NULL,
    asset_id uuid,
    source_kind text NOT NULL,
    source_url text,
    source_title text,
    feishu_file_token text,
    feishu_spreadsheet_token text,
    feishu_sheet_id text,
    feishu_sheet_name text,
    feishu_row_index integer,
    feishu_cell_ref text,
    external_platform text,
    external_status text DEFAULT 'pending_manual_upload'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_sources_external_status_check CHECK ((external_status = ANY (ARRAY['ingested'::text, 'pending_manual_upload'::text, 'ignored'::text, 'failed'::text]))),
    CONSTRAINT marketing_content_asset_sources_source_kind_check CHECK ((source_kind = ANY (ARRAY['feishu_attachment'::text, 'baidu_netdisk'::text, 'douyin_link'::text, 'feishu_link'::text, 'manual_upload'::text, 'other'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_sources IS '营销内容资产来源表：记录资产来自飞书、外部平台、手工上传等来源的定位信息。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.source_id IS '内容资产来源记录主键。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.asset_id IS '关联的内容资产 ID，可为空表示尚未落资产的来源线索。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.source_kind IS '来源类型：feishu_attachment、baidu_netdisk、douyin_link、feishu_link、manual_upload 或 other。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.source_url IS '来源链接地址，例如飞书、外部视频、网盘或平台素材 URL。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.source_title IS '来源记录标题或素材标题。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_file_token IS '飞书附件文件 token。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_spreadsheet_token IS '飞书电子表格 token。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_sheet_id IS '飞书来源 sheet ID。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_sheet_name IS '飞书来源 sheet 名称。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_row_index IS '飞书来源行号。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_cell_ref IS '飞书来源单元格引用。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.external_platform IS '外部来源平台编码，例如 qianchuan、douyin 或 feishu。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.external_status IS '外部来源处理状态：ingested、pending_manual_upload、ignored 或 failed。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.metadata IS '来源补充元数据 JSON，保存原始行、排行、采集页、CDN 证据和导入上下文。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.created_at IS '来源记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_sources.updated_at IS '来源记录最近更新时间，由更新时间触发器维护。';

CREATE SEQUENCE ads.marketing_content_asset_sources_source_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE ads.marketing_content_asset_sources_source_id_seq OWNED BY ads.marketing_content_asset_sources.source_id;

CREATE TABLE ads.marketing_content_asset_transcripts (
    transcript_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    source_object_key text NOT NULL,
    transcript_object_key text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    language text,
    status text DEFAULT 'active'::text NOT NULL,
    transcript_text text NOT NULL,
    script_text text NOT NULL,
    srt_text text NOT NULL,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_seconds numeric(12,3),
    word_count integer,
    confidence numeric(6,4),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_transcripts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'deleted'::text, 'failed'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_transcripts IS '营销内容资产字幕表：保存音视频转写文本、标准 SRT、分段结果、模型信息与处理状态。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_id IS '内容资产字幕记录 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.asset_id IS '关联的内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.source_object_key IS '用于生成字幕的源媒体对象 key。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_object_key IS '转写结果 JSON 对象 key。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.provider IS '转写或视频理解服务商编码。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.model IS '生成字幕所使用的模型名称。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.language IS '识别或生成的语言编码。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.status IS '字幕记录状态：active、superseded、deleted 或 failed。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_text IS '完整转写文本。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.script_text IS '整理后的口播脚本文本，用于页面展示、复制和分析。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.srt_text IS '标准 SRT 字幕文本。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.segments IS '字幕分段 JSON，保存起止时间、文本和置信度。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.duration_seconds IS '字幕覆盖的媒体时长，单位为秒。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.word_count IS '脚本或转写文本字数统计。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.confidence IS '字幕识别整体置信度。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.metadata IS '字幕生成元数据 JSON，保存模型响应、输入策略、处理阶段和用量等明细。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.created_at IS '字幕记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.updated_at IS '字幕记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE ads.marketing_content_asset_video_understanding_jobs (
    job_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    object_id uuid,
    media_hash text NOT NULL,
    media_url text,
    storage_key text,
    model_name text NOT NULL,
    prompt_version text NOT NULL,
    analysis_schema_version text DEFAULT '2.1'::text NOT NULL,
    input_snapshot_hash text,
    cache_key text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_asset_video_understanding_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])))
);

COMMENT ON TABLE ads.marketing_content_asset_video_understanding_jobs IS '内容资产结构化视频理解任务生命周期与缓存身份。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.job_id IS '任务主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.asset_id IS '关联内容资产主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.object_id IS '关联的分析结果对象主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.media_hash IS '用于缓存身份的视频媒体哈希。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.media_url IS '任务执行时使用的临时媒体地址。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.storage_key IS '任务使用的对象存储键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.model_name IS '视频理解模型名称。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.prompt_version IS '视频理解提示词版本。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.analysis_schema_version IS '结构化分析协议版本。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.input_snapshot_hash IS '分析输入快照哈希。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.cache_key IS '完整视频理解缓存键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.status IS '任务状态：pending/running/succeeded/failed/skipped。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.error_message IS '失败或跳过原因。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.started_at IS '任务开始时间。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.finished_at IS '任务结束时间。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.created_at IS '记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.updated_at IS '记录更新时间。';

CREATE TABLE ads.marketing_content_asset_video_understanding_results (
    result_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    object_id uuid,
    media_hash text NOT NULL,
    model_name text NOT NULL,
    prompt_version text NOT NULL,
    analysis_schema_version text DEFAULT '2.1'::text NOT NULL,
    input_snapshot_hash text NOT NULL,
    cache_key text,
    result_json jsonb NOT NULL,
    confidence numeric(8,4),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE ads.marketing_content_asset_video_understanding_results IS '内容资产结构化视频理解结果与可复用缓存载荷。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.result_id IS '结果主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.asset_id IS '关联内容资产主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.object_id IS '关联的分析结果对象主键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.media_hash IS '用于缓存身份的视频媒体哈希。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.model_name IS '生成结果的模型名称。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.prompt_version IS '生成结果的提示词版本。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.analysis_schema_version IS '结构化分析协议版本。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.input_snapshot_hash IS '分析输入快照哈希。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.cache_key IS '完整视频理解缓存键。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.result_json IS '包含 analysis、usage 与输入快照的结构化结果。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.confidence IS '模型输出的可选置信度。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.created_at IS '记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.updated_at IS '记录更新时间。';

CREATE TABLE ads.marketing_content_assets (
    asset_id uuid NOT NULL,
    title text NOT NULL,
    asset_type text DEFAULT 'video'::text NOT NULL,
    asset_status text DEFAULT 'pending_processing'::text NOT NULL,
    profile_status text DEFAULT 'incomplete'::text NOT NULL,
    lifecycle_status text DEFAULT 'draft'::text NOT NULL,
    source_type text DEFAULT 'manual_upload'::text NOT NULL,
    source_platform text,
    source_url text,
    source_record_id text,
    source_sheet_id text,
    source_sheet_name text,
    source_row_index integer,
    external_only boolean DEFAULT false NOT NULL,
    bucket text DEFAULT 'aios-content-assets'::text NOT NULL,
    raw_object_key text,
    preview_object_key text,
    cover_object_key text,
    transcript_object_key text,
    analysis_object_key text,
    raw_sha256 text,
    file_ext text,
    mime_type text,
    duration_seconds numeric(12,3),
    width integer,
    height integer,
    file_size_bytes bigint,
    preview_size_bytes bigint,
    platform text,
    product_name text,
    creator_name text,
    owner_name text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    authorization_status text DEFAULT 'unknown'::text NOT NULL,
    commercial_use_allowed boolean,
    repurpose_allowed boolean,
    authorization_starts_at date,
    authorization_expires_at date,
    authorization_notes text,
    ai_summary text,
    ai_score numeric(5,2),
    roi numeric(12,4),
    ctr numeric(12,6),
    cvr numeric(12,6),
    spend numeric(14,2),
    gmv numeric(14,2),
    uploaded_by text,
    uploaded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    ai_analysis_source text,
    ai_analysis_model text,
    ai_analyzed_at timestamp with time zone,
    transcript_source text,
    transcript_model text,
    transcribed_at timestamp with time zone,
    script_excerpt text,
    ai_suggested_title text,
    ai_suggested_tags text[] DEFAULT '{}'::text[] NOT NULL,
    ai_metadata_generated_at timestamp with time zone,
    title_source text DEFAULT 'unknown'::text NOT NULL,
    tags_source text DEFAULT 'empty'::text NOT NULL,
    product_names text[] DEFAULT '{}'::text[] NOT NULL,
    sku_names text[] DEFAULT '{}'::text[] NOT NULL,
    owner_user_id text,
    uploaded_by_user_id text,
    platform_names text[] DEFAULT '{}'::text[] NOT NULL,
    video_type text,
    content_scene text,
    content_scene_group text,
    content_scene_subtype text,
    CONSTRAINT marketing_content_assets_ai_analysis_source_check CHECK (((ai_analysis_source IS NULL) OR (ai_analysis_source = ANY (ARRAY['preview'::text, 'raw'::text, 'auto'::text])))),
    CONSTRAINT marketing_content_assets_asset_status_check CHECK ((asset_status = ANY (ARRAY['external_only'::text, 'uploading'::text, 'pending_processing'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'archived'::text]))),
    CONSTRAINT marketing_content_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['video'::text, 'image'::text, 'document'::text, 'other'::text]))),
    CONSTRAINT marketing_content_assets_authorization_status_check CHECK ((authorization_status = ANY (ARRAY['unknown'::text, 'authorized'::text, 'pending'::text, 'expired'::text, 'restricted'::text]))),
    CONSTRAINT marketing_content_assets_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['draft'::text, 'waiting_analysis'::text, 'testable'::text, 'testing'::text, 'scaling'::text, 'repurpose'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT marketing_content_assets_profile_status_check CHECK ((profile_status = ANY (ARRAY['incomplete'::text, 'basic_complete'::text, 'platform_bound'::text, 'performance_ready'::text, 'verified'::text]))),
    CONSTRAINT marketing_content_assets_tags_source_check CHECK ((tags_source = ANY (ARRAY['manual'::text, 'upload'::text, 'feishu_row'::text, 'ai_generated'::text, 'mixed'::text, 'empty'::text, 'unknown'::text]))),
    CONSTRAINT marketing_content_assets_title_source_check CHECK ((title_source = ANY (ARRAY['manual'::text, 'upload'::text, 'feishu_row'::text, 'file_name'::text, 'ai_generated'::text, 'row_fallback'::text, 'token_fallback'::text, 'unknown'::text]))),
    CONSTRAINT marketing_content_assets_transcript_source_check CHECK (((transcript_source IS NULL) OR (transcript_source = ANY (ARRAY['raw'::text, 'preview'::text, 'auto'::text]))))
);

COMMENT ON TABLE ads.marketing_content_assets IS '营销内容资产主表：统一管理素材资产生命周期、存储对象、AI 分析状态、业务分类和归属信息。';

COMMENT ON COLUMN ads.marketing_content_assets.asset_id IS '营销内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_assets.title IS '内容资产标题，用于素材库列表、检索和运营识别。';

COMMENT ON COLUMN ads.marketing_content_assets.asset_type IS '资产类型：video、image、document 或 other。';

COMMENT ON COLUMN ads.marketing_content_assets.asset_status IS '资产处理状态：external_only、uploading、pending_processing、processing、ready、failed 或 archived。';

COMMENT ON COLUMN ads.marketing_content_assets.profile_status IS '资产资料完整度状态：incomplete、basic_complete、platform_bound、performance_ready 或 verified。';

COMMENT ON COLUMN ads.marketing_content_assets.lifecycle_status IS '资产运营生命周期状态：draft、waiting_analysis、testable、testing、scaling、repurpose、rejected 或 expired。';

COMMENT ON COLUMN ads.marketing_content_assets.source_type IS '资产来源类型，例如 manual_upload、feishu_bootstrap 或 yuntu_archive。';

COMMENT ON COLUMN ads.marketing_content_assets.source_platform IS '资产来源平台编码，例如 qianchuan、douyin、feishu 或 manual。';

COMMENT ON COLUMN ads.marketing_content_assets.source_url IS '资产来源链接地址。';

COMMENT ON COLUMN ads.marketing_content_assets.source_record_id IS '外部来源记录 ID，用于回溯导入行、平台素材或归档记录。';

COMMENT ON COLUMN ads.marketing_content_assets.source_sheet_id IS '飞书或表格来源 sheet ID。';

COMMENT ON COLUMN ads.marketing_content_assets.source_sheet_name IS '飞书或表格来源 sheet 名称。';

COMMENT ON COLUMN ads.marketing_content_assets.source_row_index IS '飞书或表格来源行号。';

COMMENT ON COLUMN ads.marketing_content_assets.external_only IS '是否只有外部链接或外部素材身份，未直接托管原始文件。';

COMMENT ON COLUMN ads.marketing_content_assets.bucket IS '资产默认对象存储桶名称。';

COMMENT ON COLUMN ads.marketing_content_assets.raw_object_key IS '原始素材文件对象 key。';

COMMENT ON COLUMN ads.marketing_content_assets.preview_object_key IS '预览视频或轻量预览文件对象 key。';

COMMENT ON COLUMN ads.marketing_content_assets.cover_object_key IS '封面图片对象 key。';

COMMENT ON COLUMN ads.marketing_content_assets.transcript_object_key IS '字幕或脚本转写结果对象 key。';

COMMENT ON COLUMN ads.marketing_content_assets.analysis_object_key IS 'AI 分析结果对象 key。';

COMMENT ON COLUMN ads.marketing_content_assets.raw_sha256 IS '原始素材文件 SHA-256 校验值，用于去重和一致性校验。';

COMMENT ON COLUMN ads.marketing_content_assets.file_ext IS '原始素材文件扩展名。';

COMMENT ON COLUMN ads.marketing_content_assets.mime_type IS '原始素材 MIME 类型。';

COMMENT ON COLUMN ads.marketing_content_assets.duration_seconds IS '原始音视频时长，单位为秒。';

COMMENT ON COLUMN ads.marketing_content_assets.width IS '原始素材宽度，单位为像素。';

COMMENT ON COLUMN ads.marketing_content_assets.height IS '原始素材高度，单位为像素。';

COMMENT ON COLUMN ads.marketing_content_assets.file_size_bytes IS '原始素材文件大小，单位为字节。';

COMMENT ON COLUMN ads.marketing_content_assets.preview_size_bytes IS '预览文件大小，单位为字节。';

COMMENT ON COLUMN ads.marketing_content_assets.platform IS '资产默认投放或发布平台编码，兼容单平台筛选。';

COMMENT ON COLUMN ads.marketing_content_assets.product_name IS '资产默认关联产品名称，兼容单产品展示。';

COMMENT ON COLUMN ads.marketing_content_assets.creator_name IS '内容创作者或达人名称。';

COMMENT ON COLUMN ads.marketing_content_assets.owner_name IS '资产运营负责人名称。';

COMMENT ON COLUMN ads.marketing_content_assets.tags IS '资产运营标签列表。';

COMMENT ON COLUMN ads.marketing_content_assets.notes IS '资产运营备注。';

COMMENT ON COLUMN ads.marketing_content_assets.authorization_status IS '授权状态：unknown、authorized、pending、expired 或 restricted。';

COMMENT ON COLUMN ads.marketing_content_assets.commercial_use_allowed IS '是否允许商业投放或商业使用。';

COMMENT ON COLUMN ads.marketing_content_assets.repurpose_allowed IS '是否允许二创、混剪或复用。';

COMMENT ON COLUMN ads.marketing_content_assets.authorization_starts_at IS '授权开始日期。';

COMMENT ON COLUMN ads.marketing_content_assets.authorization_expires_at IS '授权到期日期。';

COMMENT ON COLUMN ads.marketing_content_assets.authorization_notes IS '授权范围、限制和补充说明。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_summary IS 'AI 生成的素材内容摘要。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_score IS 'AI 评估得分。';

COMMENT ON COLUMN ads.marketing_content_assets.roi IS '资产聚合投放 ROI。';

COMMENT ON COLUMN ads.marketing_content_assets.ctr IS '资产聚合点击率。';

COMMENT ON COLUMN ads.marketing_content_assets.cvr IS '资产聚合转化率。';

COMMENT ON COLUMN ads.marketing_content_assets.spend IS '资产聚合投放消耗金额。';

COMMENT ON COLUMN ads.marketing_content_assets.gmv IS '资产聚合成交金额。';

COMMENT ON COLUMN ads.marketing_content_assets.uploaded_by IS '上传人或导入系统标识。';

COMMENT ON COLUMN ads.marketing_content_assets.uploaded_at IS '素材上传或归档入库时间。';

COMMENT ON COLUMN ads.marketing_content_assets.created_at IS '资产记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_assets.updated_at IS '资产记录最近更新时间，由更新时间触发器维护。';

COMMENT ON COLUMN ads.marketing_content_assets.is_deleted IS '是否已软删除。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_analysis_source IS 'AI 分析输入来源：preview、raw 或 auto。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_analysis_model IS 'AI 分析使用的模型名称。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_analyzed_at IS 'AI 分析完成时间。';

COMMENT ON COLUMN ads.marketing_content_assets.transcript_source IS '字幕生成输入来源：raw、preview 或 auto。';

COMMENT ON COLUMN ads.marketing_content_assets.transcript_model IS '字幕生成使用的模型名称。';

COMMENT ON COLUMN ads.marketing_content_assets.transcribed_at IS '字幕生成完成时间。';

COMMENT ON COLUMN ads.marketing_content_assets.script_excerpt IS '口播脚本摘要或节选。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_suggested_title IS 'AI 建议的素材标题。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_suggested_tags IS 'AI 建议的素材标签列表。';

COMMENT ON COLUMN ads.marketing_content_assets.ai_metadata_generated_at IS 'AI 元数据建议生成时间。';

COMMENT ON COLUMN ads.marketing_content_assets.title_source IS '标题来源：manual、upload、feishu_row、file_name、ai_generated、row_fallback、token_fallback 或 unknown。';

COMMENT ON COLUMN ads.marketing_content_assets.tags_source IS '标签来源：manual、upload、feishu_row、ai_generated、mixed、empty 或 unknown。';

COMMENT ON COLUMN ads.marketing_content_assets.product_names IS '资产关联产品名称集合。';

COMMENT ON COLUMN ads.marketing_content_assets.sku_names IS '资产关联 SKU 名称集合。';

COMMENT ON COLUMN ads.marketing_content_assets.owner_user_id IS '资产运营负责人用户 ID。';

COMMENT ON COLUMN ads.marketing_content_assets.uploaded_by_user_id IS '上传人用户 ID。';

COMMENT ON COLUMN ads.marketing_content_assets.platform_names IS '资产可发布、归档或投放的平台列表。';

COMMENT ON COLUMN ads.marketing_content_assets.video_type IS '素材运营视频类型，例如 KOL 种草视频、KOC 挂车视频或店播视频。';

COMMENT ON COLUMN ads.marketing_content_assets.content_scene IS 'KOL/KOC 内容场景类型一级分类。';

COMMENT ON COLUMN ads.marketing_content_assets.content_scene_group IS 'KOL/KOC 内容大场景分类。';

COMMENT ON COLUMN ads.marketing_content_assets.content_scene_subtype IS 'KOL/KOC 内容细分场景分类。';

CREATE TABLE ads.marketing_content_platform_videos (
    platform_video_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    platform text NOT NULL,
    account_id text,
    account_name text,
    advertiser_id text,
    external_video_id text,
    external_item_id text,
    external_note_id text,
    external_url text,
    publish_title text,
    publish_cover_url text,
    publish_status text DEFAULT 'unknown'::text NOT NULL,
    published_at timestamp with time zone,
    relation_status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    confidence numeric(5,2),
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_platform_videos_relation_status_check CHECK ((relation_status = ANY (ARRAY['active'::text, 'pending_confirm'::text, 'rejected'::text, 'archived'::text]))),
    CONSTRAINT marketing_content_platform_videos_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'api_upload'::text, 'api_import'::text, 'report_import'::text, 'fuzzy_match_confirmed'::text])))
);

COMMENT ON TABLE ads.marketing_content_platform_videos IS '营销内容平台视频映射表：维护内容资产与抖音、小红书等平台视频或笔记 ID 的绑定关系。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.platform_video_id IS '内容资产平台视频绑定记录 ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.asset_id IS '关联的内容资产 ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.platform IS '发布或投放平台编码，例如 douyin、xiaohongshu 或 qianchuan。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.account_id IS '平台账号 ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.account_name IS '平台账号名称。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.advertiser_id IS '广告主或投放主体 ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.external_video_id IS '外部平台视频 ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.external_item_id IS '外部平台内容 item ID。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.external_note_id IS '外部平台笔记 ID，主要用于小红书等图文笔记场景。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.external_url IS '外部平台内容访问 URL。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_title IS '外部平台发布标题。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_cover_url IS '外部平台发布封面 URL。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_status IS '外部平台发布状态，未知时为 unknown。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.published_at IS '外部平台发布时间。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.relation_status IS '资产与平台内容的绑定关系状态：active、pending_confirm、rejected 或 archived。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.source IS '绑定来源：manual、api_upload、api_import、report_import 或 fuzzy_match_confirmed。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.confidence IS '资产与平台内容匹配置信度，数值越高表示匹配越可信。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.raw_payload IS '平台绑定的原始请求、导入或匹配证据 JSON。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.created_at IS '平台视频绑定记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_platform_videos.updated_at IS '平台视频绑定记录最近更新时间，由更新时间触发器维护。';

CREATE TABLE dwd.marketing_content_ad_material_stats_di (
    stat_date date NOT NULL,
    source_system text NOT NULL,
    ad_platform text NOT NULL,
    account_id text,
    account_name text,
    advertiser_id text,
    external_material_id text NOT NULL,
    external_video_id text,
    campaign_id text,
    campaign_name text,
    ad_group_id text,
    ad_group_name text,
    ad_id text,
    ad_name text,
    asset_id uuid,
    platform_video_id uuid,
    ad_material_id uuid,
    match_status text DEFAULT 'unmatched'::text NOT NULL,
    impressions bigint,
    clicks bigint,
    ctr numeric(12,6),
    conversions bigint,
    cvr numeric(12,6),
    cost numeric(14,2),
    gmv numeric(14,2),
    roi numeric(12,4),
    live_room_entries bigint,
    live_room_entry_rate numeric(12,6),
    transaction_cost numeric(14,2),
    likes bigint,
    comments bigint,
    shares bigint,
    follows bigint,
    source_ingest_id uuid,
    source_row_hash text,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_ad_material_stats_di_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'pending_confirm'::text, 'ambiguous'::text])))
);

COMMENT ON TABLE dwd.marketing_content_ad_material_stats_di IS 'DWD-营销内容广告素材日指标表：按广告素材与内容资产维度沉淀投放消耗、曝光、点击、转化和 GMV 指标。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.stat_date IS '指标日期。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.source_system IS '来源系统标识。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_platform IS '广告投放平台。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.account_id IS '广告账户 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.account_name IS '广告账户名称。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.advertiser_id IS '广告主 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.external_material_id IS '外部广告平台素材 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.external_video_id IS '外部广告平台视频 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.campaign_id IS '广告计划 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.campaign_name IS '广告计划名称。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_group_id IS '广告组 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_group_name IS '广告组名称。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_id IS '广告创意或广告单元 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_name IS '广告创意或广告单元名称。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.asset_id IS '匹配到的营销内容资产 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.platform_video_id IS '匹配到的平台视频映射 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ad_material_id IS '匹配到的广告素材映射 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.match_status IS '素材与内容资产的匹配状态。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.impressions IS '曝光次数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.clicks IS '点击次数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.ctr IS '点击率。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.conversions IS '转化次数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.cvr IS '转化率。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.cost IS '广告消耗金额。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.gmv IS '广告归因 GMV。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.roi IS '投放 ROI。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.live_room_entries IS '进入直播间次数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.live_room_entry_rate IS '直播间进入率。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.transaction_cost IS '成交成本。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.likes IS '点赞数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.comments IS '评论数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.shares IS '分享数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.follows IS '新增关注数。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.source_ingest_id IS '来源导入批次 ID。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.source_row_hash IS '来源行内容哈希，用于幂等和变更识别。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.raw_payload IS '来源原始行 JSON。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.created_at IS 'DWD 记录创建时间。';

COMMENT ON COLUMN dwd.marketing_content_ad_material_stats_di.updated_at IS 'DWD 记录最后更新时间。';

CREATE TABLE dwd.marketing_content_platform_video_stats_di (
    stat_date date NOT NULL,
    source_system text NOT NULL,
    platform text NOT NULL,
    account_id text,
    account_name text,
    external_video_id text,
    external_item_id text,
    external_note_id text,
    external_url text,
    asset_id uuid,
    platform_video_id uuid,
    match_status text DEFAULT 'unmatched'::text NOT NULL,
    impressions bigint,
    plays bigint,
    reads bigint,
    clicks bigint,
    likes bigint,
    comments bigint,
    shares bigint,
    collects bigint,
    follows bigint,
    completion_rate numeric(12,6),
    avg_watch_seconds numeric(12,3),
    source_ingest_id uuid,
    source_row_hash text,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT marketing_content_platform_video_stats_di_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'pending_confirm'::text, 'ambiguous'::text])))
);

COMMENT ON TABLE dwd.marketing_content_platform_video_stats_di IS 'DWD-营销内容平台视频日指标表：按平台视频或笔记维度沉淀自然内容曝光、互动、点击和转化指标。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.stat_date IS '指标日期。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.source_system IS '来源系统标识。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.platform IS '内容发布平台。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.account_id IS '平台账号 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.account_name IS '平台账号名称。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.external_video_id IS '外部平台视频 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.external_item_id IS '外部平台内容 item ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.external_note_id IS '外部平台笔记 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.external_url IS '外部平台内容 URL。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.asset_id IS '匹配到的营销内容资产 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.platform_video_id IS '匹配到的平台视频映射 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.match_status IS '平台内容与资产的匹配状态。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.impressions IS '曝光次数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.plays IS '播放次数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.reads IS '阅读次数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.clicks IS '点击次数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.likes IS '点赞数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.comments IS '评论数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.shares IS '分享数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.collects IS '收藏数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.follows IS '新增关注数。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.completion_rate IS '完播率。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.avg_watch_seconds IS '平均观看时长（秒）。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.source_ingest_id IS '来源导入批次 ID。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.source_row_hash IS '来源行内容哈希，用于幂等和变更识别。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.raw_payload IS '来源原始行 JSON。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.created_at IS 'DWD 记录创建时间。';

COMMENT ON COLUMN dwd.marketing_content_platform_video_stats_di.updated_at IS 'DWD 记录最后更新时间。';

CREATE TABLE dws.marketing_content_asset_daily_summary (
    stat_date date NOT NULL,
    asset_id uuid NOT NULL,
    platform text DEFAULT ''::text NOT NULL,
    account_id text DEFAULT ''::text NOT NULL,
    account_name text,
    product_name text,
    creator_name text,
    material_count integer DEFAULT 0 NOT NULL,
    video_count integer DEFAULT 0 NOT NULL,
    impressions bigint DEFAULT 0 NOT NULL,
    plays bigint DEFAULT 0 NOT NULL,
    clicks bigint DEFAULT 0 NOT NULL,
    conversions bigint DEFAULT 0 NOT NULL,
    cost numeric(14,2) DEFAULT 0 NOT NULL,
    gmv numeric(14,2) DEFAULT 0 NOT NULL,
    roi numeric(12,4),
    ctr numeric(12,6),
    cvr numeric(12,6),
    likes bigint DEFAULT 0 NOT NULL,
    comments bigint DEFAULT 0 NOT NULL,
    shares bigint DEFAULT 0 NOT NULL,
    collects bigint DEFAULT 0 NOT NULL,
    follows bigint DEFAULT 0 NOT NULL,
    live_room_entries bigint DEFAULT 0 NOT NULL,
    live_room_entry_rate numeric(12,6),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE dws.marketing_content_asset_daily_summary IS 'DWS-营销内容资产日汇总表：按资产、日期、平台和账户聚合素材投放与自然内容表现。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.stat_date IS '汇总日期。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.asset_id IS '营销内容资产 ID。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.platform IS '平台。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.account_id IS '账号 ID。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.account_name IS '账号名称。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.product_name IS '关联产品名称。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.creator_name IS '内容创作者名称。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.material_count IS '关联广告素材数量。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.video_count IS '关联平台视频或笔记数量。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.impressions IS '曝光次数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.plays IS '播放次数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.clicks IS '点击次数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.conversions IS '转化次数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.cost IS '广告消耗金额。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.gmv IS '归因 GMV。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.roi IS '投资回报率（ROI）。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.ctr IS '点击率。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.cvr IS '转化率。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.likes IS '点赞数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.comments IS '评论数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.shares IS '分享数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.collects IS '收藏数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.follows IS '新增关注数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.live_room_entries IS '进入直播间次数。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.live_room_entry_rate IS '直播间进入率。';

COMMENT ON COLUMN dws.marketing_content_asset_daily_summary.updated_at IS '汇总记录最后更新时间。';

CREATE TABLE dws.marketing_content_asset_lifetime_summary (
    asset_id uuid NOT NULL,
    first_stat_date date,
    last_stat_date date,
    platform_count integer DEFAULT 0 NOT NULL,
    account_count integer DEFAULT 0 NOT NULL,
    material_count integer DEFAULT 0 NOT NULL,
    video_count integer DEFAULT 0 NOT NULL,
    total_impressions bigint DEFAULT 0 NOT NULL,
    total_plays bigint DEFAULT 0 NOT NULL,
    total_clicks bigint DEFAULT 0 NOT NULL,
    total_conversions bigint DEFAULT 0 NOT NULL,
    total_cost numeric(14,2) DEFAULT 0 NOT NULL,
    total_gmv numeric(14,2) DEFAULT 0 NOT NULL,
    total_roi numeric(12,4),
    last_7d_cost numeric(14,2) DEFAULT 0 NOT NULL,
    last_7d_gmv numeric(14,2) DEFAULT 0 NOT NULL,
    last_7d_roi numeric(12,4),
    last_30d_cost numeric(14,2) DEFAULT 0 NOT NULL,
    last_30d_gmv numeric(14,2) DEFAULT 0 NOT NULL,
    last_30d_roi numeric(12,4),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE dws.marketing_content_asset_lifetime_summary IS 'DWS-营销内容资产生命周期汇总表：按资产聚合累计表现及近 7/30 天投放效果。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.asset_id IS '营销内容资产 ID。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.first_stat_date IS '首次有指标的日期。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_stat_date IS '最近有指标的日期。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.platform_count IS '覆盖平台数量。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.account_count IS '覆盖账号数量。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.material_count IS '累计关联广告素材数量。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.video_count IS '累计关联平台视频或笔记数量。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_impressions IS '累计曝光次数。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_plays IS '累计播放次数。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_clicks IS '累计点击次数。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_conversions IS '累计转化次数。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_cost IS '累计广告消耗金额。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_gmv IS '累计归因 GMV。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.total_roi IS '累计 ROI。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_7d_cost IS '近 7 天广告消耗金额。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_7d_gmv IS '近 7 天归因 GMV。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_7d_roi IS '近 7 天 ROI。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_30d_cost IS '近 30 天广告消耗金额。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_30d_gmv IS '近 30 天归因 GMV。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.last_30d_roi IS '近 30 天 ROI。';

COMMENT ON COLUMN dws.marketing_content_asset_lifetime_summary.updated_at IS '生命周期汇总记录最后更新时间。';

CREATE TABLE public.auth_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(64) NOT NULL,
    description character varying(255)
);

CREATE TABLE public.auth_role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);

CREATE TABLE public.auth_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(64) NOT NULL,
    description character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.auth_user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);

CREATE TABLE public.auth_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(64) NOT NULL,
    display_name character varying(128) NOT NULL,
    password_hash character varying(255),
    is_active boolean DEFAULT true,
    auth_provider character varying(32) DEFAULT 'local'::character varying,
    external_id character varying(128),
    avatar_url character varying(512),
    email character varying(128),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone
);

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id text NOT NULL,
    token_hash character varying(64) NOT NULL,
    is_revoked boolean DEFAULT false NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    device_id character varying(255),
    device_name character varying(255),
    user_agent text,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at timestamp without time zone,
    revoked_at timestamp without time zone
);

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;

ALTER TABLE ONLY ads.marketing_content_asset_events ALTER COLUMN event_id SET DEFAULT nextval('ads.marketing_content_asset_events_event_id_seq'::regclass);

ALTER TABLE ONLY ads.marketing_content_asset_sources ALTER COLUMN source_id SET DEFAULT nextval('ads.marketing_content_asset_sources_source_id_seq'::regclass);

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);

ALTER TABLE ONLY ads.content_asset_lineage
    ADD CONSTRAINT content_asset_lineage_pkey PRIMARY KEY (run_id, ordinal);

ALTER TABLE ONLY ads.content_production_jobs
    ADD CONSTRAINT content_production_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.content_production_plan_attempts
    ADD CONSTRAINT content_production_plan_attempts_pkey PRIMARY KEY (attempt_id);

ALTER TABLE ONLY ads.content_production_plans
    ADD CONSTRAINT content_production_plans_pkey PRIMARY KEY (run_id, revision);

ALTER TABLE ONLY ads.content_production_projects
    ADD CONSTRAINT content_production_projects_pkey PRIMARY KEY (project_id);

ALTER TABLE ONLY ads.content_production_revisions
    ADD CONSTRAINT content_production_revisions_pkey PRIMARY KEY (project_id, revision);

ALTER TABLE ONLY ads.content_production_run_renders
    ADD CONSTRAINT content_production_run_renders_job_id_key UNIQUE (job_id);

ALTER TABLE ONLY ads.content_production_run_renders
    ADD CONSTRAINT content_production_run_renders_pkey PRIMARY KEY (run_id, execution_version);

ALTER TABLE ONLY ads.content_production_runs
    ADD CONSTRAINT content_production_runs_owner_user_id_idempotency_key_key UNIQUE (owner_user_id, idempotency_key);

ALTER TABLE ONLY ads.content_production_runs
    ADD CONSTRAINT content_production_runs_pkey PRIMARY KEY (run_id);

ALTER TABLE ONLY ads.content_production_semantic_jobs
    ADD CONSTRAINT content_production_semantic_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.content_production_shot_catalogs
    ADD CONSTRAINT content_production_shot_catal_owner_user_id_asset_id_conten_key UNIQUE (owner_user_id, asset_id, content_hash);

ALTER TABLE ONLY ads.content_production_shot_catalogs
    ADD CONSTRAINT content_production_shot_catalogs_pkey PRIMARY KEY (catalog_id);

ALTER TABLE ONLY ads.content_production_shot_jobs
    ADD CONSTRAINT content_production_shot_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_batch_id_combination_hash_key UNIQUE (batch_id, combination_hash);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_pkey PRIMARY KEY (batch_id, ordinal);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_run_id_key UNIQUE (run_id);

ALTER TABLE ONLY ads.content_remix_batches
    ADD CONSTRAINT content_remix_batches_owner_user_id_idempotency_key_key UNIQUE (owner_user_id, idempotency_key);

ALTER TABLE ONLY ads.content_remix_batches
    ADD CONSTRAINT content_remix_batches_pkey PRIMARY KEY (batch_id);

ALTER TABLE ONLY ads.content_segment_presets
    ADD CONSTRAINT content_segment_presets_pkey PRIMARY KEY (preset_key, version);

ALTER TABLE ONLY ads.content_segment_suggestion_jobs
    ADD CONSTRAINT content_segment_suggestion_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.content_segments
    ADD CONSTRAINT content_segments_confirmed_no_overlap EXCLUDE USING gist (asset_id WITH =, preset_key WITH =, int4range(start_ms, end_ms) WITH &&) WHERE ((status = 'confirmed'::text));

ALTER TABLE ONLY ads.content_segments
    ADD CONSTRAINT content_segments_pkey PRIMARY KEY (segment_id);

ALTER TABLE ONLY ads.marketing_content_ad_materials
    ADD CONSTRAINT marketing_content_ad_materials_pkey PRIMARY KEY (ad_material_id);

ALTER TABLE ONLY ads.marketing_content_asset_events
    ADD CONSTRAINT marketing_content_asset_events_pkey PRIMARY KEY (event_id);

ALTER TABLE ONLY ads.marketing_content_asset_import_runs
    ADD CONSTRAINT marketing_content_asset_import_runs_pkey PRIMARY KEY (run_id);

ALTER TABLE ONLY ads.marketing_content_asset_objects
    ADD CONSTRAINT marketing_content_asset_objects_pkey PRIMARY KEY (object_id);

ALTER TABLE ONLY ads.marketing_content_asset_processing_jobs
    ADD CONSTRAINT marketing_content_asset_processing_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.marketing_content_asset_sources
    ADD CONSTRAINT marketing_content_asset_sources_pkey PRIMARY KEY (source_id);

ALTER TABLE ONLY ads.marketing_content_asset_transcripts
    ADD CONSTRAINT marketing_content_asset_transcripts_pkey PRIMARY KEY (transcript_id);

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_jobs
    ADD CONSTRAINT marketing_content_asset_video_understanding_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_results
    ADD CONSTRAINT marketing_content_asset_video_understanding_results_pkey PRIMARY KEY (result_id);

ALTER TABLE ONLY ads.marketing_content_assets
    ADD CONSTRAINT marketing_content_assets_pkey PRIMARY KEY (asset_id);

ALTER TABLE ONLY ads.marketing_content_platform_videos
    ADD CONSTRAINT marketing_content_platform_videos_pkey PRIMARY KEY (platform_video_id);

ALTER TABLE ONLY dws.marketing_content_asset_daily_summary
    ADD CONSTRAINT marketing_content_asset_daily_summary_pkey PRIMARY KEY (stat_date, asset_id, platform, account_id);

ALTER TABLE ONLY dws.marketing_content_asset_lifetime_summary
    ADD CONSTRAINT marketing_content_asset_lifetime_summary_pkey PRIMARY KEY (asset_id);

ALTER TABLE ONLY public.auth_permissions
    ADD CONSTRAINT auth_permissions_key_key UNIQUE (key);

ALTER TABLE ONLY public.auth_permissions
    ADD CONSTRAINT auth_permissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_role_permissions
    ADD CONSTRAINT auth_role_permissions_pkey PRIMARY KEY (role_id, permission_id);

ALTER TABLE ONLY public.auth_roles
    ADD CONSTRAINT auth_roles_name_key UNIQUE (name);

ALTER TABLE ONLY public.auth_roles
    ADD CONSTRAINT auth_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_user_roles
    ADD CONSTRAINT auth_user_roles_pkey PRIMARY KEY (user_id, role_id);

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_username_key UNIQUE (username);

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);

CREATE INDEX content_asset_lineage_output_idx ON ads.content_asset_lineage USING btree (output_asset_id, ordinal);

CREATE INDEX content_asset_lineage_segment_idx ON ads.content_asset_lineage USING btree (segment_id);

CREATE INDEX content_asset_lineage_source_idx ON ads.content_asset_lineage USING btree (source_asset_id);

CREATE UNIQUE INDEX content_production_jobs_active_idx ON ads.content_production_jobs USING btree (project_id, revision, preview) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text]));

CREATE INDEX content_production_jobs_queue_idx ON ads.content_production_jobs USING btree (created_at) WHERE (status = 'queued'::text);

CREATE INDEX content_production_plan_attempts_pending_idx ON ads.content_production_plan_attempts USING btree (created_at, attempt_id) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

CREATE INDEX content_production_plan_attempts_run_idx ON ads.content_production_plan_attempts USING btree (run_id, created_at DESC);

CREATE INDEX content_production_projects_owner_idx ON ads.content_production_projects USING btree (owner_user_id, updated_at DESC);

CREATE INDEX content_production_runs_owner_idx ON ads.content_production_runs USING btree (owner_user_id, created_at DESC, run_id DESC);

CREATE INDEX content_production_runs_render_active_idx ON ads.content_production_runs USING btree (updated_at) WHERE ((render_job_id IS NOT NULL) AND (status = ANY (ARRAY['running'::text, 'cancelling'::text])));

CREATE UNIQUE INDEX content_production_semantic_active_idx ON ads.content_production_semantic_jobs USING btree (owner_user_id, catalog_id, request_hash) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text]));

CREATE INDEX content_production_semantic_catalog_idx ON ads.content_production_semantic_jobs USING btree (owner_user_id, catalog_id, finished_at DESC);

CREATE INDEX content_production_semantic_queue_idx ON ads.content_production_semantic_jobs USING btree (created_at) WHERE (status = 'queued'::text);

CREATE INDEX content_production_shot_catalogs_owner_idx ON ads.content_production_shot_catalogs USING btree (owner_user_id, created_at DESC);

CREATE UNIQUE INDEX content_production_shot_jobs_active_idx ON ads.content_production_shot_jobs USING btree (owner_user_id, asset_id, raw_sha256) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text, 'cancel_requested'::text]));

CREATE INDEX content_production_shot_jobs_owner_idx ON ads.content_production_shot_jobs USING btree (owner_user_id, created_at DESC);

CREATE INDEX content_production_shot_jobs_queue_idx ON ads.content_production_shot_jobs USING btree (created_at) WHERE (status = 'queued'::text);

CREATE INDEX content_remix_batch_runs_hash_idx ON ads.content_remix_batch_runs USING btree (combination_hash);

CREATE INDEX content_remix_batches_owner_idx ON ads.content_remix_batches USING btree (owner_user_id, created_at DESC, batch_id DESC);

CREATE UNIQUE INDEX content_segment_suggestion_jobs_active_idx ON ads.content_segment_suggestion_jobs USING btree (asset_id, preset_key) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

CREATE INDEX content_segment_suggestion_jobs_asset_idx ON ads.content_segment_suggestion_jobs USING btree (asset_id, created_at DESC);

CREATE INDEX content_segment_suggestion_jobs_owner_idx ON ads.content_segment_suggestion_jobs USING btree (owner_user_id, created_at DESC);

CREATE INDEX content_segment_suggestion_jobs_queue_idx ON ads.content_segment_suggestion_jobs USING btree (created_at) WHERE (status = 'queued'::text);

CREATE INDEX content_segments_asset_idx ON ads.content_segments USING btree (asset_id, preset_key, start_ms, segment_id);

CREATE INDEX content_segments_label_idx ON ads.content_segments USING btree (preset_key, label_key, status);

CREATE UNIQUE INDEX idx_ads_mc_ad_material_identity_active ON ads.marketing_content_ad_materials USING btree (ad_platform, COALESCE(account_id, ''::text), external_material_id) WHERE (relation_status = 'active'::text);

CREATE INDEX idx_ads_mc_assets_performance ON ads.marketing_content_assets USING btree (roi DESC NULLS LAST, spend DESC NULLS LAST, updated_at DESC) WHERE (is_deleted = false);

CREATE UNIQUE INDEX idx_ads_mc_platform_video_identity_active ON ads.marketing_content_platform_videos USING btree (platform, COALESCE(account_id, ''::text), COALESCE(external_video_id, ''::text), COALESCE(external_item_id, ''::text), COALESCE(external_note_id, ''::text)) WHERE ((relation_status = 'active'::text) AND (COALESCE(NULLIF(external_video_id, ''::text), NULLIF(external_item_id, ''::text), NULLIF(external_note_id, ''::text)) IS NOT NULL));

CREATE UNIQUE INDEX idx_content_asset_video_understanding_job_cache ON ads.marketing_content_asset_video_understanding_jobs USING btree (asset_id, media_hash, model_name, prompt_version, analysis_schema_version);

CREATE INDEX idx_content_asset_video_understanding_jobs_cache_key ON ads.marketing_content_asset_video_understanding_jobs USING btree (cache_key) WHERE (cache_key IS NOT NULL);

CREATE UNIQUE INDEX idx_content_asset_video_understanding_result_cache ON ads.marketing_content_asset_video_understanding_results USING btree (asset_id, media_hash, model_name, prompt_version, analysis_schema_version, input_snapshot_hash);

CREATE INDEX idx_content_asset_video_understanding_results_cache_key ON ads.marketing_content_asset_video_understanding_results USING btree (cache_key) WHERE (cache_key IS NOT NULL);

CREATE INDEX idx_marketing_content_ad_materials_asset ON ads.marketing_content_ad_materials USING btree (asset_id);

CREATE UNIQUE INDEX idx_marketing_content_ad_materials_material_active ON ads.marketing_content_ad_materials USING btree (ad_platform, COALESCE(account_id, ''::text), external_material_id) WHERE (relation_status = 'active'::text);

CREATE INDEX idx_marketing_content_ad_materials_qianchuan_material_active_lo ON ads.marketing_content_ad_materials USING btree (ad_platform, external_material_id) WHERE ((relation_status = 'active'::text) AND (ad_platform = 'qianchuan'::text) AND (NULLIF(btrim(external_material_id), ''::text) IS NOT NULL));

CREATE INDEX idx_marketing_content_asset_events_asset_created ON ads.marketing_content_asset_events USING btree (asset_id, created_at DESC);

CREATE INDEX idx_marketing_content_asset_import_runs_created_at ON ads.marketing_content_asset_import_runs USING btree (created_at DESC);

CREATE INDEX idx_marketing_content_asset_objects_asset ON ads.marketing_content_asset_objects USING btree (asset_id, object_role);

CREATE UNIQUE INDEX idx_marketing_content_asset_objects_unique_active ON ads.marketing_content_asset_objects USING btree (asset_id, object_role, object_key) WHERE (status = 'active'::text);

CREATE INDEX idx_marketing_content_asset_processing_jobs_asset_status ON ads.marketing_content_asset_processing_jobs USING btree (asset_id, status);

CREATE INDEX idx_marketing_content_asset_processing_jobs_queue ON ads.marketing_content_asset_processing_jobs USING btree (job_type, queued_at, created_at) WHERE (status = 'queued'::text);

CREATE INDEX idx_marketing_content_asset_sources_asset_id ON ads.marketing_content_asset_sources USING btree (asset_id);

CREATE INDEX idx_marketing_content_asset_sources_feishu_file_token ON ads.marketing_content_asset_sources USING btree (feishu_file_token) WHERE (feishu_file_token IS NOT NULL);

CREATE INDEX idx_marketing_content_asset_transcripts_asset_active ON ads.marketing_content_asset_transcripts USING btree (asset_id, created_at DESC) WHERE (status = 'active'::text);

CREATE INDEX idx_marketing_content_asset_transcripts_script_tsv ON ads.marketing_content_asset_transcripts USING gin (to_tsvector('simple'::regconfig, script_text));

CREATE INDEX idx_marketing_content_assets_ai_analysis ON ads.marketing_content_assets USING btree (ai_analysis_source, ai_analyzed_at DESC) WHERE ((is_deleted = false) AND (analysis_object_key IS NOT NULL));

CREATE INDEX idx_marketing_content_assets_ai_suggested_tags ON ads.marketing_content_assets USING gin (ai_suggested_tags) WHERE ((is_deleted = false) AND (cardinality(ai_suggested_tags) > 0));

CREATE INDEX idx_marketing_content_assets_content_scene ON ads.marketing_content_assets USING btree (content_scene) WHERE ((content_scene IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_content_scene_group ON ads.marketing_content_assets USING btree (content_scene_group) WHERE ((content_scene_group IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_content_scene_subtype ON ads.marketing_content_assets USING btree (content_scene_subtype) WHERE ((content_scene_subtype IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_creator ON ads.marketing_content_assets USING btree (creator_name) WHERE (is_deleted = false);

CREATE INDEX idx_marketing_content_assets_owner_user ON ads.marketing_content_assets USING btree (owner_user_id) WHERE ((owner_user_id IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_platform ON ads.marketing_content_assets USING btree (platform) WHERE (is_deleted = false);

CREATE INDEX idx_marketing_content_assets_platform_names ON ads.marketing_content_assets USING gin (platform_names);

CREATE INDEX idx_marketing_content_assets_product ON ads.marketing_content_assets USING btree (product_name) WHERE (is_deleted = false);

CREATE INDEX idx_marketing_content_assets_product_names ON ads.marketing_content_assets USING gin (product_names);

CREATE INDEX idx_marketing_content_assets_raw_sha256 ON ads.marketing_content_assets USING btree (raw_sha256) WHERE ((raw_sha256 IS NOT NULL) AND (is_deleted = false));

CREATE UNIQUE INDEX idx_marketing_content_assets_raw_sha256_active ON ads.marketing_content_assets USING btree (raw_sha256) WHERE ((raw_sha256 IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_sku_names ON ads.marketing_content_assets USING gin (sku_names);

CREATE INDEX idx_marketing_content_assets_status ON ads.marketing_content_assets USING btree (asset_status, profile_status, lifecycle_status) WHERE (is_deleted = false);

CREATE INDEX idx_marketing_content_assets_tags ON ads.marketing_content_assets USING gin (tags);

CREATE INDEX idx_marketing_content_assets_transcribed ON ads.marketing_content_assets USING btree (transcript_source, transcribed_at DESC) WHERE ((is_deleted = false) AND (transcript_object_key IS NOT NULL));

CREATE INDEX idx_marketing_content_assets_updated_at ON ads.marketing_content_assets USING btree (updated_at DESC) WHERE (is_deleted = false);

CREATE INDEX idx_marketing_content_assets_uploaded_by_user ON ads.marketing_content_assets USING btree (uploaded_by_user_id) WHERE ((uploaded_by_user_id IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_assets_video_type ON ads.marketing_content_assets USING btree (video_type) WHERE ((video_type IS NOT NULL) AND (is_deleted = false));

CREATE INDEX idx_marketing_content_platform_videos_asset ON ads.marketing_content_platform_videos USING btree (asset_id);

CREATE UNIQUE INDEX idx_marketing_content_platform_videos_video_active ON ads.marketing_content_platform_videos USING btree (platform, COALESCE(account_id, ''::text), COALESCE(external_video_id, ''::text), COALESCE(external_item_id, ''::text), COALESCE(external_note_id, ''::text)) WHERE ((relation_status = 'active'::text) AND (COALESCE(NULLIF(external_video_id, ''::text), NULLIF(external_item_id, ''::text), NULLIF(external_note_id, ''::text)) IS NOT NULL));

CREATE INDEX idx_dwd_marketing_content_ad_material_stats_di_asset_date ON dwd.marketing_content_ad_material_stats_di USING btree (asset_id, stat_date);

CREATE UNIQUE INDEX idx_dwd_marketing_content_ad_material_stats_di_unique ON dwd.marketing_content_ad_material_stats_di USING btree (ad_platform, COALESCE(account_id, ''::text), external_material_id, stat_date, COALESCE(campaign_id, ''::text), COALESCE(ad_group_id, ''::text), COALESCE(ad_id, ''::text));

CREATE INDEX idx_dwd_marketing_content_platform_video_stats_di_asset_date ON dwd.marketing_content_platform_video_stats_di USING btree (asset_id, stat_date);

CREATE INDEX idx_dwd_mc_ad_stats_match_lookup ON dwd.marketing_content_ad_material_stats_di USING btree (ad_platform, COALESCE(account_id, ''::text), external_material_id, match_status);

CREATE INDEX idx_dwd_mc_ad_stats_unmatched_queue ON dwd.marketing_content_ad_material_stats_di USING btree (match_status, ad_platform, COALESCE(account_id, ''::text), external_material_id) WHERE (match_status = ANY (ARRAY['unmatched'::text, 'pending_confirm'::text, 'ambiguous'::text]));

CREATE INDEX idx_dwd_mc_video_stats_unmatched_queue ON dwd.marketing_content_platform_video_stats_di USING btree (match_status, platform, COALESCE(account_id, ''::text), COALESCE(external_video_id, ''::text), COALESCE(external_item_id, ''::text), COALESCE(external_note_id, ''::text)) WHERE (match_status = ANY (ARRAY['unmatched'::text, 'pending_confirm'::text, 'ambiguous'::text]));

CREATE INDEX idx_dws_mc_asset_daily_asset_date ON dws.marketing_content_asset_daily_summary USING btree (asset_id, stat_date DESC);

CREATE INDEX idx_dws_mc_asset_lifetime_roi ON dws.marketing_content_asset_lifetime_summary USING btree (total_roi DESC NULLS LAST, total_cost DESC, last_stat_date DESC NULLS LAST);

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);

CREATE INDEX idx_refresh_tokens_is_revoked ON public.refresh_tokens USING btree (is_revoked);

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);

CREATE TRIGGER trg_marketing_content_ad_materials_touch_updated_at BEFORE UPDATE ON ads.marketing_content_ad_materials FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_asset_import_runs_touch_updated_at BEFORE UPDATE ON ads.marketing_content_asset_import_runs FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_asset_objects_touch_updated_at BEFORE UPDATE ON ads.marketing_content_asset_objects FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_asset_processing_jobs_touch_updated_at BEFORE UPDATE ON ads.marketing_content_asset_processing_jobs FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_asset_sources_touch_updated_at BEFORE UPDATE ON ads.marketing_content_asset_sources FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_assets_touch_updated_at BEFORE UPDATE ON ads.marketing_content_assets FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE TRIGGER trg_marketing_content_platform_videos_touch_updated_at BEFORE UPDATE ON ads.marketing_content_platform_videos FOR EACH ROW EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

ALTER TABLE ONLY ads.content_asset_lineage
    ADD CONSTRAINT content_asset_lineage_output_asset_id_fkey FOREIGN KEY (output_asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_asset_lineage
    ADD CONSTRAINT content_asset_lineage_run_id_fkey FOREIGN KEY (run_id) REFERENCES ads.content_production_runs(run_id);

ALTER TABLE ONLY ads.content_asset_lineage
    ADD CONSTRAINT content_asset_lineage_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES ads.content_segments(segment_id);

ALTER TABLE ONLY ads.content_asset_lineage
    ADD CONSTRAINT content_asset_lineage_source_asset_id_fkey FOREIGN KEY (source_asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_production_jobs
    ADD CONSTRAINT content_production_jobs_project_id_revision_fkey FOREIGN KEY (project_id, revision) REFERENCES ads.content_production_revisions(project_id, revision);

ALTER TABLE ONLY ads.content_production_plan_attempts
    ADD CONSTRAINT content_production_plan_attempts_run_id_fkey FOREIGN KEY (run_id) REFERENCES ads.content_production_runs(run_id);

ALTER TABLE ONLY ads.content_production_plans
    ADD CONSTRAINT content_production_plans_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES ads.content_production_plan_attempts(attempt_id);

ALTER TABLE ONLY ads.content_production_plans
    ADD CONSTRAINT content_production_plans_run_id_fkey FOREIGN KEY (run_id) REFERENCES ads.content_production_runs(run_id);

ALTER TABLE ONLY ads.content_production_revisions
    ADD CONSTRAINT content_production_revisions_project_id_fkey FOREIGN KEY (project_id) REFERENCES ads.content_production_projects(project_id);

ALTER TABLE ONLY ads.content_production_run_renders
    ADD CONSTRAINT content_production_run_renders_job_id_fkey FOREIGN KEY (job_id) REFERENCES ads.content_production_jobs(job_id);

ALTER TABLE ONLY ads.content_production_run_renders
    ADD CONSTRAINT content_production_run_renders_run_id_fkey FOREIGN KEY (run_id) REFERENCES ads.content_production_runs(run_id);

ALTER TABLE ONLY ads.content_production_run_renders
    ADD CONSTRAINT content_production_run_renders_run_id_plan_revision_fkey FOREIGN KEY (run_id, plan_revision) REFERENCES ads.content_production_plans(run_id, revision);

ALTER TABLE ONLY ads.content_production_runs
    ADD CONSTRAINT content_production_runs_project_id_project_revision_fkey FOREIGN KEY (project_id, project_revision) REFERENCES ads.content_production_revisions(project_id, revision);

ALTER TABLE ONLY ads.content_production_runs
    ADD CONSTRAINT content_production_runs_render_job_id_fkey FOREIGN KEY (render_job_id) REFERENCES ads.content_production_jobs(job_id);

ALTER TABLE ONLY ads.content_production_semantic_jobs
    ADD CONSTRAINT content_production_semantic_jobs_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES ads.content_production_shot_catalogs(catalog_id);

ALTER TABLE ONLY ads.content_production_shot_catalogs
    ADD CONSTRAINT content_production_shot_catalogs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_production_shot_jobs
    ADD CONSTRAINT content_production_shot_jobs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_production_shot_jobs
    ADD CONSTRAINT content_production_shot_jobs_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES ads.content_production_shot_catalogs(catalog_id);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES ads.content_remix_batches(batch_id);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_output_asset_id_fkey FOREIGN KEY (output_asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_remix_batch_runs
    ADD CONSTRAINT content_remix_batch_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES ads.content_production_runs(run_id);

ALTER TABLE ONLY ads.content_remix_batches
    ADD CONSTRAINT content_remix_batches_preset_key_preset_version_fkey FOREIGN KEY (preset_key, preset_version) REFERENCES ads.content_segment_presets(preset_key, version);

ALTER TABLE ONLY ads.content_segment_suggestion_jobs
    ADD CONSTRAINT content_segment_suggestion_jobs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_segment_suggestion_jobs
    ADD CONSTRAINT content_segment_suggestion_jobs_preset_key_preset_version_fkey FOREIGN KEY (preset_key, preset_version) REFERENCES ads.content_segment_presets(preset_key, version);

ALTER TABLE ONLY ads.content_segments
    ADD CONSTRAINT content_segments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id);

ALTER TABLE ONLY ads.content_segments
    ADD CONSTRAINT content_segments_preset_key_preset_version_fkey FOREIGN KEY (preset_key, preset_version) REFERENCES ads.content_segment_presets(preset_key, version);

ALTER TABLE ONLY ads.marketing_content_ad_materials
    ADD CONSTRAINT marketing_content_ad_materials_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_ad_materials
    ADD CONSTRAINT marketing_content_ad_materials_platform_video_id_fkey FOREIGN KEY (platform_video_id) REFERENCES ads.marketing_content_platform_videos(platform_video_id) ON DELETE SET NULL;

ALTER TABLE ONLY ads.marketing_content_asset_events
    ADD CONSTRAINT marketing_content_asset_events_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_objects
    ADD CONSTRAINT marketing_content_asset_objects_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_processing_jobs
    ADD CONSTRAINT marketing_content_asset_processing_jobs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_sources
    ADD CONSTRAINT marketing_content_asset_sources_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_transcripts
    ADD CONSTRAINT marketing_content_asset_transcripts_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_jobs
    ADD CONSTRAINT marketing_content_asset_video_understanding_jobs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_jobs
    ADD CONSTRAINT marketing_content_asset_video_understanding_jobs_object_id_fkey FOREIGN KEY (object_id) REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL;

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_results
    ADD CONSTRAINT marketing_content_asset_video_understanding_resu_object_id_fkey FOREIGN KEY (object_id) REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL;

ALTER TABLE ONLY ads.marketing_content_asset_video_understanding_results
    ADD CONSTRAINT marketing_content_asset_video_understanding_resul_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY ads.marketing_content_platform_videos
    ADD CONSTRAINT marketing_content_platform_videos_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_role_permissions
    ADD CONSTRAINT auth_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.auth_permissions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_role_permissions
    ADD CONSTRAINT auth_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.auth_roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_user_roles
    ADD CONSTRAINT auth_user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.auth_roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_user_roles
    ADD CONSTRAINT auth_user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
