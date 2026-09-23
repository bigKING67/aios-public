ALTER TABLE ads.marketing_content_ad_materials
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS objective_source TEXT,
  ADD COLUMN IF NOT EXISTS performance_source_table TEXT,
  ADD COLUMN IF NOT EXISTS last_performance_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_quality_status TEXT;

ALTER TABLE ads.marketing_content_ad_materials
  DROP CONSTRAINT IF EXISTS marketing_content_ad_materials_delivery_mode_check,
  ADD CONSTRAINT marketing_content_ad_materials_delivery_mode_check
    CHECK (delivery_mode IS NULL OR delivery_mode IN ('qianchuan_all_domain'));

ALTER TABLE ads.marketing_content_ad_materials
  DROP CONSTRAINT IF EXISTS marketing_content_ad_materials_objective_check,
  ADD CONSTRAINT marketing_content_ad_materials_objective_check
    CHECK (
      objective IS NULL
      OR objective IN (
        'product_all_domain_shortvideo',
        'live_all_domain_shortvideo',
        'unknown'
      )
    );

ALTER TABLE ads.marketing_content_ad_materials
  DROP CONSTRAINT IF EXISTS marketing_content_ad_materials_quality_status_check,
  ADD CONSTRAINT marketing_content_ad_materials_quality_status_check
    CHECK (
      data_quality_status IS NULL
      OR data_quality_status IN (
        'ok',
        'missing_binding',
        'duplicate_binding',
        'duplicate_material_date',
        'cross_source_conflict',
        'insufficient_data'
      )
    );

CREATE INDEX IF NOT EXISTS idx_marketing_content_ad_materials_qianchuan_material_active_lookup
  ON ads.marketing_content_ad_materials(ad_platform, external_material_id)
  WHERE relation_status = 'active'
    AND ad_platform = 'qianchuan'
    AND NULLIF(BTRIM(external_material_id), '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS dwd.marketing_content_qianchuan_material_performance_di (
  stat_date DATE NOT NULL,
  material_id TEXT NOT NULL,
  asset_id UUID,
  ad_material_id UUID,
  platform_video_id UUID,
  delivery_mode TEXT NOT NULL DEFAULT 'qianchuan_all_domain',
  objective TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_file_name TEXT,
  source_row_count INTEGER NOT NULL DEFAULT 1,
  ingest_time TIMESTAMPTZ,
  material_video_name TEXT,
  material_created_at TIMESTAMPTZ,
  promotion_type TEXT,
  global_material_video_type TEXT,
  live_room_name TEXT,
  douyin_account_display_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  data_quality_status TEXT NOT NULL DEFAULT 'ok',
  sample_quality_status TEXT NOT NULL DEFAULT 'unknown',
  overall_impression_count BIGINT,
  overall_click_count BIGINT,
  overall_click_rate NUMERIC(18, 6),
  overall_conversion_rate NUMERIC(18, 6),
  overall_cost NUMERIC(18, 2),
  overall_cost_ratio NUMERIC(18, 6),
  overall_order_count INTEGER,
  overall_gmv NUMERIC(18, 2),
  overall_gmv_ratio NUMERIC(18, 6),
  base_cost NUMERIC(18, 2),
  overall_pay_roi NUMERIC(18, 6),
  overall_order_cost NUMERIC(18, 2),
  user_pay_amount NUMERIC(18, 2),
  overall_cpm NUMERIC(18, 2),
  overall_cpc NUMERIC(18, 2),
  smart_coupon_amount NUMERIC(18, 2),
  platform_subsidy_amount NUMERIC(18, 2),
  smart_coupon_unrefund_amount NUMERIC(18, 2),
  platform_subsidy_unrefund_amount NUMERIC(18, 2),
  overall_presale_order_count INTEGER,
  overall_presale_order_amount NUMERIC(18, 2),
  overall_unfinished_presale_estimated_amount NUMERIC(18, 2),
  net_gmv_roi NUMERIC(18, 6),
  net_gmv NUMERIC(18, 2),
  net_order_count INTEGER,
  net_order_cost NUMERIC(18, 2),
  net_user_pay_amount NUMERIC(18, 2),
  net_gmv_settlement_rate NUMERIC(18, 6),
  net_order_settlement_rate NUMERIC(18, 6),
  refund_order_count_1h INTEGER,
  refund_amount_1h NUMERIC(18, 2),
  refund_rate_1h NUMERIC(18, 6),
  settlement_roi_7d NUMERIC(18, 6),
  settlement_amount_7d NUMERIC(18, 2),
  settlement_order_count_7d INTEGER,
  settlement_order_cost_7d NUMERIC(18, 2),
  gmv_settlement_rate_7d NUMERIC(18, 6),
  order_settlement_rate_7d NUMERIC(18, 6),
  settlement_roi_14d NUMERIC(18, 6),
  settlement_amount_14d NUMERIC(18, 2),
  settlement_order_count_14d INTEGER,
  settlement_order_cost_14d NUMERIC(18, 2),
  gmv_settlement_rate_14d NUMERIC(18, 6),
  order_settlement_rate_14d NUMERIC(18, 6),
  settlement_roi_30d NUMERIC(18, 6),
  settlement_amount_30d NUMERIC(18, 2),
  settlement_order_count_30d INTEGER,
  settlement_order_cost_30d NUMERIC(18, 2),
  gmv_settlement_rate_30d NUMERIC(18, 6),
  order_settlement_rate_30d NUMERIC(18, 6),
  settlement_roi_90d NUMERIC(18, 6),
  settlement_amount_90d NUMERIC(18, 2),
  settlement_order_count_90d INTEGER,
  settlement_order_cost_90d NUMERIC(18, 2),
  gmv_settlement_rate_90d NUMERIC(18, 6),
  order_settlement_rate_90d NUMERIC(18, 6),
  video_like_count BIGINT,
  new_fans_count INTEGER,
  avg_watch_duration NUMERIC(18, 6),
  video_play_count BIGINT,
  video_complete_play_count BIGINT,
  video_complete_play_rate NUMERIC(18, 6),
  video_comment_count BIGINT,
  play_rate_2s NUMERIC(18, 6),
  play_rate_3s NUMERIC(18, 6),
  play_rate_5s NUMERIC(18, 6),
  play_rate_10s NUMERIC(18, 6),
  legacy_boost_cost NUMERIC(18, 2),
  legacy_boost_order_count INTEGER,
  legacy_boost_gmv NUMERIC(18, 2),
  legacy_boost_roi NUMERIC(18, 6),
  boost_cost NUMERIC(18, 2),
  boost_order_count INTEGER,
  boost_gmv NUMERIC(18, 2),
  boost_pay_roi NUMERIC(18, 6),
  boost_impression_count BIGINT,
  boost_click_rate NUMERIC(18, 6),
  boost_click_count BIGINT,
  boost_conversion_rate NUMERIC(18, 6),
  boost_user_pay_amount NUMERIC(18, 2),
  boost_smart_coupon_amount NUMERIC(18, 2),
  boost_platform_subsidy_amount NUMERIC(18, 2),
  boost_unfinished_presale_estimated_amount NUMERIC(18, 2),
  boost_order_cost NUMERIC(18, 2),
  boost_buyer_count INTEGER,
  boost_net_gmv NUMERIC(18, 2),
  boost_net_gmv_roi NUMERIC(18, 6),
  boost_net_order_count INTEGER,
  boost_net_conversion_rate NUMERIC(18, 6),
  boost_net_order_cost NUMERIC(18, 2),
  boost_net_user_pay_amount NUMERIC(18, 2),
  boost_smart_coupon_unrefund_amount NUMERIC(18, 2),
  boost_platform_subsidy_unrefund_amount NUMERIC(18, 2),
  boost_net_gmv_settlement_rate NUMERIC(18, 6),
  boost_net_order_settlement_rate NUMERIC(18, 6),
  boost_refund_order_count_1h INTEGER,
  boost_refund_amount_1h NUMERIC(18, 2),
  boost_refund_rate_1h NUMERIC(18, 6),
  boost_settlement_roi_7d NUMERIC(18, 6),
  boost_settlement_amount_7d NUMERIC(18, 2),
  boost_settlement_order_count_7d INTEGER,
  boost_settlement_order_cost_7d NUMERIC(18, 2),
  boost_gmv_settlement_rate_7d NUMERIC(18, 6),
  boost_order_settlement_rate_7d NUMERIC(18, 6),
  boost_settlement_roi_14d NUMERIC(18, 6),
  boost_settlement_amount_14d NUMERIC(18, 2),
  boost_settlement_order_count_14d INTEGER,
  boost_settlement_order_cost_14d NUMERIC(18, 2),
  boost_gmv_settlement_rate_14d NUMERIC(18, 6),
  boost_order_settlement_rate_14d NUMERIC(18, 6),
  boost_settlement_roi_30d NUMERIC(18, 6),
  boost_settlement_amount_30d NUMERIC(18, 2),
  boost_settlement_order_count_30d INTEGER,
  boost_settlement_order_cost_30d NUMERIC(18, 2),
  boost_gmv_settlement_rate_30d NUMERIC(18, 6),
  boost_order_settlement_rate_30d NUMERIC(18, 6),
  boost_settlement_roi_90d NUMERIC(18, 6),
  boost_settlement_amount_90d NUMERIC(18, 2),
  boost_settlement_order_count_90d INTEGER,
  boost_settlement_order_cost_90d NUMERIC(18, 2),
  boost_gmv_settlement_rate_90d NUMERIC(18, 6),
  boost_order_settlement_rate_90d NUMERIC(18, 6),
  raw_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  diagnosis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (material_id, stat_date),
  CONSTRAINT marketing_content_qianchuan_material_perf_delivery_check
    CHECK (delivery_mode = 'qianchuan_all_domain'),
  CONSTRAINT marketing_content_qianchuan_material_perf_objective_check
    CHECK (objective IN ('product_all_domain_shortvideo', 'live_all_domain_shortvideo')),
  CONSTRAINT marketing_content_qianchuan_material_perf_match_check
    CHECK (match_status IN ('matched', 'unmatched', 'ambiguous')),
  CONSTRAINT marketing_content_qianchuan_material_perf_quality_check
    CHECK (
      data_quality_status IN (
        'ok',
        'missing_binding',
        'duplicate_binding',
        'duplicate_material_date',
        'cross_source_conflict',
        'insufficient_data'
      )
    ),
  CONSTRAINT marketing_content_qianchuan_material_perf_sample_check
    CHECK (sample_quality_status IN ('ok', 'early_signal', 'insufficient_sample', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_qianchuan_material_perf_asset_date
  ON dwd.marketing_content_qianchuan_material_performance_di(asset_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_material_perf_objective_date
  ON dwd.marketing_content_qianchuan_material_performance_di(objective, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_material_perf_account_date
  ON dwd.marketing_content_qianchuan_material_performance_di(douyin_account_display_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_material_perf_quality
  ON dwd.marketing_content_qianchuan_material_performance_di(data_quality_status);

CREATE TABLE IF NOT EXISTS dws.marketing_content_qianchuan_live_room_acceptance_di (
  stat_date DATE NOT NULL,
  douyin_account_display_id TEXT NOT NULL,
  anchor_nickname TEXT,
  live_count INTEGER NOT NULL DEFAULT 0,
  live_duration_minutes INTEGER,
  live_exposure_user_count BIGINT,
  live_exposure_count BIGINT,
  live_watch_user_count BIGINT,
  live_watch_count BIGINT,
  hourly_watch_user_count BIGINT,
  max_online_count INTEGER,
  avg_online_count INTEGER,
  avg_watch_duration_minutes NUMERIC(18, 6),
  comment_count BIGINT,
  new_follower_count BIGINT,
  live_product_exposure_user BIGINT,
  live_product_click_user BIGINT,
  live_product_exposure_count BIGINT,
  live_product_click_count BIGINT,
  product_click_rate_user NUMERIC(18, 6),
  product_click_rate_count NUMERIC(18, 6),
  live_order_count BIGINT,
  live_gmv NUMERIC(18, 2),
  live_user_pay_amount NUMERIC(18, 2),
  live_buyer_count BIGINT,
  watch_to_pay_rate_user NUMERIC(18, 6),
  watch_to_pay_rate_count NUMERIC(18, 6),
  click_to_pay_rate_user NUMERIC(18, 6),
  click_to_pay_rate_count NUMERIC(18, 6),
  live_ad_cost NUMERIC(18, 2),
  ad_cost_shop_bound NUMERIC(18, 2),
  ad_cost_shop_targeted NUMERIC(18, 2),
  net_gmv NUMERIC(18, 2),
  net_order_count BIGINT,
  refund_rate_1h NUMERIC(18, 6),
  acceptance_quality_status TEXT NOT NULL DEFAULT 'ok',
  raw_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stat_date, douyin_account_display_id),
  CONSTRAINT marketing_content_qianchuan_live_acceptance_quality_check
    CHECK (acceptance_quality_status IN ('ok', 'missing_account', 'insufficient_data'))
);

CREATE TABLE IF NOT EXISTS dws.marketing_content_qianchuan_material_summary (
  material_id TEXT PRIMARY KEY,
  asset_id UUID,
  ad_material_id UUID,
  platform_video_id UUID,
  delivery_mode TEXT NOT NULL DEFAULT 'qianchuan_all_domain',
  objective TEXT NOT NULL,
  source_table TEXT NOT NULL,
  material_video_name TEXT,
  material_created_at TIMESTAMPTZ,
  live_room_name TEXT,
  douyin_account_display_id TEXT,
  first_stat_date DATE,
  last_stat_date DATE,
  active_days INTEGER NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_orders BIGINT NOT NULL DEFAULT 0,
  total_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_net_orders BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(18, 6),
  cvr NUMERIC(18, 6),
  pay_roi NUMERIC(18, 6),
  net_gmv_roi NUMERIC(18, 6),
  order_cost NUMERIC(18, 2),
  net_order_cost NUMERIC(18, 2),
  refund_rate_1h NUMERIC(18, 6),
  net_gmv_settlement_rate NUMERIC(18, 6),
  video_play_count BIGINT,
  video_complete_play_rate NUMERIC(18, 6),
  avg_watch_duration NUMERIC(18, 6),
  play_rate_2s NUMERIC(18, 6),
  play_rate_3s NUMERIC(18, 6),
  play_rate_5s NUMERIC(18, 6),
  play_rate_10s NUMERIC(18, 6),
  latest_live_acceptance_status TEXT,
  data_quality_status TEXT NOT NULL DEFAULT 'ok',
  sample_quality_status TEXT NOT NULL DEFAULT 'unknown',
  diagnosis_status TEXT NOT NULL DEFAULT 'pending',
  diagnosis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  latest_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_qianchuan_material_summary_objective_check
    CHECK (objective IN ('product_all_domain_shortvideo', 'live_all_domain_shortvideo'))
);

CREATE INDEX IF NOT EXISTS idx_qianchuan_material_summary_asset
  ON dws.marketing_content_qianchuan_material_summary(asset_id);
CREATE INDEX IF NOT EXISTS idx_qianchuan_material_summary_objective
  ON dws.marketing_content_qianchuan_material_summary(objective);
CREATE INDEX IF NOT EXISTS idx_qianchuan_material_summary_account
  ON dws.marketing_content_qianchuan_material_summary(douyin_account_display_id);

CREATE TABLE IF NOT EXISTS dws.marketing_content_asset_qianchuan_summary (
  asset_id UUID PRIMARY KEY,
  delivery_mode TEXT NOT NULL DEFAULT 'qianchuan_all_domain',
  material_count INTEGER NOT NULL DEFAULT 0,
  product_material_count INTEGER NOT NULL DEFAULT 0,
  live_material_count INTEGER NOT NULL DEFAULT 0,
  first_stat_date DATE,
  last_stat_date DATE,
  material_active_days INTEGER NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_orders BIGINT NOT NULL DEFAULT 0,
  total_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_net_orders BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(18, 6),
  cvr NUMERIC(18, 6),
  pay_roi NUMERIC(18, 6),
  net_gmv_roi NUMERIC(18, 6),
  order_cost NUMERIC(18, 2),
  net_order_cost NUMERIC(18, 2),
  refund_rate_1h NUMERIC(18, 6),
  net_gmv_settlement_rate NUMERIC(18, 6),
  latest_live_acceptance_status TEXT,
  data_quality_status TEXT NOT NULL DEFAULT 'ok',
  sample_quality_status TEXT NOT NULL DEFAULT 'unknown',
  diagnosis_status TEXT NOT NULL DEFAULT 'pending',
  objective_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
  material_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  latest_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_qianchuan_summary_delivery_mode_check
    CHECK (delivery_mode = 'qianchuan_all_domain')
);

CREATE INDEX IF NOT EXISTS idx_qianchuan_asset_summary_last_stat_date
  ON dws.marketing_content_asset_qianchuan_summary(last_stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_asset_summary_quality
  ON dws.marketing_content_asset_qianchuan_summary(data_quality_status, sample_quality_status);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_jobs (
  job_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_id UUID REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL,
  media_hash TEXT NOT NULL,
  media_url TEXT,
  storage_key TEXT,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  analysis_schema_version TEXT NOT NULL DEFAULT '2.1',
  input_snapshot_hash TEXT,
  cache_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_video_understanding_jobs_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_asset_video_understanding_job_cache
  ON ads.marketing_content_asset_video_understanding_jobs(
    asset_id,
    media_hash,
    model_name,
    prompt_version,
    analysis_schema_version
  );

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_results (
  result_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_id UUID REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL,
  media_hash TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  analysis_schema_version TEXT NOT NULL DEFAULT '2.1',
  input_snapshot_hash TEXT NOT NULL,
  cache_key TEXT,
  result_json JSONB NOT NULL,
  confidence NUMERIC(8, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_asset_video_understanding_result_cache
  ON ads.marketing_content_asset_video_understanding_results(
    asset_id,
    media_hash,
    model_name,
    prompt_version,
    analysis_schema_version,
    input_snapshot_hash
  );

ALTER TABLE ads.marketing_content_asset_video_understanding_jobs
  ADD COLUMN IF NOT EXISTS cache_key TEXT;

ALTER TABLE ads.marketing_content_asset_video_understanding_jobs
  ADD COLUMN IF NOT EXISTS input_snapshot_hash TEXT;

ALTER TABLE ads.marketing_content_asset_video_understanding_results
  ADD COLUMN IF NOT EXISTS cache_key TEXT;

CREATE INDEX IF NOT EXISTS idx_content_asset_video_understanding_jobs_cache_key
  ON ads.marketing_content_asset_video_understanding_jobs(cache_key)
  WHERE cache_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_asset_video_understanding_results_cache_key
  ON ads.marketing_content_asset_video_understanding_results(cache_key)
  WHERE cache_key IS NOT NULL;

CREATE OR REPLACE FUNCTION ads.refresh_marketing_content_qianchuan_all_domain_performance(
  p_asset_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  product_daily_rows BIGINT,
  live_daily_rows BIGINT,
  live_acceptance_rows BIGINT,
  summary_rows BIGINT,
  thin_projection_rows BIGINT
) LANGUAGE plpgsql AS $$
DECLARE
  v_product_rows BIGINT := 0;
  v_live_rows BIGINT := 0;
  v_acceptance_rows BIGINT := 0;
  v_summary_rows BIGINT := 0;
  v_asset_summary_rows BIGINT := 0;
  v_thin_rows BIGINT := 0;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date cannot be later than p_end_date';
  END IF;

  IF to_regclass('ods.douyin_qianchuan_shortvideo_raw') IS NOT NULL THEN
    WITH source_rows AS (
      SELECT
        raw.*,
        COUNT(*) OVER (PARTITION BY raw.material_id, raw.stat_date) AS duplicate_count
      FROM ods.douyin_qianchuan_shortvideo_raw raw
      WHERE (p_start_date IS NULL OR raw.stat_date >= p_start_date)
        AND (p_end_date IS NULL OR raw.stat_date <= p_end_date)
        AND NULLIF(BTRIM(raw.material_id), '') IS NOT NULL
    ),
    deduped AS (
      SELECT *
      FROM (
        SELECT
          source_rows.*,
          ROW_NUMBER() OVER (
            PARTITION BY source_rows.material_id, source_rows.stat_date
            ORDER BY source_rows.ingest_time DESC NULLS LAST, source_rows.id DESC NULLS LAST
          ) AS material_date_rank
        FROM source_rows
      ) ranked
      WHERE material_date_rank = 1
    ),
    resolved AS (
      SELECT
        deduped.*,
        matched.material_match_count,
        matched.asset_id,
        matched.platform_video_id,
        matched.ad_material_id
      FROM deduped
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INTEGER AS material_match_count,
          (ARRAY_AGG(material.asset_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS asset_id,
          (ARRAY_AGG(material.platform_video_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS platform_video_id,
          (ARRAY_AGG(material.ad_material_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS ad_material_id
        FROM ads.marketing_content_ad_materials material
        WHERE material.ad_platform = 'qianchuan'
          AND material.relation_status = 'active'
          AND material.external_material_id = deduped.material_id
      ) matched ON TRUE
      WHERE p_asset_id IS NULL OR matched.asset_id = p_asset_id
    ),
    upserted AS (
      INSERT INTO dwd.marketing_content_qianchuan_material_performance_di (
        stat_date,
        material_id,
        asset_id,
        ad_material_id,
        platform_video_id,
        objective,
        source_table,
        source_file_name,
        source_row_count,
        ingest_time,
        material_video_name,
        material_created_at,
        match_status,
        data_quality_status,
        sample_quality_status,
        overall_impression_count,
        overall_click_count,
        overall_click_rate,
        overall_conversion_rate,
        overall_cost,
        overall_order_count,
        overall_gmv,
        overall_pay_roi,
        overall_order_cost,
        user_pay_amount,
        overall_cpm,
        overall_cpc,
        smart_coupon_amount,
        platform_subsidy_amount,
        net_gmv_roi,
        net_gmv,
        net_order_count,
        net_order_cost,
        net_gmv_settlement_rate,
        refund_rate_1h,
        raw_metrics,
        updated_at
      )
      SELECT
        stat_date,
        material_id,
        asset_id,
        ad_material_id,
        platform_video_id,
        'product_all_domain_shortvideo',
        'ods.douyin_qianchuan_shortvideo_raw',
        source_file_name,
        duplicate_count::INTEGER,
        ingest_time,
        material_video_name,
        material_created_at,
        CASE
          WHEN COALESCE(material_match_count, 0) > 1 THEN 'ambiguous'
          WHEN ad_material_id IS NOT NULL THEN 'matched'
          ELSE 'unmatched'
        END,
        CASE
          WHEN duplicate_count > 1 THEN 'duplicate_material_date'
          WHEN COALESCE(material_match_count, 0) > 1 THEN 'duplicate_binding'
          WHEN ad_material_id IS NULL THEN 'missing_binding'
          ELSE 'ok'
        END,
        CASE
          WHEN COALESCE(overall_impression_count, 0) < 1000
            OR COALESCE(overall_click_count, 0) < 30
            OR COALESCE(overall_cost, 0) < 50 THEN 'insufficient_sample'
          ELSE 'ok'
        END,
        overall_impression_count,
        overall_click_count,
        COALESCE(overall_click_rate, overall_click_count::NUMERIC / NULLIF(overall_impression_count, 0)),
        overall_conversion_rate,
        overall_cost,
        overall_order_count,
        overall_gmv,
        COALESCE(overall_pay_roi, overall_gmv / NULLIF(overall_cost, 0)),
        overall_order_cost,
        user_pay_amount,
        overall_cpm,
        overall_cpc,
        smart_coupon_amount,
        platform_subsidy_amount,
        net_gmv_roi,
        net_gmv,
        net_order_count,
        net_order_cost,
        net_gmv_settlement_rate,
        refund_rate_1h,
        to_jsonb(resolved) - 'id' - 'material_date_rank',
        CURRENT_TIMESTAMP
      FROM resolved
      ON CONFLICT (material_id, stat_date) DO UPDATE
      SET asset_id = EXCLUDED.asset_id,
          ad_material_id = EXCLUDED.ad_material_id,
          platform_video_id = EXCLUDED.platform_video_id,
          objective = CASE
            WHEN dwd.marketing_content_qianchuan_material_performance_di.objective <> EXCLUDED.objective
            THEN dwd.marketing_content_qianchuan_material_performance_di.objective
            ELSE EXCLUDED.objective
          END,
          source_table = EXCLUDED.source_table,
          source_file_name = EXCLUDED.source_file_name,
          source_row_count = EXCLUDED.source_row_count,
          ingest_time = EXCLUDED.ingest_time,
          material_video_name = EXCLUDED.material_video_name,
          material_created_at = EXCLUDED.material_created_at,
          match_status = EXCLUDED.match_status,
          data_quality_status = CASE
            WHEN dwd.marketing_content_qianchuan_material_performance_di.data_quality_status = 'cross_source_conflict'
            THEN 'cross_source_conflict'
            ELSE EXCLUDED.data_quality_status
          END,
          sample_quality_status = EXCLUDED.sample_quality_status,
          overall_impression_count = EXCLUDED.overall_impression_count,
          overall_click_count = EXCLUDED.overall_click_count,
          overall_click_rate = EXCLUDED.overall_click_rate,
          overall_conversion_rate = EXCLUDED.overall_conversion_rate,
          overall_cost = EXCLUDED.overall_cost,
          overall_order_count = EXCLUDED.overall_order_count,
          overall_gmv = EXCLUDED.overall_gmv,
          overall_pay_roi = EXCLUDED.overall_pay_roi,
          overall_order_cost = EXCLUDED.overall_order_cost,
          user_pay_amount = EXCLUDED.user_pay_amount,
          overall_cpm = EXCLUDED.overall_cpm,
          overall_cpc = EXCLUDED.overall_cpc,
          smart_coupon_amount = EXCLUDED.smart_coupon_amount,
          platform_subsidy_amount = EXCLUDED.platform_subsidy_amount,
          net_gmv_roi = EXCLUDED.net_gmv_roi,
          net_gmv = EXCLUDED.net_gmv,
          net_order_count = EXCLUDED.net_order_count,
          net_order_cost = EXCLUDED.net_order_cost,
          net_gmv_settlement_rate = EXCLUDED.net_gmv_settlement_rate,
          refund_rate_1h = EXCLUDED.refund_rate_1h,
          raw_metrics = EXCLUDED.raw_metrics,
          updated_at = CURRENT_TIMESTAMP
      WHERE dwd.marketing_content_qianchuan_material_performance_di.objective = EXCLUDED.objective
      RETURNING 1
    ),
    flagged_conflicts AS (
      UPDATE dwd.marketing_content_qianchuan_material_performance_di perf
      SET data_quality_status = 'cross_source_conflict',
          raw_metrics = CASE
            WHEN jsonb_typeof(perf.raw_metrics) = 'object'
            THEN perf.raw_metrics || jsonb_build_object(
              'crossSourceConflict',
              jsonb_build_object(
                'conflictingObjective', 'product_all_domain_shortvideo',
                'conflictingSourceTable', 'ods.douyin_qianchuan_shortvideo_raw',
                'conflictingSourceFileName', resolved.source_file_name,
                'conflictingIngestTime', resolved.ingest_time,
                'detectedAt', CURRENT_TIMESTAMP
              )
            )
            ELSE jsonb_build_object(
              'primaryRawMetrics', perf.raw_metrics,
              'crossSourceConflict',
              jsonb_build_object(
                'conflictingObjective', 'product_all_domain_shortvideo',
                'conflictingSourceTable', 'ods.douyin_qianchuan_shortvideo_raw',
                'conflictingSourceFileName', resolved.source_file_name,
                'conflictingIngestTime', resolved.ingest_time,
                'detectedAt', CURRENT_TIMESTAMP
              )
            )
          END,
          updated_at = CURRENT_TIMESTAMP
      FROM resolved
      WHERE perf.material_id = resolved.material_id
        AND perf.stat_date = resolved.stat_date
        AND perf.objective <> 'product_all_domain_shortvideo'
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_product_rows
    FROM (
      SELECT 1 FROM upserted
      UNION ALL
      SELECT 1 FROM flagged_conflicts
    ) counted;
  END IF;

  IF to_regclass('ods.douyin_qianchuan_live_video_raw') IS NOT NULL THEN
    WITH base AS (
      SELECT *
      FROM ods.douyin_qianchuan_live_video_raw raw
      WHERE (p_start_date IS NULL OR raw.stat_date >= p_start_date)
        AND (p_end_date IS NULL OR raw.stat_date <= p_end_date)
        AND NULLIF(BTRIM(raw.material_id), '') IS NOT NULL
    ),
    grouped AS (
      SELECT
        material_id,
        stat_date,
        COUNT(*)::INTEGER AS source_row_count,
        MAX(material_video_name) AS material_video_name,
        MIN(material_created_at) AS material_created_at,
        MAX(promotion_type) AS promotion_type,
        MAX(global_material_video_type) AS global_material_video_type,
        MAX(live_room_name) AS live_room_name,
        MAX(douyin_account_display_id) AS douyin_account_display_id,
        MAX(source_file_name) AS source_file_name,
        MAX(ingest_time) AS ingest_time,
        SUM(overall_impression_count) AS overall_impression_count,
        SUM(overall_click_count) AS overall_click_count,
        SUM(overall_click_count)::NUMERIC / NULLIF(SUM(overall_impression_count), 0) AS overall_click_rate,
        SUM(overall_order_count)::NUMERIC / NULLIF(SUM(overall_click_count), 0) AS overall_conversion_rate,
        SUM(overall_cost) AS overall_cost,
        AVG(overall_cost_ratio) AS overall_cost_ratio,
        SUM(overall_order_count) AS overall_order_count,
        SUM(overall_gmv) AS overall_gmv,
        AVG(overall_gmv_ratio) AS overall_gmv_ratio,
        SUM(base_cost) AS base_cost,
        SUM(overall_gmv) / NULLIF(SUM(overall_cost), 0) AS overall_pay_roi,
        SUM(overall_cost) / NULLIF(SUM(overall_order_count), 0) AS overall_order_cost,
        SUM(user_pay_amount) AS user_pay_amount,
        SUM(overall_cost) * 1000 / NULLIF(SUM(overall_impression_count), 0) AS overall_cpm,
        SUM(overall_cost) / NULLIF(SUM(overall_click_count), 0) AS overall_cpc,
        SUM(smart_coupon_amount) AS smart_coupon_amount,
        SUM(platform_subsidy_amount) AS platform_subsidy_amount,
        SUM(smart_coupon_unrefund_amount) AS smart_coupon_unrefund_amount,
        SUM(platform_subsidy_unrefund_amount) AS platform_subsidy_unrefund_amount,
        SUM(overall_presale_order_count) AS overall_presale_order_count,
        SUM(overall_presale_order_amount) AS overall_presale_order_amount,
        SUM(overall_unfinished_presale_estimated_amount) AS overall_unfinished_presale_estimated_amount,
        SUM(net_gmv) / NULLIF(SUM(overall_cost), 0) AS net_gmv_roi,
        SUM(net_gmv) AS net_gmv,
        SUM(net_order_count) AS net_order_count,
        SUM(overall_cost) / NULLIF(SUM(net_order_count), 0) AS net_order_cost,
        SUM(net_user_pay_amount) AS net_user_pay_amount,
        AVG(net_gmv_settlement_rate) AS net_gmv_settlement_rate,
        AVG(net_order_settlement_rate) AS net_order_settlement_rate,
        SUM(refund_order_count_1h) AS refund_order_count_1h,
        SUM(refund_amount_1h) AS refund_amount_1h,
        AVG(refund_rate_1h) AS refund_rate_1h,
        AVG(settlement_roi_7d) AS settlement_roi_7d,
        SUM(settlement_amount_7d) AS settlement_amount_7d,
        SUM(settlement_order_count_7d) AS settlement_order_count_7d,
        AVG(settlement_order_cost_7d) AS settlement_order_cost_7d,
        AVG(gmv_settlement_rate_7d) AS gmv_settlement_rate_7d,
        AVG(order_settlement_rate_7d) AS order_settlement_rate_7d,
        AVG(settlement_roi_14d) AS settlement_roi_14d,
        SUM(settlement_amount_14d) AS settlement_amount_14d,
        SUM(settlement_order_count_14d) AS settlement_order_count_14d,
        AVG(settlement_order_cost_14d) AS settlement_order_cost_14d,
        AVG(gmv_settlement_rate_14d) AS gmv_settlement_rate_14d,
        AVG(order_settlement_rate_14d) AS order_settlement_rate_14d,
        AVG(settlement_roi_30d) AS settlement_roi_30d,
        SUM(settlement_amount_30d) AS settlement_amount_30d,
        SUM(settlement_order_count_30d) AS settlement_order_count_30d,
        AVG(settlement_order_cost_30d) AS settlement_order_cost_30d,
        AVG(gmv_settlement_rate_30d) AS gmv_settlement_rate_30d,
        AVG(order_settlement_rate_30d) AS order_settlement_rate_30d,
        AVG(settlement_roi_90d) AS settlement_roi_90d,
        SUM(settlement_amount_90d) AS settlement_amount_90d,
        SUM(settlement_order_count_90d) AS settlement_order_count_90d,
        AVG(settlement_order_cost_90d) AS settlement_order_cost_90d,
        AVG(gmv_settlement_rate_90d) AS gmv_settlement_rate_90d,
        AVG(order_settlement_rate_90d) AS order_settlement_rate_90d,
        SUM(video_like_count) AS video_like_count,
        SUM(new_fans_count) AS new_fans_count,
        AVG(avg_watch_duration) AS avg_watch_duration,
        SUM(video_play_count) AS video_play_count,
        SUM(video_complete_play_count) AS video_complete_play_count,
        SUM(video_complete_play_count)::NUMERIC / NULLIF(SUM(video_play_count), 0) AS video_complete_play_rate,
        SUM(video_comment_count) AS video_comment_count,
        AVG(play_rate_2s) AS play_rate_2s,
        AVG(play_rate_3s) AS play_rate_3s,
        AVG(play_rate_5s) AS play_rate_5s,
        AVG(play_rate_10s) AS play_rate_10s,
        SUM(legacy_boost_cost) AS legacy_boost_cost,
        SUM(legacy_boost_order_count) AS legacy_boost_order_count,
        SUM(legacy_boost_gmv) AS legacy_boost_gmv,
        SUM(legacy_boost_gmv) / NULLIF(SUM(legacy_boost_cost), 0) AS legacy_boost_roi,
        SUM(boost_cost) AS boost_cost,
        SUM(boost_order_count) AS boost_order_count,
        SUM(boost_gmv) AS boost_gmv,
        SUM(boost_gmv) / NULLIF(SUM(boost_cost), 0) AS boost_pay_roi,
        SUM(boost_impression_count) AS boost_impression_count,
        SUM(boost_click_count)::NUMERIC / NULLIF(SUM(boost_impression_count), 0) AS boost_click_rate,
        SUM(boost_click_count) AS boost_click_count,
        SUM(boost_order_count)::NUMERIC / NULLIF(SUM(boost_click_count), 0) AS boost_conversion_rate,
        SUM(boost_user_pay_amount) AS boost_user_pay_amount,
        SUM(boost_smart_coupon_amount) AS boost_smart_coupon_amount,
        SUM(boost_platform_subsidy_amount) AS boost_platform_subsidy_amount,
        SUM(boost_unfinished_presale_estimated_amount) AS boost_unfinished_presale_estimated_amount,
        SUM(boost_cost) / NULLIF(SUM(boost_order_count), 0) AS boost_order_cost,
        SUM(boost_buyer_count) AS boost_buyer_count,
        SUM(boost_net_gmv) AS boost_net_gmv,
        SUM(boost_net_gmv) / NULLIF(SUM(boost_cost), 0) AS boost_net_gmv_roi,
        SUM(boost_net_order_count) AS boost_net_order_count,
        AVG(boost_net_conversion_rate) AS boost_net_conversion_rate,
        SUM(boost_cost) / NULLIF(SUM(boost_net_order_count), 0) AS boost_net_order_cost,
        SUM(boost_net_user_pay_amount) AS boost_net_user_pay_amount,
        SUM(boost_smart_coupon_unrefund_amount) AS boost_smart_coupon_unrefund_amount,
        SUM(boost_platform_subsidy_unrefund_amount) AS boost_platform_subsidy_unrefund_amount,
        AVG(boost_net_gmv_settlement_rate) AS boost_net_gmv_settlement_rate,
        AVG(boost_net_order_settlement_rate) AS boost_net_order_settlement_rate,
        SUM(boost_refund_order_count_1h) AS boost_refund_order_count_1h,
        SUM(boost_refund_amount_1h) AS boost_refund_amount_1h,
        AVG(boost_refund_rate_1h) AS boost_refund_rate_1h,
        AVG(boost_settlement_roi_7d) AS boost_settlement_roi_7d,
        SUM(boost_settlement_amount_7d) AS boost_settlement_amount_7d,
        SUM(boost_settlement_order_count_7d) AS boost_settlement_order_count_7d,
        AVG(boost_settlement_order_cost_7d) AS boost_settlement_order_cost_7d,
        AVG(boost_gmv_settlement_rate_7d) AS boost_gmv_settlement_rate_7d,
        AVG(boost_order_settlement_rate_7d) AS boost_order_settlement_rate_7d,
        AVG(boost_settlement_roi_14d) AS boost_settlement_roi_14d,
        SUM(boost_settlement_amount_14d) AS boost_settlement_amount_14d,
        SUM(boost_settlement_order_count_14d) AS boost_settlement_order_count_14d,
        AVG(boost_settlement_order_cost_14d) AS boost_settlement_order_cost_14d,
        AVG(boost_gmv_settlement_rate_14d) AS boost_gmv_settlement_rate_14d,
        AVG(boost_order_settlement_rate_14d) AS boost_order_settlement_rate_14d,
        AVG(boost_settlement_roi_30d) AS boost_settlement_roi_30d,
        SUM(boost_settlement_amount_30d) AS boost_settlement_amount_30d,
        SUM(boost_settlement_order_count_30d) AS boost_settlement_order_count_30d,
        AVG(boost_settlement_order_cost_30d) AS boost_settlement_order_cost_30d,
        AVG(boost_gmv_settlement_rate_30d) AS boost_gmv_settlement_rate_30d,
        AVG(boost_order_settlement_rate_30d) AS boost_order_settlement_rate_30d,
        AVG(boost_settlement_roi_90d) AS boost_settlement_roi_90d,
        SUM(boost_settlement_amount_90d) AS boost_settlement_amount_90d,
        SUM(boost_settlement_order_count_90d) AS boost_settlement_order_count_90d,
        AVG(boost_settlement_order_cost_90d) AS boost_settlement_order_cost_90d,
        AVG(boost_gmv_settlement_rate_90d) AS boost_gmv_settlement_rate_90d,
        AVG(boost_order_settlement_rate_90d) AS boost_order_settlement_rate_90d,
        jsonb_agg(to_jsonb(base) - 'id' ORDER BY stat_date, id) AS raw_metrics
      FROM base
      GROUP BY material_id, stat_date
    ),
    resolved AS (
      SELECT
        grouped.*,
        matched.material_match_count,
        matched.asset_id,
        matched.platform_video_id,
        matched.ad_material_id
      FROM grouped
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::INTEGER AS material_match_count,
          (ARRAY_AGG(material.asset_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS asset_id,
          (ARRAY_AGG(material.platform_video_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS platform_video_id,
          (ARRAY_AGG(material.ad_material_id ORDER BY material.updated_at DESC, material.created_at DESC))[1] AS ad_material_id
        FROM ads.marketing_content_ad_materials material
        WHERE material.ad_platform = 'qianchuan'
          AND material.relation_status = 'active'
          AND material.external_material_id = grouped.material_id
      ) matched ON TRUE
      WHERE p_asset_id IS NULL OR matched.asset_id = p_asset_id
    ),
    upserted AS (
      INSERT INTO dwd.marketing_content_qianchuan_material_performance_di (
        stat_date,
        material_id,
        asset_id,
        ad_material_id,
        platform_video_id,
        objective,
        source_table,
        source_file_name,
        source_row_count,
        ingest_time,
        material_video_name,
        material_created_at,
        promotion_type,
        global_material_video_type,
        live_room_name,
        douyin_account_display_id,
        match_status,
        data_quality_status,
        sample_quality_status,
        overall_impression_count,
        overall_click_count,
        overall_click_rate,
        overall_conversion_rate,
        overall_cost,
        overall_cost_ratio,
        overall_order_count,
        overall_gmv,
        overall_gmv_ratio,
        base_cost,
        overall_pay_roi,
        overall_order_cost,
        user_pay_amount,
        overall_cpm,
        overall_cpc,
        smart_coupon_amount,
        platform_subsidy_amount,
        smart_coupon_unrefund_amount,
        platform_subsidy_unrefund_amount,
        overall_presale_order_count,
        overall_presale_order_amount,
        overall_unfinished_presale_estimated_amount,
        net_gmv_roi,
        net_gmv,
        net_order_count,
        net_order_cost,
        net_user_pay_amount,
        net_gmv_settlement_rate,
        net_order_settlement_rate,
        refund_order_count_1h,
        refund_amount_1h,
        refund_rate_1h,
        settlement_roi_7d,
        settlement_amount_7d,
        settlement_order_count_7d,
        settlement_order_cost_7d,
        gmv_settlement_rate_7d,
        order_settlement_rate_7d,
        settlement_roi_14d,
        settlement_amount_14d,
        settlement_order_count_14d,
        settlement_order_cost_14d,
        gmv_settlement_rate_14d,
        order_settlement_rate_14d,
        settlement_roi_30d,
        settlement_amount_30d,
        settlement_order_count_30d,
        settlement_order_cost_30d,
        gmv_settlement_rate_30d,
        order_settlement_rate_30d,
        settlement_roi_90d,
        settlement_amount_90d,
        settlement_order_count_90d,
        settlement_order_cost_90d,
        gmv_settlement_rate_90d,
        order_settlement_rate_90d,
        video_like_count,
        new_fans_count,
        avg_watch_duration,
        video_play_count,
        video_complete_play_count,
        video_complete_play_rate,
        video_comment_count,
        play_rate_2s,
        play_rate_3s,
        play_rate_5s,
        play_rate_10s,
        legacy_boost_cost,
        legacy_boost_order_count,
        legacy_boost_gmv,
        legacy_boost_roi,
        boost_cost,
        boost_order_count,
        boost_gmv,
        boost_pay_roi,
        boost_impression_count,
        boost_click_rate,
        boost_click_count,
        boost_conversion_rate,
        boost_user_pay_amount,
        boost_smart_coupon_amount,
        boost_platform_subsidy_amount,
        boost_unfinished_presale_estimated_amount,
        boost_order_cost,
        boost_buyer_count,
        boost_net_gmv,
        boost_net_gmv_roi,
        boost_net_order_count,
        boost_net_conversion_rate,
        boost_net_order_cost,
        boost_net_user_pay_amount,
        boost_smart_coupon_unrefund_amount,
        boost_platform_subsidy_unrefund_amount,
        boost_net_gmv_settlement_rate,
        boost_net_order_settlement_rate,
        boost_refund_order_count_1h,
        boost_refund_amount_1h,
        boost_refund_rate_1h,
        boost_settlement_roi_7d,
        boost_settlement_amount_7d,
        boost_settlement_order_count_7d,
        boost_settlement_order_cost_7d,
        boost_gmv_settlement_rate_7d,
        boost_order_settlement_rate_7d,
        boost_settlement_roi_14d,
        boost_settlement_amount_14d,
        boost_settlement_order_count_14d,
        boost_settlement_order_cost_14d,
        boost_gmv_settlement_rate_14d,
        boost_order_settlement_rate_14d,
        boost_settlement_roi_30d,
        boost_settlement_amount_30d,
        boost_settlement_order_count_30d,
        boost_settlement_order_cost_30d,
        boost_gmv_settlement_rate_30d,
        boost_order_settlement_rate_30d,
        boost_settlement_roi_90d,
        boost_settlement_amount_90d,
        boost_settlement_order_count_90d,
        boost_settlement_order_cost_90d,
        boost_gmv_settlement_rate_90d,
        boost_order_settlement_rate_90d,
        raw_metrics,
        updated_at
      )
      SELECT
        stat_date,
        material_id,
        asset_id,
        ad_material_id,
        platform_video_id,
        'live_all_domain_shortvideo',
        'ods.douyin_qianchuan_live_video_raw',
        source_file_name,
        source_row_count,
        ingest_time,
        material_video_name,
        material_created_at,
        promotion_type,
        global_material_video_type,
        live_room_name,
        douyin_account_display_id,
        CASE
          WHEN COALESCE(material_match_count, 0) > 1 THEN 'ambiguous'
          WHEN ad_material_id IS NOT NULL THEN 'matched'
          ELSE 'unmatched'
        END,
        CASE
          WHEN source_row_count > 1 THEN 'duplicate_material_date'
          WHEN COALESCE(material_match_count, 0) > 1 THEN 'duplicate_binding'
          WHEN ad_material_id IS NULL THEN 'missing_binding'
          ELSE 'ok'
        END,
        CASE
          WHEN COALESCE(overall_impression_count, 0) < 1000
            OR COALESCE(overall_click_count, 0) < 30
            OR COALESCE(overall_cost, 0) < 50 THEN 'insufficient_sample'
          ELSE 'ok'
        END,
        overall_impression_count,
        overall_click_count,
        overall_click_rate,
        overall_conversion_rate,
        overall_cost,
        overall_cost_ratio,
        overall_order_count,
        overall_gmv,
        overall_gmv_ratio,
        base_cost,
        overall_pay_roi,
        overall_order_cost,
        user_pay_amount,
        overall_cpm,
        overall_cpc,
        smart_coupon_amount,
        platform_subsidy_amount,
        smart_coupon_unrefund_amount,
        platform_subsidy_unrefund_amount,
        overall_presale_order_count,
        overall_presale_order_amount,
        overall_unfinished_presale_estimated_amount,
        net_gmv_roi,
        net_gmv,
        net_order_count,
        net_order_cost,
        net_user_pay_amount,
        net_gmv_settlement_rate,
        net_order_settlement_rate,
        refund_order_count_1h,
        refund_amount_1h,
        refund_rate_1h,
        settlement_roi_7d,
        settlement_amount_7d,
        settlement_order_count_7d,
        settlement_order_cost_7d,
        gmv_settlement_rate_7d,
        order_settlement_rate_7d,
        settlement_roi_14d,
        settlement_amount_14d,
        settlement_order_count_14d,
        settlement_order_cost_14d,
        gmv_settlement_rate_14d,
        order_settlement_rate_14d,
        settlement_roi_30d,
        settlement_amount_30d,
        settlement_order_count_30d,
        settlement_order_cost_30d,
        gmv_settlement_rate_30d,
        order_settlement_rate_30d,
        settlement_roi_90d,
        settlement_amount_90d,
        settlement_order_count_90d,
        settlement_order_cost_90d,
        gmv_settlement_rate_90d,
        order_settlement_rate_90d,
        video_like_count,
        new_fans_count,
        avg_watch_duration,
        video_play_count,
        video_complete_play_count,
        video_complete_play_rate,
        video_comment_count,
        play_rate_2s,
        play_rate_3s,
        play_rate_5s,
        play_rate_10s,
        legacy_boost_cost,
        legacy_boost_order_count,
        legacy_boost_gmv,
        legacy_boost_roi,
        boost_cost,
        boost_order_count,
        boost_gmv,
        boost_pay_roi,
        boost_impression_count,
        boost_click_rate,
        boost_click_count,
        boost_conversion_rate,
        boost_user_pay_amount,
        boost_smart_coupon_amount,
        boost_platform_subsidy_amount,
        boost_unfinished_presale_estimated_amount,
        boost_order_cost,
        boost_buyer_count,
        boost_net_gmv,
        boost_net_gmv_roi,
        boost_net_order_count,
        boost_net_conversion_rate,
        boost_net_order_cost,
        boost_net_user_pay_amount,
        boost_smart_coupon_unrefund_amount,
        boost_platform_subsidy_unrefund_amount,
        boost_net_gmv_settlement_rate,
        boost_net_order_settlement_rate,
        boost_refund_order_count_1h,
        boost_refund_amount_1h,
        boost_refund_rate_1h,
        boost_settlement_roi_7d,
        boost_settlement_amount_7d,
        boost_settlement_order_count_7d,
        boost_settlement_order_cost_7d,
        boost_gmv_settlement_rate_7d,
        boost_order_settlement_rate_7d,
        boost_settlement_roi_14d,
        boost_settlement_amount_14d,
        boost_settlement_order_count_14d,
        boost_settlement_order_cost_14d,
        boost_gmv_settlement_rate_14d,
        boost_order_settlement_rate_14d,
        boost_settlement_roi_30d,
        boost_settlement_amount_30d,
        boost_settlement_order_count_30d,
        boost_settlement_order_cost_30d,
        boost_gmv_settlement_rate_30d,
        boost_order_settlement_rate_30d,
        boost_settlement_roi_90d,
        boost_settlement_amount_90d,
        boost_settlement_order_count_90d,
        boost_settlement_order_cost_90d,
        boost_gmv_settlement_rate_90d,
        boost_order_settlement_rate_90d,
        raw_metrics,
        CURRENT_TIMESTAMP
      FROM resolved
      ON CONFLICT (material_id, stat_date) DO UPDATE
      SET asset_id = EXCLUDED.asset_id,
          ad_material_id = EXCLUDED.ad_material_id,
          platform_video_id = EXCLUDED.platform_video_id,
          objective = CASE
            WHEN dwd.marketing_content_qianchuan_material_performance_di.objective <> EXCLUDED.objective
            THEN dwd.marketing_content_qianchuan_material_performance_di.objective
            ELSE EXCLUDED.objective
          END,
          source_table = EXCLUDED.source_table,
          source_file_name = EXCLUDED.source_file_name,
          source_row_count = EXCLUDED.source_row_count,
          ingest_time = EXCLUDED.ingest_time,
          material_video_name = EXCLUDED.material_video_name,
          material_created_at = EXCLUDED.material_created_at,
          promotion_type = EXCLUDED.promotion_type,
          global_material_video_type = EXCLUDED.global_material_video_type,
          live_room_name = EXCLUDED.live_room_name,
          douyin_account_display_id = EXCLUDED.douyin_account_display_id,
          match_status = EXCLUDED.match_status,
          data_quality_status = CASE
            WHEN dwd.marketing_content_qianchuan_material_performance_di.data_quality_status = 'cross_source_conflict'
            THEN 'cross_source_conflict'
            ELSE EXCLUDED.data_quality_status
          END,
          sample_quality_status = EXCLUDED.sample_quality_status,
          overall_impression_count = EXCLUDED.overall_impression_count,
          overall_click_count = EXCLUDED.overall_click_count,
          overall_click_rate = EXCLUDED.overall_click_rate,
          overall_conversion_rate = EXCLUDED.overall_conversion_rate,
          overall_cost = EXCLUDED.overall_cost,
          overall_cost_ratio = EXCLUDED.overall_cost_ratio,
          overall_order_count = EXCLUDED.overall_order_count,
          overall_gmv = EXCLUDED.overall_gmv,
          overall_gmv_ratio = EXCLUDED.overall_gmv_ratio,
          base_cost = EXCLUDED.base_cost,
          overall_pay_roi = EXCLUDED.overall_pay_roi,
          overall_order_cost = EXCLUDED.overall_order_cost,
          user_pay_amount = EXCLUDED.user_pay_amount,
          overall_cpm = EXCLUDED.overall_cpm,
          overall_cpc = EXCLUDED.overall_cpc,
          smart_coupon_amount = EXCLUDED.smart_coupon_amount,
          platform_subsidy_amount = EXCLUDED.platform_subsidy_amount,
          smart_coupon_unrefund_amount = EXCLUDED.smart_coupon_unrefund_amount,
          platform_subsidy_unrefund_amount = EXCLUDED.platform_subsidy_unrefund_amount,
          overall_presale_order_count = EXCLUDED.overall_presale_order_count,
          overall_presale_order_amount = EXCLUDED.overall_presale_order_amount,
          overall_unfinished_presale_estimated_amount = EXCLUDED.overall_unfinished_presale_estimated_amount,
          net_gmv_roi = EXCLUDED.net_gmv_roi,
          net_gmv = EXCLUDED.net_gmv,
          net_order_count = EXCLUDED.net_order_count,
          net_order_cost = EXCLUDED.net_order_cost,
          net_user_pay_amount = EXCLUDED.net_user_pay_amount,
          net_gmv_settlement_rate = EXCLUDED.net_gmv_settlement_rate,
          net_order_settlement_rate = EXCLUDED.net_order_settlement_rate,
          refund_order_count_1h = EXCLUDED.refund_order_count_1h,
          refund_amount_1h = EXCLUDED.refund_amount_1h,
          refund_rate_1h = EXCLUDED.refund_rate_1h,
          settlement_roi_7d = EXCLUDED.settlement_roi_7d,
          settlement_amount_7d = EXCLUDED.settlement_amount_7d,
          settlement_order_count_7d = EXCLUDED.settlement_order_count_7d,
          settlement_order_cost_7d = EXCLUDED.settlement_order_cost_7d,
          gmv_settlement_rate_7d = EXCLUDED.gmv_settlement_rate_7d,
          order_settlement_rate_7d = EXCLUDED.order_settlement_rate_7d,
          settlement_roi_14d = EXCLUDED.settlement_roi_14d,
          settlement_amount_14d = EXCLUDED.settlement_amount_14d,
          settlement_order_count_14d = EXCLUDED.settlement_order_count_14d,
          settlement_order_cost_14d = EXCLUDED.settlement_order_cost_14d,
          gmv_settlement_rate_14d = EXCLUDED.gmv_settlement_rate_14d,
          order_settlement_rate_14d = EXCLUDED.order_settlement_rate_14d,
          settlement_roi_30d = EXCLUDED.settlement_roi_30d,
          settlement_amount_30d = EXCLUDED.settlement_amount_30d,
          settlement_order_count_30d = EXCLUDED.settlement_order_count_30d,
          settlement_order_cost_30d = EXCLUDED.settlement_order_cost_30d,
          gmv_settlement_rate_30d = EXCLUDED.gmv_settlement_rate_30d,
          order_settlement_rate_30d = EXCLUDED.order_settlement_rate_30d,
          settlement_roi_90d = EXCLUDED.settlement_roi_90d,
          settlement_amount_90d = EXCLUDED.settlement_amount_90d,
          settlement_order_count_90d = EXCLUDED.settlement_order_count_90d,
          settlement_order_cost_90d = EXCLUDED.settlement_order_cost_90d,
          gmv_settlement_rate_90d = EXCLUDED.gmv_settlement_rate_90d,
          order_settlement_rate_90d = EXCLUDED.order_settlement_rate_90d,
          video_like_count = EXCLUDED.video_like_count,
          new_fans_count = EXCLUDED.new_fans_count,
          video_play_count = EXCLUDED.video_play_count,
          video_complete_play_count = EXCLUDED.video_complete_play_count,
          video_complete_play_rate = EXCLUDED.video_complete_play_rate,
          video_comment_count = EXCLUDED.video_comment_count,
          avg_watch_duration = EXCLUDED.avg_watch_duration,
          play_rate_2s = EXCLUDED.play_rate_2s,
          play_rate_3s = EXCLUDED.play_rate_3s,
          play_rate_5s = EXCLUDED.play_rate_5s,
          play_rate_10s = EXCLUDED.play_rate_10s,
          legacy_boost_cost = EXCLUDED.legacy_boost_cost,
          legacy_boost_order_count = EXCLUDED.legacy_boost_order_count,
          legacy_boost_gmv = EXCLUDED.legacy_boost_gmv,
          legacy_boost_roi = EXCLUDED.legacy_boost_roi,
          boost_cost = EXCLUDED.boost_cost,
          boost_order_count = EXCLUDED.boost_order_count,
          boost_gmv = EXCLUDED.boost_gmv,
          boost_pay_roi = EXCLUDED.boost_pay_roi,
          boost_impression_count = EXCLUDED.boost_impression_count,
          boost_click_rate = EXCLUDED.boost_click_rate,
          boost_click_count = EXCLUDED.boost_click_count,
          boost_conversion_rate = EXCLUDED.boost_conversion_rate,
          boost_user_pay_amount = EXCLUDED.boost_user_pay_amount,
          boost_smart_coupon_amount = EXCLUDED.boost_smart_coupon_amount,
          boost_platform_subsidy_amount = EXCLUDED.boost_platform_subsidy_amount,
          boost_unfinished_presale_estimated_amount = EXCLUDED.boost_unfinished_presale_estimated_amount,
          boost_order_cost = EXCLUDED.boost_order_cost,
          boost_buyer_count = EXCLUDED.boost_buyer_count,
          boost_net_gmv = EXCLUDED.boost_net_gmv,
          boost_net_gmv_roi = EXCLUDED.boost_net_gmv_roi,
          boost_net_order_count = EXCLUDED.boost_net_order_count,
          boost_net_conversion_rate = EXCLUDED.boost_net_conversion_rate,
          boost_net_order_cost = EXCLUDED.boost_net_order_cost,
          boost_net_user_pay_amount = EXCLUDED.boost_net_user_pay_amount,
          boost_smart_coupon_unrefund_amount = EXCLUDED.boost_smart_coupon_unrefund_amount,
          boost_platform_subsidy_unrefund_amount = EXCLUDED.boost_platform_subsidy_unrefund_amount,
          boost_net_gmv_settlement_rate = EXCLUDED.boost_net_gmv_settlement_rate,
          boost_net_order_settlement_rate = EXCLUDED.boost_net_order_settlement_rate,
          boost_refund_order_count_1h = EXCLUDED.boost_refund_order_count_1h,
          boost_refund_amount_1h = EXCLUDED.boost_refund_amount_1h,
          boost_refund_rate_1h = EXCLUDED.boost_refund_rate_1h,
          boost_settlement_roi_7d = EXCLUDED.boost_settlement_roi_7d,
          boost_settlement_amount_7d = EXCLUDED.boost_settlement_amount_7d,
          boost_settlement_order_count_7d = EXCLUDED.boost_settlement_order_count_7d,
          boost_settlement_order_cost_7d = EXCLUDED.boost_settlement_order_cost_7d,
          boost_gmv_settlement_rate_7d = EXCLUDED.boost_gmv_settlement_rate_7d,
          boost_order_settlement_rate_7d = EXCLUDED.boost_order_settlement_rate_7d,
          boost_settlement_roi_14d = EXCLUDED.boost_settlement_roi_14d,
          boost_settlement_amount_14d = EXCLUDED.boost_settlement_amount_14d,
          boost_settlement_order_count_14d = EXCLUDED.boost_settlement_order_count_14d,
          boost_settlement_order_cost_14d = EXCLUDED.boost_settlement_order_cost_14d,
          boost_gmv_settlement_rate_14d = EXCLUDED.boost_gmv_settlement_rate_14d,
          boost_order_settlement_rate_14d = EXCLUDED.boost_order_settlement_rate_14d,
          boost_settlement_roi_30d = EXCLUDED.boost_settlement_roi_30d,
          boost_settlement_amount_30d = EXCLUDED.boost_settlement_amount_30d,
          boost_settlement_order_count_30d = EXCLUDED.boost_settlement_order_count_30d,
          boost_settlement_order_cost_30d = EXCLUDED.boost_settlement_order_cost_30d,
          boost_gmv_settlement_rate_30d = EXCLUDED.boost_gmv_settlement_rate_30d,
          boost_order_settlement_rate_30d = EXCLUDED.boost_order_settlement_rate_30d,
          boost_settlement_roi_90d = EXCLUDED.boost_settlement_roi_90d,
          boost_settlement_amount_90d = EXCLUDED.boost_settlement_amount_90d,
          boost_settlement_order_count_90d = EXCLUDED.boost_settlement_order_count_90d,
          boost_settlement_order_cost_90d = EXCLUDED.boost_settlement_order_cost_90d,
          boost_gmv_settlement_rate_90d = EXCLUDED.boost_gmv_settlement_rate_90d,
          boost_order_settlement_rate_90d = EXCLUDED.boost_order_settlement_rate_90d,
          raw_metrics = EXCLUDED.raw_metrics,
          updated_at = CURRENT_TIMESTAMP
      WHERE dwd.marketing_content_qianchuan_material_performance_di.objective = EXCLUDED.objective
      RETURNING 1
    ),
    flagged_conflicts AS (
      UPDATE dwd.marketing_content_qianchuan_material_performance_di perf
      SET data_quality_status = 'cross_source_conflict',
          raw_metrics = CASE
            WHEN jsonb_typeof(perf.raw_metrics) = 'object'
            THEN perf.raw_metrics || jsonb_build_object(
              'crossSourceConflict',
              jsonb_build_object(
                'conflictingObjective', 'live_all_domain_shortvideo',
                'conflictingSourceTable', 'ods.douyin_qianchuan_live_video_raw',
                'conflictingSourceFileName', resolved.source_file_name,
                'conflictingIngestTime', resolved.ingest_time,
                'detectedAt', CURRENT_TIMESTAMP
              )
            )
            ELSE jsonb_build_object(
              'primaryRawMetrics', perf.raw_metrics,
              'crossSourceConflict',
              jsonb_build_object(
                'conflictingObjective', 'live_all_domain_shortvideo',
                'conflictingSourceTable', 'ods.douyin_qianchuan_live_video_raw',
                'conflictingSourceFileName', resolved.source_file_name,
                'conflictingIngestTime', resolved.ingest_time,
                'detectedAt', CURRENT_TIMESTAMP
              )
            )
          END,
          updated_at = CURRENT_TIMESTAMP
      FROM resolved
      WHERE perf.material_id = resolved.material_id
        AND perf.stat_date = resolved.stat_date
        AND perf.objective <> 'live_all_domain_shortvideo'
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_live_rows
    FROM (
      SELECT 1 FROM upserted
      UNION ALL
      SELECT 1 FROM flagged_conflicts
    ) counted;
  END IF;

  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NOT NULL THEN
    WITH source_rows AS (
      SELECT *
      FROM ods.douyin_trade_sale_live_raw raw
      WHERE (p_start_date IS NULL OR raw.live_start_time::DATE >= p_start_date)
        AND (p_end_date IS NULL OR raw.live_start_time::DATE <= p_end_date)
        AND NULLIF(BTRIM(raw.anchor_douyin_id), '') IS NOT NULL
    ),
    grouped AS (
      SELECT
        live_start_time::DATE AS stat_date,
        anchor_douyin_id AS douyin_account_display_id,
        MAX(anchor_nickname) AS anchor_nickname,
        COUNT(*)::INTEGER AS live_count,
        SUM(live_duration_minutes) AS live_duration_minutes,
        SUM(live_exposure_user_count) AS live_exposure_user_count,
        SUM(live_exposure_count) AS live_exposure_count,
        SUM(live_watch_user_count) AS live_watch_user_count,
        SUM(live_watch_count) AS live_watch_count,
        SUM(hourly_watch_user_count) AS hourly_watch_user_count,
        MAX(max_online_count) AS max_online_count,
        AVG(avg_online_count)::INTEGER AS avg_online_count,
        AVG(avg_watch_duration_minutes) AS avg_watch_duration_minutes,
        SUM(comment_count) AS comment_count,
        SUM(new_follower_count) AS new_follower_count,
        SUM(live_product_exposure_user) AS live_product_exposure_user,
        SUM(live_product_click_user) AS live_product_click_user,
        SUM(live_product_exposure_count) AS live_product_exposure_count,
        SUM(live_product_click_count) AS live_product_click_count,
        SUM(live_product_click_user)::NUMERIC / NULLIF(SUM(live_product_exposure_user), 0) AS product_click_rate_user,
        SUM(live_product_click_count)::NUMERIC / NULLIF(SUM(live_product_exposure_count), 0) AS product_click_rate_count,
        SUM(live_order_count) AS live_order_count,
        SUM(live_gmv) AS live_gmv,
        SUM(live_user_pay_amount) AS live_user_pay_amount,
        SUM(live_buyer_count) AS live_buyer_count,
        SUM(live_buyer_count)::NUMERIC / NULLIF(SUM(live_watch_user_count), 0) AS watch_to_pay_rate_user,
        SUM(live_order_count)::NUMERIC / NULLIF(SUM(live_watch_count), 0) AS watch_to_pay_rate_count,
        SUM(live_buyer_count)::NUMERIC / NULLIF(SUM(live_product_click_user), 0) AS click_to_pay_rate_user,
        SUM(live_order_count)::NUMERIC / NULLIF(SUM(live_product_click_count), 0) AS click_to_pay_rate_count,
        SUM(live_ad_cost) AS live_ad_cost,
        SUM(ad_cost_shop_bound) AS ad_cost_shop_bound,
        SUM(ad_cost_shop_targeted) AS ad_cost_shop_targeted,
        SUM(net_gmv) AS net_gmv,
        SUM(net_order_count) AS net_order_count,
        AVG(refund_rate_1h) AS refund_rate_1h,
        CASE WHEN SUM(live_watch_user_count) IS NULL OR SUM(live_watch_user_count) < 100 THEN 'insufficient_data' ELSE 'ok' END AS acceptance_quality_status,
        jsonb_agg(to_jsonb(source_rows) - 'id' ORDER BY live_start_time) AS raw_metrics
      FROM source_rows
      GROUP BY live_start_time::DATE, anchor_douyin_id
    ),
    upserted AS (
      INSERT INTO dws.marketing_content_qianchuan_live_room_acceptance_di (
        stat_date,
        douyin_account_display_id,
        anchor_nickname,
        live_count,
        live_duration_minutes,
        live_exposure_user_count,
        live_exposure_count,
        live_watch_user_count,
        live_watch_count,
        hourly_watch_user_count,
        max_online_count,
        avg_online_count,
        avg_watch_duration_minutes,
        comment_count,
        new_follower_count,
        live_product_exposure_user,
        live_product_click_user,
        live_product_exposure_count,
        live_product_click_count,
        product_click_rate_user,
        product_click_rate_count,
        live_order_count,
        live_gmv,
        live_user_pay_amount,
        live_buyer_count,
        watch_to_pay_rate_user,
        watch_to_pay_rate_count,
        click_to_pay_rate_user,
        click_to_pay_rate_count,
        live_ad_cost,
        ad_cost_shop_bound,
        ad_cost_shop_targeted,
        net_gmv,
        net_order_count,
        refund_rate_1h,
        acceptance_quality_status,
        raw_metrics,
        updated_at
      )
      SELECT
        stat_date,
        douyin_account_display_id,
        anchor_nickname,
        live_count,
        live_duration_minutes,
        live_exposure_user_count,
        live_exposure_count,
        live_watch_user_count,
        live_watch_count,
        hourly_watch_user_count,
        max_online_count,
        avg_online_count,
        avg_watch_duration_minutes,
        comment_count,
        new_follower_count,
        live_product_exposure_user,
        live_product_click_user,
        live_product_exposure_count,
        live_product_click_count,
        product_click_rate_user,
        product_click_rate_count,
        live_order_count,
        live_gmv,
        live_user_pay_amount,
        live_buyer_count,
        watch_to_pay_rate_user,
        watch_to_pay_rate_count,
        click_to_pay_rate_user,
        click_to_pay_rate_count,
        live_ad_cost,
        ad_cost_shop_bound,
        ad_cost_shop_targeted,
        net_gmv,
        net_order_count,
        refund_rate_1h,
        acceptance_quality_status,
        raw_metrics,
        CURRENT_TIMESTAMP
      FROM grouped
      ON CONFLICT (stat_date, douyin_account_display_id) DO UPDATE
      SET anchor_nickname = EXCLUDED.anchor_nickname,
          live_count = EXCLUDED.live_count,
          live_duration_minutes = EXCLUDED.live_duration_minutes,
          live_exposure_user_count = EXCLUDED.live_exposure_user_count,
          live_exposure_count = EXCLUDED.live_exposure_count,
          live_watch_user_count = EXCLUDED.live_watch_user_count,
          live_watch_count = EXCLUDED.live_watch_count,
          hourly_watch_user_count = EXCLUDED.hourly_watch_user_count,
          max_online_count = EXCLUDED.max_online_count,
          avg_online_count = EXCLUDED.avg_online_count,
          avg_watch_duration_minutes = EXCLUDED.avg_watch_duration_minutes,
          comment_count = EXCLUDED.comment_count,
          new_follower_count = EXCLUDED.new_follower_count,
          live_product_exposure_user = EXCLUDED.live_product_exposure_user,
          live_product_click_user = EXCLUDED.live_product_click_user,
          live_product_exposure_count = EXCLUDED.live_product_exposure_count,
          live_product_click_count = EXCLUDED.live_product_click_count,
          product_click_rate_user = EXCLUDED.product_click_rate_user,
          product_click_rate_count = EXCLUDED.product_click_rate_count,
          live_order_count = EXCLUDED.live_order_count,
          live_gmv = EXCLUDED.live_gmv,
          live_user_pay_amount = EXCLUDED.live_user_pay_amount,
          live_buyer_count = EXCLUDED.live_buyer_count,
          watch_to_pay_rate_user = EXCLUDED.watch_to_pay_rate_user,
          watch_to_pay_rate_count = EXCLUDED.watch_to_pay_rate_count,
          click_to_pay_rate_user = EXCLUDED.click_to_pay_rate_user,
          click_to_pay_rate_count = EXCLUDED.click_to_pay_rate_count,
          live_ad_cost = EXCLUDED.live_ad_cost,
          ad_cost_shop_bound = EXCLUDED.ad_cost_shop_bound,
          ad_cost_shop_targeted = EXCLUDED.ad_cost_shop_targeted,
          net_gmv = EXCLUDED.net_gmv,
          net_order_count = EXCLUDED.net_order_count,
          refund_rate_1h = EXCLUDED.refund_rate_1h,
          acceptance_quality_status = EXCLUDED.acceptance_quality_status,
          raw_metrics = EXCLUDED.raw_metrics,
          updated_at = CURRENT_TIMESTAMP
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_acceptance_rows FROM upserted;
  END IF;

  WITH affected_materials AS (
    SELECT DISTINCT material_id
    FROM dwd.marketing_content_qianchuan_material_performance_di perf
    WHERE (p_asset_id IS NULL OR perf.asset_id = p_asset_id)
      AND (p_start_date IS NULL OR perf.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR perf.stat_date <= p_end_date)
  ),
  deleted AS (
    DELETE FROM dws.marketing_content_qianchuan_material_summary summary
    USING affected_materials affected
    WHERE summary.material_id = affected.material_id
    RETURNING summary.material_id
  ),
  aggregated AS (
    SELECT
      perf.material_id,
      (ARRAY_AGG(perf.asset_id ORDER BY perf.stat_date DESC))[1] AS asset_id,
      (ARRAY_AGG(perf.ad_material_id ORDER BY perf.stat_date DESC))[1] AS ad_material_id,
      (ARRAY_AGG(perf.platform_video_id ORDER BY perf.stat_date DESC))[1] AS platform_video_id,
      (ARRAY_AGG(perf.objective ORDER BY perf.stat_date DESC))[1] AS objective,
      (ARRAY_AGG(perf.source_table ORDER BY perf.stat_date DESC))[1] AS source_table,
      (ARRAY_AGG(perf.material_video_name ORDER BY perf.stat_date DESC))[1] AS material_video_name,
      MIN(perf.material_created_at) AS material_created_at,
      (ARRAY_AGG(perf.live_room_name ORDER BY perf.stat_date DESC))[1] AS live_room_name,
      (ARRAY_AGG(perf.douyin_account_display_id ORDER BY perf.stat_date DESC))[1] AS douyin_account_display_id,
      MIN(perf.stat_date) AS first_stat_date,
      MAX(perf.stat_date) AS last_stat_date,
      COUNT(*)::INTEGER AS active_days,
      COALESCE(SUM(perf.overall_impression_count), 0) AS total_impressions,
      COALESCE(SUM(perf.overall_click_count), 0) AS total_clicks,
      COALESCE(SUM(perf.overall_cost), 0) AS total_cost,
      COALESCE(SUM(perf.overall_order_count), 0) AS total_orders,
      COALESCE(SUM(perf.overall_gmv), 0) AS total_gmv,
      COALESCE(SUM(perf.net_gmv), 0) AS total_net_gmv,
      COALESCE(SUM(perf.net_order_count), 0) AS total_net_orders,
      SUM(perf.overall_click_count)::NUMERIC / NULLIF(SUM(perf.overall_impression_count), 0) AS ctr,
      SUM(perf.overall_order_count)::NUMERIC / NULLIF(SUM(perf.overall_click_count), 0) AS cvr,
      SUM(perf.overall_gmv) / NULLIF(SUM(perf.overall_cost), 0) AS pay_roi,
      SUM(perf.net_gmv) / NULLIF(SUM(perf.overall_cost), 0) AS net_gmv_roi,
      SUM(perf.overall_cost) / NULLIF(SUM(perf.overall_order_count), 0) AS order_cost,
      SUM(perf.overall_cost) / NULLIF(SUM(perf.net_order_count), 0) AS net_order_cost,
      AVG(perf.refund_rate_1h) AS refund_rate_1h,
      AVG(perf.net_gmv_settlement_rate) AS net_gmv_settlement_rate,
      SUM(perf.video_play_count) AS video_play_count,
      SUM(perf.video_complete_play_count)::NUMERIC / NULLIF(SUM(perf.video_play_count), 0) AS video_complete_play_rate,
      AVG(perf.avg_watch_duration) AS avg_watch_duration,
      AVG(perf.play_rate_2s) AS play_rate_2s,
      AVG(perf.play_rate_3s) AS play_rate_3s,
      AVG(perf.play_rate_5s) AS play_rate_5s,
      AVG(perf.play_rate_10s) AS play_rate_10s,
      CASE
        WHEN BOOL_OR(perf.data_quality_status = 'cross_source_conflict') THEN 'cross_source_conflict'
        WHEN BOOL_OR(perf.data_quality_status = 'duplicate_material_date') THEN 'duplicate_material_date'
        WHEN BOOL_OR(perf.data_quality_status = 'duplicate_binding') THEN 'duplicate_binding'
        WHEN BOOL_OR(perf.data_quality_status = 'missing_binding') THEN 'missing_binding'
        ELSE 'ok'
      END AS data_quality_status,
      CASE
        WHEN COALESCE(SUM(perf.overall_impression_count), 0) < 1000
          OR COALESCE(SUM(perf.overall_click_count), 0) < 30
          OR COALESCE(SUM(perf.overall_cost), 0) < 50 THEN 'insufficient_sample'
        ELSE 'ok'
      END AS sample_quality_status,
      jsonb_build_object(
        'latestStatDate', MAX(perf.stat_date),
        'boostPolicy', 'boost metrics are explanatory only; do not add to overall metrics',
        'refundRate1h', AVG(perf.refund_rate_1h)
      ) AS latest_metrics
    FROM dwd.marketing_content_qianchuan_material_performance_di perf
    JOIN affected_materials affected ON affected.material_id = perf.material_id
    GROUP BY perf.material_id
  ),
  inserted AS (
    INSERT INTO dws.marketing_content_qianchuan_material_summary (
      material_id,
      asset_id,
      ad_material_id,
      platform_video_id,
      objective,
      source_table,
      material_video_name,
      material_created_at,
      live_room_name,
      douyin_account_display_id,
      first_stat_date,
      last_stat_date,
      active_days,
      total_impressions,
      total_clicks,
      total_cost,
      total_orders,
      total_gmv,
      total_net_gmv,
      total_net_orders,
      ctr,
      cvr,
      pay_roi,
      net_gmv_roi,
      order_cost,
      net_order_cost,
      refund_rate_1h,
      net_gmv_settlement_rate,
      video_play_count,
      video_complete_play_rate,
      avg_watch_duration,
      play_rate_2s,
      play_rate_3s,
      play_rate_5s,
      play_rate_10s,
      latest_live_acceptance_status,
      data_quality_status,
      sample_quality_status,
      latest_metrics,
      updated_at
    )
    SELECT
      aggregated.material_id,
      aggregated.asset_id,
      aggregated.ad_material_id,
      aggregated.platform_video_id,
      aggregated.objective,
      aggregated.source_table,
      aggregated.material_video_name,
      aggregated.material_created_at,
      aggregated.live_room_name,
      aggregated.douyin_account_display_id,
      aggregated.first_stat_date,
      aggregated.last_stat_date,
      aggregated.active_days,
      aggregated.total_impressions,
      aggregated.total_clicks,
      aggregated.total_cost,
      aggregated.total_orders,
      aggregated.total_gmv,
      aggregated.total_net_gmv,
      aggregated.total_net_orders,
      aggregated.ctr,
      aggregated.cvr,
      aggregated.pay_roi,
      aggregated.net_gmv_roi,
      aggregated.order_cost,
      aggregated.net_order_cost,
      aggregated.refund_rate_1h,
      aggregated.net_gmv_settlement_rate,
      aggregated.video_play_count,
      aggregated.video_complete_play_rate,
      aggregated.avg_watch_duration,
      aggregated.play_rate_2s,
      aggregated.play_rate_3s,
      aggregated.play_rate_5s,
      aggregated.play_rate_10s,
      CASE
        WHEN aggregated.objective <> 'live_all_domain_shortvideo' THEN NULL
        WHEN aggregated.douyin_account_display_id IS NULL THEN 'missing'
        WHEN EXISTS (
          SELECT 1
          FROM dws.marketing_content_qianchuan_live_room_acceptance_di acceptance
          WHERE acceptance.douyin_account_display_id = aggregated.douyin_account_display_id
            AND acceptance.stat_date BETWEEN aggregated.first_stat_date AND aggregated.last_stat_date
        ) THEN 'ok'
        ELSE 'missing'
      END AS latest_live_acceptance_status,
      aggregated.data_quality_status,
      aggregated.sample_quality_status,
      aggregated.latest_metrics,
      CURRENT_TIMESTAMP
    FROM aggregated
    ON CONFLICT (material_id) DO UPDATE
    SET asset_id = EXCLUDED.asset_id,
        ad_material_id = EXCLUDED.ad_material_id,
        platform_video_id = EXCLUDED.platform_video_id,
        objective = EXCLUDED.objective,
        source_table = EXCLUDED.source_table,
        material_video_name = EXCLUDED.material_video_name,
        material_created_at = EXCLUDED.material_created_at,
        live_room_name = EXCLUDED.live_room_name,
        douyin_account_display_id = EXCLUDED.douyin_account_display_id,
        first_stat_date = EXCLUDED.first_stat_date,
        last_stat_date = EXCLUDED.last_stat_date,
        active_days = EXCLUDED.active_days,
        total_impressions = EXCLUDED.total_impressions,
        total_clicks = EXCLUDED.total_clicks,
        total_cost = EXCLUDED.total_cost,
        total_orders = EXCLUDED.total_orders,
        total_gmv = EXCLUDED.total_gmv,
        total_net_gmv = EXCLUDED.total_net_gmv,
        total_net_orders = EXCLUDED.total_net_orders,
        ctr = EXCLUDED.ctr,
        cvr = EXCLUDED.cvr,
        pay_roi = EXCLUDED.pay_roi,
        net_gmv_roi = EXCLUDED.net_gmv_roi,
        order_cost = EXCLUDED.order_cost,
        net_order_cost = EXCLUDED.net_order_cost,
        refund_rate_1h = EXCLUDED.refund_rate_1h,
        net_gmv_settlement_rate = EXCLUDED.net_gmv_settlement_rate,
        video_play_count = EXCLUDED.video_play_count,
        video_complete_play_rate = EXCLUDED.video_complete_play_rate,
        avg_watch_duration = EXCLUDED.avg_watch_duration,
        play_rate_2s = EXCLUDED.play_rate_2s,
        play_rate_3s = EXCLUDED.play_rate_3s,
        play_rate_5s = EXCLUDED.play_rate_5s,
        play_rate_10s = EXCLUDED.play_rate_10s,
        latest_live_acceptance_status = EXCLUDED.latest_live_acceptance_status,
        data_quality_status = EXCLUDED.data_quality_status,
        sample_quality_status = EXCLUDED.sample_quality_status,
        latest_metrics = EXCLUDED.latest_metrics,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_summary_rows FROM inserted;

  WITH affected_assets AS (
    SELECT p_asset_id AS asset_id
    WHERE p_asset_id IS NOT NULL
    UNION
    SELECT DISTINCT perf.asset_id
    FROM dwd.marketing_content_qianchuan_material_performance_di perf
    WHERE perf.asset_id IS NOT NULL
      AND (p_asset_id IS NULL OR perf.asset_id = p_asset_id)
      AND (p_start_date IS NULL OR perf.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR perf.stat_date <= p_end_date)
  ),
  deleted AS (
    DELETE FROM dws.marketing_content_asset_qianchuan_summary summary
    USING affected_assets affected
    WHERE summary.asset_id = affected.asset_id
    RETURNING summary.asset_id
  ),
  aggregated AS (
    SELECT
      summary.asset_id,
      COUNT(*)::INTEGER AS material_count,
      COUNT(*) FILTER (WHERE summary.objective = 'product_all_domain_shortvideo')::INTEGER AS product_material_count,
      COUNT(*) FILTER (WHERE summary.objective = 'live_all_domain_shortvideo')::INTEGER AS live_material_count,
      MIN(summary.first_stat_date) AS first_stat_date,
      MAX(summary.last_stat_date) AS last_stat_date,
      COALESCE(SUM(summary.active_days), 0)::INTEGER AS material_active_days,
      COALESCE(SUM(summary.total_impressions), 0) AS total_impressions,
      COALESCE(SUM(summary.total_clicks), 0) AS total_clicks,
      COALESCE(SUM(summary.total_cost), 0) AS total_cost,
      COALESCE(SUM(summary.total_orders), 0) AS total_orders,
      COALESCE(SUM(summary.total_gmv), 0) AS total_gmv,
      COALESCE(SUM(summary.total_net_gmv), 0) AS total_net_gmv,
      COALESCE(SUM(summary.total_net_orders), 0) AS total_net_orders,
      SUM(summary.total_clicks)::NUMERIC / NULLIF(SUM(summary.total_impressions), 0) AS ctr,
      SUM(summary.total_orders)::NUMERIC / NULLIF(SUM(summary.total_clicks), 0) AS cvr,
      SUM(summary.total_gmv) / NULLIF(SUM(summary.total_cost), 0) AS pay_roi,
      SUM(summary.total_net_gmv) / NULLIF(SUM(summary.total_cost), 0) AS net_gmv_roi,
      SUM(summary.total_cost) / NULLIF(SUM(summary.total_orders), 0) AS order_cost,
      SUM(summary.total_cost) / NULLIF(SUM(summary.total_net_orders), 0) AS net_order_cost,
      AVG(summary.refund_rate_1h) AS refund_rate_1h,
      AVG(summary.net_gmv_settlement_rate) AS net_gmv_settlement_rate,
      CASE
        WHEN COUNT(*) FILTER (WHERE summary.objective = 'live_all_domain_shortvideo') = 0 THEN NULL
        WHEN BOOL_OR(summary.latest_live_acceptance_status = 'missing') THEN 'missing'
        WHEN BOOL_OR(summary.latest_live_acceptance_status = 'ok') THEN 'ok'
        ELSE 'unknown'
      END AS latest_live_acceptance_status,
      CASE
        WHEN BOOL_OR(summary.data_quality_status = 'cross_source_conflict') THEN 'cross_source_conflict'
        WHEN BOOL_OR(summary.data_quality_status = 'duplicate_material_date') THEN 'duplicate_material_date'
        WHEN BOOL_OR(summary.data_quality_status = 'duplicate_binding') THEN 'duplicate_binding'
        WHEN BOOL_OR(summary.data_quality_status = 'missing_binding') THEN 'missing_binding'
        ELSE 'ok'
      END AS data_quality_status,
      CASE
        WHEN BOOL_OR(summary.sample_quality_status = 'insufficient_sample') THEN 'insufficient_sample'
        WHEN BOOL_AND(summary.sample_quality_status = 'ok') THEN 'ok'
        ELSE 'unknown'
      END AS sample_quality_status,
      CASE
        WHEN BOOL_OR(summary.diagnosis_status = 'failed') THEN 'failed'
        WHEN BOOL_OR(summary.diagnosis_status = 'pending') THEN 'pending'
        WHEN BOOL_OR(summary.diagnosis_status = 'ok') THEN 'ok'
        ELSE 'unknown'
      END AS diagnosis_status,
      jsonb_build_object(
        'productMaterialCount',
        COUNT(*) FILTER (WHERE summary.objective = 'product_all_domain_shortvideo'),
        'liveMaterialCount',
        COUNT(*) FILTER (WHERE summary.objective = 'live_all_domain_shortvideo')
      ) AS objective_breakdown,
      jsonb_agg(
        jsonb_build_object(
          'materialId', summary.material_id,
          'objective', summary.objective,
          'lastStatDate', summary.last_stat_date
        )
        ORDER BY
          CASE summary.objective
            WHEN 'product_all_domain_shortvideo' THEN 0
            WHEN 'live_all_domain_shortvideo' THEN 1
            ELSE 2
          END,
          summary.last_stat_date DESC NULLS LAST,
          summary.material_id
      ) AS material_ids,
      jsonb_build_object(
        'latestStatDate', MAX(summary.last_stat_date),
        'boostPolicy', 'boost metrics are explanatory only; do not add to overall metrics',
        'rollupSource', 'dws.marketing_content_qianchuan_material_summary'
      ) AS latest_metrics
    FROM dws.marketing_content_qianchuan_material_summary summary
    JOIN affected_assets affected ON affected.asset_id = summary.asset_id
    WHERE summary.asset_id IS NOT NULL
    GROUP BY summary.asset_id
  ),
  inserted AS (
    INSERT INTO dws.marketing_content_asset_qianchuan_summary (
      asset_id,
      material_count,
      product_material_count,
      live_material_count,
      first_stat_date,
      last_stat_date,
      material_active_days,
      total_impressions,
      total_clicks,
      total_cost,
      total_orders,
      total_gmv,
      total_net_gmv,
      total_net_orders,
      ctr,
      cvr,
      pay_roi,
      net_gmv_roi,
      order_cost,
      net_order_cost,
      refund_rate_1h,
      net_gmv_settlement_rate,
      latest_live_acceptance_status,
      data_quality_status,
      sample_quality_status,
      diagnosis_status,
      objective_breakdown,
      material_ids,
      latest_metrics,
      updated_at
    )
    SELECT
      aggregated.asset_id,
      aggregated.material_count,
      aggregated.product_material_count,
      aggregated.live_material_count,
      aggregated.first_stat_date,
      aggregated.last_stat_date,
      aggregated.material_active_days,
      aggregated.total_impressions,
      aggregated.total_clicks,
      aggregated.total_cost,
      aggregated.total_orders,
      aggregated.total_gmv,
      aggregated.total_net_gmv,
      aggregated.total_net_orders,
      aggregated.ctr,
      aggregated.cvr,
      aggregated.pay_roi,
      aggregated.net_gmv_roi,
      aggregated.order_cost,
      aggregated.net_order_cost,
      aggregated.refund_rate_1h,
      aggregated.net_gmv_settlement_rate,
      aggregated.latest_live_acceptance_status,
      aggregated.data_quality_status,
      aggregated.sample_quality_status,
      aggregated.diagnosis_status,
      aggregated.objective_breakdown,
      aggregated.material_ids,
      aggregated.latest_metrics,
      CURRENT_TIMESTAMP
    FROM aggregated
    ON CONFLICT (asset_id) DO UPDATE
    SET material_count = EXCLUDED.material_count,
        product_material_count = EXCLUDED.product_material_count,
        live_material_count = EXCLUDED.live_material_count,
        first_stat_date = EXCLUDED.first_stat_date,
        last_stat_date = EXCLUDED.last_stat_date,
        material_active_days = EXCLUDED.material_active_days,
        total_impressions = EXCLUDED.total_impressions,
        total_clicks = EXCLUDED.total_clicks,
        total_cost = EXCLUDED.total_cost,
        total_orders = EXCLUDED.total_orders,
        total_gmv = EXCLUDED.total_gmv,
        total_net_gmv = EXCLUDED.total_net_gmv,
        total_net_orders = EXCLUDED.total_net_orders,
        ctr = EXCLUDED.ctr,
        cvr = EXCLUDED.cvr,
        pay_roi = EXCLUDED.pay_roi,
        net_gmv_roi = EXCLUDED.net_gmv_roi,
        order_cost = EXCLUDED.order_cost,
        net_order_cost = EXCLUDED.net_order_cost,
        refund_rate_1h = EXCLUDED.refund_rate_1h,
        net_gmv_settlement_rate = EXCLUDED.net_gmv_settlement_rate,
        latest_live_acceptance_status = EXCLUDED.latest_live_acceptance_status,
        data_quality_status = EXCLUDED.data_quality_status,
        sample_quality_status = EXCLUDED.sample_quality_status,
        diagnosis_status = EXCLUDED.diagnosis_status,
        objective_breakdown = EXCLUDED.objective_breakdown,
        material_ids = EXCLUDED.material_ids,
        latest_metrics = EXCLUDED.latest_metrics,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_asset_summary_rows FROM inserted;

  WITH projected AS (
    SELECT perf.*
    FROM dwd.marketing_content_qianchuan_material_performance_di perf
    WHERE (p_asset_id IS NULL OR perf.asset_id = p_asset_id)
      AND (p_start_date IS NULL OR perf.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR perf.stat_date <= p_end_date)
      AND perf.asset_id IS NOT NULL
  ),
  upserted AS (
    INSERT INTO dwd.marketing_content_ad_material_stats_di (
      stat_date,
      source_system,
      ad_platform,
      account_id,
      account_name,
      advertiser_id,
      external_material_id,
      external_video_id,
      campaign_id,
      campaign_name,
      ad_group_id,
      ad_group_name,
      ad_id,
      ad_name,
      asset_id,
      platform_video_id,
      match_status,
      impressions,
      clicks,
      ctr,
      conversions,
      cvr,
      cost,
      gmv,
      roi,
      live_room_entries,
      live_room_entry_rate,
      transaction_cost,
      likes,
      comments,
      follows,
      raw_payload,
      updated_at
    )
    SELECT
      stat_date,
      'qianchuan_all_domain',
      'qianchuan',
      NULL,
      NULL,
      NULL,
      material_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      material_video_name,
      asset_id,
      platform_video_id,
      match_status,
      overall_impression_count,
      overall_click_count,
      overall_click_rate,
      overall_order_count,
      overall_conversion_rate,
      overall_cost,
      overall_gmv,
      overall_pay_roi,
      CASE WHEN objective = 'live_all_domain_shortvideo' THEN overall_click_count ELSE NULL END,
      CASE WHEN objective = 'live_all_domain_shortvideo' THEN overall_click_rate ELSE NULL END,
      overall_order_cost,
      video_like_count,
      video_comment_count,
      new_fans_count,
      (
        CASE
          WHEN jsonb_typeof(raw_metrics) = 'object' THEN raw_metrics
          ELSE jsonb_build_object('sourceRows', raw_metrics)
        END
      ) || jsonb_build_object(
        'deliveryMode', delivery_mode,
        'objective', objective,
        'sourceTable', source_table,
        'boostPolicy', 'boost metrics are explanatory only; do not add to overall metrics'
      ),
      CURRENT_TIMESTAMP
    FROM projected
    ON CONFLICT (
      ad_platform,
      COALESCE(account_id, ''),
      external_material_id,
      stat_date,
      COALESCE(campaign_id, ''),
      COALESCE(ad_group_id, ''),
      COALESCE(ad_id, '')
    ) DO UPDATE
    SET source_system = EXCLUDED.source_system,
        asset_id = EXCLUDED.asset_id,
        platform_video_id = EXCLUDED.platform_video_id,
        match_status = EXCLUDED.match_status,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        conversions = EXCLUDED.conversions,
        cvr = EXCLUDED.cvr,
        cost = EXCLUDED.cost,
        gmv = EXCLUDED.gmv,
        roi = EXCLUDED.roi,
        live_room_entries = EXCLUDED.live_room_entries,
        live_room_entry_rate = EXCLUDED.live_room_entry_rate,
        transaction_cost = EXCLUDED.transaction_cost,
        likes = EXCLUDED.likes,
        comments = EXCLUDED.comments,
        follows = EXCLUDED.follows,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_thin_rows FROM upserted;

  UPDATE ads.marketing_content_ad_materials material
  SET delivery_mode = 'qianchuan_all_domain',
      objective = summary.objective,
      objective_source = 'raw_table',
      performance_source_table = summary.source_table,
      last_performance_seen_at = summary.last_stat_date::TIMESTAMPTZ,
      data_quality_status = summary.data_quality_status,
      updated_at = CURRENT_TIMESTAMP
  FROM dws.marketing_content_qianchuan_material_summary summary
  WHERE material.ad_platform = 'qianchuan'
    AND material.relation_status = 'active'
    AND material.external_material_id = summary.material_id
    AND (p_asset_id IS NULL OR material.asset_id = p_asset_id);

  IF to_regprocedure('ads.refresh_marketing_content_asset_performance(uuid,date,date)') IS NOT NULL THEN
    PERFORM 1
    FROM ads.refresh_marketing_content_asset_performance(p_asset_id, p_start_date, p_end_date);
  END IF;

  product_daily_rows := v_product_rows;
  live_daily_rows := v_live_rows;
  live_acceptance_rows := v_acceptance_rows;
  summary_rows := v_summary_rows;
  thin_projection_rows := v_thin_rows;
  RETURN NEXT;
END;
$$;
