#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-aios_qc_fixture}"

if [[ "${AIOS_QC_ALLOW_NON_FIXTURE_DB:-0}" != "1" && "${PGDATABASE}" != *fixture* ]]; then
  echo "Refusing to run qianchuan fixture smoke on non-fixture database: ${PGDATABASE}" >&2
  echo "Set AIOS_QC_ALLOW_NON_FIXTURE_DB=1 only for an explicitly disposable test DB." >&2
  exit 2
fi

PSQL=(
  psql
  -X
  -v ON_ERROR_STOP=1
  -h "${PGHOST}"
  -p "${PGPORT}"
  -U "${PGUSER}"
  -d "${PGDATABASE}"
)

echo "==> Bootstrapping minimal qianchuan fixture schema on ${PGHOST}:${PGPORT}/${PGDATABASE}"
"${PSQL[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS ods;

CREATE TABLE IF NOT EXISTS ads.marketing_content_assets (
  asset_id UUID PRIMARY KEY,
  title TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_objects (
  object_id UUID PRIMARY KEY,
  asset_id UUID REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_key TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_platform_videos (
  platform_video_id UUID PRIMARY KEY,
  asset_id UUID REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_video_id TEXT,
  relation_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_ad_materials (
  ad_material_id UUID PRIMARY KEY,
  asset_id UUID REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  platform_video_id UUID,
  ad_platform TEXT NOT NULL,
  external_material_id TEXT NOT NULL,
  relation_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dwd.marketing_content_ad_material_stats_di (
  stat_date DATE NOT NULL,
  source_system TEXT,
  ad_platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  advertiser_id TEXT,
  external_material_id TEXT NOT NULL,
  external_video_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  asset_id UUID,
  platform_video_id UUID,
  match_status TEXT,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  conversions BIGINT,
  cvr NUMERIC,
  cost NUMERIC,
  gmv NUMERIC,
  roi NUMERIC,
  live_room_entries BIGINT,
  live_room_entry_rate NUMERIC,
  transaction_cost NUMERIC,
  likes BIGINT,
  comments BIGINT,
  follows BIGINT,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_content_ad_material_stats_qianchuan_fixture
  ON dwd.marketing_content_ad_material_stats_di (
    ad_platform,
    COALESCE(account_id, ''),
    external_material_id,
    stat_date,
    COALESCE(campaign_id, ''),
    COALESCE(ad_group_id, ''),
    COALESCE(ad_id, '')
  );

CREATE TABLE IF NOT EXISTS ods.douyin_qianchuan_shortvideo_raw (
  id BIGSERIAL PRIMARY KEY,
  material_id TEXT,
  stat_date DATE,
  source_file_name TEXT,
  ingest_time TIMESTAMPTZ,
  material_video_name TEXT,
  material_created_at TIMESTAMPTZ,
  overall_impression_count BIGINT,
  overall_click_count BIGINT,
  overall_click_rate NUMERIC,
  overall_conversion_rate NUMERIC,
  overall_cost NUMERIC,
  overall_order_count BIGINT,
  overall_gmv NUMERIC,
  overall_pay_roi NUMERIC,
  overall_order_cost NUMERIC,
  user_pay_amount NUMERIC,
  overall_cpm NUMERIC,
  overall_cpc NUMERIC,
  smart_coupon_amount NUMERIC,
  platform_subsidy_amount NUMERIC,
  net_gmv_roi NUMERIC,
  net_gmv NUMERIC,
  net_order_count BIGINT,
  net_order_cost NUMERIC,
  net_gmv_settlement_rate NUMERIC,
  refund_rate_1h NUMERIC
);

CREATE TABLE IF NOT EXISTS ods.douyin_qianchuan_live_video_raw (
  id BIGSERIAL PRIMARY KEY,
  material_id TEXT,
  stat_date DATE,
  source_file_name TEXT,
  ingest_time TIMESTAMPTZ,
  material_video_name TEXT,
  material_created_at TIMESTAMPTZ,
  promotion_type TEXT,
  global_material_video_type TEXT,
  live_room_name TEXT,
  douyin_account_display_id TEXT,
  overall_impression_count BIGINT,
  overall_click_count BIGINT,
  overall_cost NUMERIC,
  overall_cost_ratio NUMERIC,
  overall_order_count BIGINT,
  overall_gmv NUMERIC,
  overall_gmv_ratio NUMERIC,
  base_cost NUMERIC,
  user_pay_amount NUMERIC,
  smart_coupon_amount NUMERIC,
  platform_subsidy_amount NUMERIC,
  smart_coupon_unrefund_amount NUMERIC,
  platform_subsidy_unrefund_amount NUMERIC,
  overall_presale_order_count BIGINT,
  overall_presale_order_amount NUMERIC,
  overall_unfinished_presale_estimated_amount NUMERIC,
  net_gmv NUMERIC,
  net_order_count BIGINT,
  net_user_pay_amount NUMERIC,
  net_gmv_settlement_rate NUMERIC,
  net_order_settlement_rate NUMERIC,
  refund_order_count_1h BIGINT,
  refund_amount_1h NUMERIC,
  refund_rate_1h NUMERIC,
  settlement_roi_7d NUMERIC,
  settlement_amount_7d NUMERIC,
  settlement_order_count_7d BIGINT,
  settlement_order_cost_7d NUMERIC,
  gmv_settlement_rate_7d NUMERIC,
  order_settlement_rate_7d NUMERIC,
  settlement_roi_14d NUMERIC,
  settlement_amount_14d NUMERIC,
  settlement_order_count_14d BIGINT,
  settlement_order_cost_14d NUMERIC,
  gmv_settlement_rate_14d NUMERIC,
  order_settlement_rate_14d NUMERIC,
  settlement_roi_30d NUMERIC,
  settlement_amount_30d NUMERIC,
  settlement_order_count_30d BIGINT,
  settlement_order_cost_30d NUMERIC,
  gmv_settlement_rate_30d NUMERIC,
  order_settlement_rate_30d NUMERIC,
  settlement_roi_90d NUMERIC,
  settlement_amount_90d NUMERIC,
  settlement_order_count_90d BIGINT,
  settlement_order_cost_90d NUMERIC,
  gmv_settlement_rate_90d NUMERIC,
  order_settlement_rate_90d NUMERIC,
  video_like_count BIGINT,
  new_fans_count BIGINT,
  avg_watch_duration NUMERIC,
  video_play_count BIGINT,
  video_complete_play_count BIGINT,
  video_comment_count BIGINT,
  play_rate_2s NUMERIC,
  play_rate_3s NUMERIC,
  play_rate_5s NUMERIC,
  play_rate_10s NUMERIC,
  legacy_boost_cost NUMERIC,
  legacy_boost_order_count BIGINT,
  legacy_boost_gmv NUMERIC,
  boost_cost NUMERIC,
  boost_order_count BIGINT,
  boost_gmv NUMERIC,
  boost_impression_count BIGINT,
  boost_click_count BIGINT,
  boost_user_pay_amount NUMERIC,
  boost_smart_coupon_amount NUMERIC,
  boost_platform_subsidy_amount NUMERIC,
  boost_unfinished_presale_estimated_amount NUMERIC,
  boost_buyer_count BIGINT,
  boost_net_gmv NUMERIC,
  boost_net_order_count BIGINT,
  boost_net_conversion_rate NUMERIC,
  boost_net_user_pay_amount NUMERIC,
  boost_smart_coupon_unrefund_amount NUMERIC,
  boost_platform_subsidy_unrefund_amount NUMERIC,
  boost_net_gmv_settlement_rate NUMERIC,
  boost_net_order_settlement_rate NUMERIC,
  boost_refund_order_count_1h BIGINT,
  boost_refund_amount_1h NUMERIC,
  boost_refund_rate_1h NUMERIC,
  boost_settlement_roi_7d NUMERIC,
  boost_settlement_amount_7d NUMERIC,
  boost_settlement_order_count_7d BIGINT,
  boost_settlement_order_cost_7d NUMERIC,
  boost_gmv_settlement_rate_7d NUMERIC,
  boost_order_settlement_rate_7d NUMERIC,
  boost_settlement_roi_14d NUMERIC,
  boost_settlement_amount_14d NUMERIC,
  boost_settlement_order_count_14d BIGINT,
  boost_settlement_order_cost_14d NUMERIC,
  boost_gmv_settlement_rate_14d NUMERIC,
  boost_order_settlement_rate_14d NUMERIC,
  boost_settlement_roi_30d NUMERIC,
  boost_settlement_amount_30d NUMERIC,
  boost_settlement_order_count_30d BIGINT,
  boost_settlement_order_cost_30d NUMERIC,
  boost_gmv_settlement_rate_30d NUMERIC,
  boost_order_settlement_rate_30d NUMERIC,
  boost_settlement_roi_90d NUMERIC,
  boost_settlement_amount_90d NUMERIC,
  boost_settlement_order_count_90d BIGINT,
  boost_settlement_order_cost_90d NUMERIC,
  boost_gmv_settlement_rate_90d NUMERIC,
  boost_order_settlement_rate_90d NUMERIC
);

CREATE TABLE IF NOT EXISTS ods.douyin_trade_sale_live_raw (
  id BIGSERIAL PRIMARY KEY,
  live_start_time TIMESTAMPTZ,
  anchor_douyin_id TEXT,
  anchor_nickname TEXT,
  live_duration_minutes NUMERIC,
  live_exposure_user_count BIGINT,
  live_exposure_count BIGINT,
  live_watch_user_count BIGINT,
  live_watch_count BIGINT,
  hourly_watch_user_count BIGINT,
  max_online_count BIGINT,
  avg_online_count NUMERIC,
  avg_watch_duration_minutes NUMERIC,
  comment_count BIGINT,
  new_follower_count BIGINT,
  live_product_exposure_user BIGINT,
  live_product_click_user BIGINT,
  live_product_exposure_count BIGINT,
  live_product_click_count BIGINT,
  live_order_count BIGINT,
  live_gmv NUMERIC,
  live_user_pay_amount NUMERIC,
  live_buyer_count BIGINT,
  live_ad_cost NUMERIC,
  ad_cost_shop_bound NUMERIC,
  ad_cost_shop_targeted NUMERIC,
  net_gmv NUMERIC,
  net_order_count BIGINT,
  refund_rate_1h NUMERIC
);
SQL

echo "==> Applying qianchuan all-domain migration"
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql"

echo "==> Seeding deterministic product/live/duplicate/conflict fixture rows"
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  DELETE FROM dwd.marketing_content_ad_material_stats_di
  WHERE external_material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001', 'MAT-DUP-001', 'MAT-CONFLICT-001');

  DELETE FROM dws.marketing_content_asset_qianchuan_summary
  WHERE asset_id IN (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111112',
    '11111111-1111-1111-1111-111111111113'
  );

  DELETE FROM dws.marketing_content_qianchuan_material_summary
  WHERE material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001', 'MAT-DUP-001', 'MAT-CONFLICT-001');

  DELETE FROM dwd.marketing_content_qianchuan_material_performance_di
  WHERE material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001', 'MAT-DUP-001', 'MAT-CONFLICT-001');

  DELETE FROM dws.marketing_content_qianchuan_live_room_acceptance_di
  WHERE douyin_account_display_id = 'dy_live_001'
    AND stat_date = DATE '2026-06-18';

  DELETE FROM ods.douyin_qianchuan_shortvideo_raw
  WHERE material_id IN ('MAT-PRODUCT-001', 'MAT-DUP-001', 'MAT-CONFLICT-001');

  DELETE FROM ods.douyin_qianchuan_live_video_raw
  WHERE material_id IN ('MAT-LIVE-001', 'MAT-CONFLICT-001');

  DELETE FROM ods.douyin_trade_sale_live_raw
  WHERE anchor_douyin_id = 'dy_live_001'
    AND live_start_time::DATE = DATE '2026-06-18';

  DELETE FROM ads.marketing_content_ad_materials
  WHERE external_material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001', 'MAT-DUP-001', 'MAT-CONFLICT-001');

  DELETE FROM ads.marketing_content_platform_videos
  WHERE platform_video_id IN (
    '31111111-1111-1111-1111-111111111111',
    '31111111-1111-1111-1111-111111111112',
    '31111111-1111-1111-1111-111111111113',
    '31111111-1111-1111-1111-111111111114'
  );

  DELETE FROM ads.marketing_content_assets
  WHERE asset_id IN (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111112',
    '11111111-1111-1111-1111-111111111113'
  );
END;
$$;

INSERT INTO ads.marketing_content_assets (asset_id, title, is_deleted)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'qianchuan fixture mixed product live asset', FALSE),
  ('11111111-1111-1111-1111-111111111112', 'qianchuan fixture duplicate material asset', FALSE),
  ('11111111-1111-1111-1111-111111111113', 'qianchuan fixture cross source conflict asset', FALSE)
ON CONFLICT (asset_id) DO UPDATE
SET title = EXCLUDED.title,
    is_deleted = EXCLUDED.is_deleted,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO ads.marketing_content_platform_videos (
  platform_video_id,
  asset_id,
  platform,
  external_video_id,
  relation_status
)
VALUES
  ('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'douyin', 'VID-PRODUCT-001', 'active'),
  ('31111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'douyin', 'VID-LIVE-001', 'active'),
  ('31111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111112', 'douyin', 'VID-DUP-001', 'active'),
  ('31111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111113', 'douyin', 'VID-CONFLICT-001', 'active')
ON CONFLICT (platform_video_id) DO UPDATE
SET asset_id = EXCLUDED.asset_id,
    platform = EXCLUDED.platform,
    external_video_id = EXCLUDED.external_video_id,
    relation_status = EXCLUDED.relation_status,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO ads.marketing_content_ad_materials (
  ad_material_id,
  asset_id,
  platform_video_id,
  ad_platform,
  external_material_id,
  relation_status
)
VALUES
  ('21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '31111111-1111-1111-1111-111111111111', 'qianchuan', 'MAT-PRODUCT-001', 'active'),
  ('21111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '31111111-1111-1111-1111-111111111112', 'qianchuan', 'MAT-LIVE-001', 'active'),
  ('21111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111112', '31111111-1111-1111-1111-111111111113', 'qianchuan', 'MAT-DUP-001', 'active'),
  ('21111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111113', '31111111-1111-1111-1111-111111111114', 'qianchuan', 'MAT-CONFLICT-001', 'active')
ON CONFLICT (ad_material_id) DO UPDATE
SET asset_id = EXCLUDED.asset_id,
    platform_video_id = EXCLUDED.platform_video_id,
    ad_platform = EXCLUDED.ad_platform,
    external_material_id = EXCLUDED.external_material_id,
    relation_status = EXCLUDED.relation_status,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO ods.douyin_qianchuan_shortvideo_raw (
  material_id,
  stat_date,
  source_file_name,
  ingest_time,
  material_video_name,
  material_created_at,
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
  net_gmv_roi,
  net_gmv,
  net_order_count,
  net_order_cost,
  net_gmv_settlement_rate,
  refund_rate_1h
)
VALUES
  ('MAT-PRODUCT-001', '2026-06-18', 'fixture_product.csv', '2026-06-18 06:00:00+00', 'Product material fixture', '2026-06-01 00:00:00+00', 10000, 600, 0.0600, 0.0667, 800, 40, 4000, 5.0, 20, 3600, 4.20, 3360, 36, 22.22, 0.84, 0.06),
  ('MAT-DUP-001', '2026-06-18', 'dup_old.csv', '2026-06-18 05:00:00+00', 'Duplicate old fixture', '2026-06-01 00:00:00+00', 5000, 300, 0.0600, 0.0600, 500, 20, 2000, 4.0, 25, 1800, 3.20, 1600, 18, 27.78, 0.80, 0.05),
  ('MAT-DUP-001', '2026-06-18', 'dup_new.csv', '2026-06-18 07:00:00+00', 'Duplicate newest fixture', '2026-06-01 00:00:00+00', 7000, 420, 0.0600, 0.0714, 700, 30, 3000, 4.2857, 23.33, 2700, 3.60, 2520, 27, 25.93, 0.84, 0.04),
  ('MAT-CONFLICT-001', '2026-06-18', 'conflict_product.csv', '2026-06-18 06:00:00+00', 'Conflict primary product fixture', '2026-06-01 00:00:00+00', 8000, 480, 0.0600, 0.0625, 600, 30, 2400, 4.0, 20, 2160, 3.20, 1920, 24, 25.00, 0.80, 0.07);

INSERT INTO ods.douyin_qianchuan_live_video_raw (
  material_id,
  stat_date,
  source_file_name,
  ingest_time,
  material_video_name,
  material_created_at,
  promotion_type,
  global_material_video_type,
  live_room_name,
  douyin_account_display_id,
  overall_impression_count,
  overall_click_count,
  overall_cost,
  overall_order_count,
  overall_gmv,
  user_pay_amount,
  net_gmv,
  net_order_count,
  refund_rate_1h,
  settlement_roi_7d,
  settlement_amount_7d,
  settlement_order_count_7d,
  video_like_count,
  new_fans_count,
  avg_watch_duration,
  video_play_count,
  video_complete_play_count,
  video_comment_count,
  play_rate_2s,
  play_rate_3s,
  play_rate_5s,
  play_rate_10s,
  legacy_boost_cost,
  legacy_boost_order_count,
  legacy_boost_gmv,
  boost_cost,
  boost_order_count,
  boost_gmv,
  boost_impression_count,
  boost_click_count,
  boost_net_gmv,
  boost_net_order_count,
  boost_refund_rate_1h
)
VALUES
  ('MAT-LIVE-001', '2026-06-18', 'fixture_live.csv', '2026-06-18 06:05:00+00', 'Live material fixture', '2026-06-01 00:00:00+00', 'short_video_to_live', 'live_room_entry', 'Fixture live room', 'dy_live_001', 20000, 1400, 1200, 30, 2800, 2600, 2380, 26, 0.10, 2.10, 2520, 27, 120, 88, 13.5, 16000, 6400, 42, 0.80, 0.70, 0.52, 0.32, 100, 2, 220, 180, 3, 420, 3000, 180, 360, 3, 0.08),
  ('MAT-CONFLICT-001', '2026-06-18', 'conflict_live.csv', '2026-06-18 06:10:00+00', 'Conflict live fixture', '2026-06-01 00:00:00+00', 'short_video_to_live', 'live_room_entry', 'Conflict live room', 'dy_live_001', 9000, 540, 900, 12, 1800, 1700, 1530, 11, 0.09, 1.80, 1620, 12, 60, 30, 10.0, 7000, 2800, 20, 0.75, 0.66, 0.48, 0.25, 50, 1, 100, 90, 1, 180, 1000, 54, 150, 1, 0.09);

INSERT INTO ods.douyin_trade_sale_live_raw (
  live_start_time,
  anchor_douyin_id,
  anchor_nickname,
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
  live_order_count,
  live_gmv,
  live_user_pay_amount,
  live_buyer_count,
  live_ad_cost,
  ad_cost_shop_bound,
  ad_cost_shop_targeted,
  net_gmv,
  net_order_count,
  refund_rate_1h
)
VALUES
  ('2026-06-18 12:00:00+00', 'dy_live_001', 'Fixture Anchor', 180, 9000, 22000, 5200, 15000, 4200, 980, 420, 9.5, 560, 210, 4300, 1200, 9000, 2600, 85, 9800, 9300, 78, 2400, 1500, 900, 8200, 72, 0.08);

SELECT 'main_asset_refresh' AS fixture_case, *
FROM ads.refresh_marketing_content_qianchuan_all_domain_performance(
  '11111111-1111-1111-1111-111111111111',
  DATE '2026-06-18',
  DATE '2026-06-18'
);

SELECT 'duplicate_asset_refresh' AS fixture_case, *
FROM ads.refresh_marketing_content_qianchuan_all_domain_performance(
  '11111111-1111-1111-1111-111111111112',
  DATE '2026-06-18',
  DATE '2026-06-18'
);

SELECT 'conflict_asset_refresh' AS fixture_case, *
FROM ads.refresh_marketing_content_qianchuan_all_domain_performance(
  '11111111-1111-1111-1111-111111111113',
  DATE '2026-06-18',
  DATE '2026-06-18'
);

DO $$
DECLARE
  v_count INTEGER;
  v_total_impressions BIGINT;
  v_total_clicks BIGINT;
  v_total_orders BIGINT;
  v_total_cost NUMERIC;
  v_total_gmv NUMERIC;
  v_text TEXT;
  v_json JSONB;
BEGIN
  SELECT
    COUNT(*),
    SUM(total_impressions),
    SUM(total_clicks),
    SUM(total_orders),
    SUM(total_cost),
    SUM(total_gmv)
  INTO
    v_count,
    v_total_impressions,
    v_total_clicks,
    v_total_orders,
    v_total_cost,
    v_total_gmv
  FROM dws.marketing_content_qianchuan_material_summary
  WHERE asset_id = '11111111-1111-1111-1111-111111111111';

  IF v_count <> 2
    OR v_total_impressions <> 30000
    OR v_total_clicks <> 2000
    OR v_total_orders <> 70
    OR v_total_cost <> 2000
    OR v_total_gmv <> 6800 THEN
    RAISE EXCEPTION 'main fixture summary mismatch: count %, impressions %, clicks %, orders %, cost %, gmv %',
      v_count, v_total_impressions, v_total_clicks, v_total_orders, v_total_cost, v_total_gmv;
  END IF;

  SELECT
    material_count,
    total_impressions,
    total_clicks,
    total_orders,
    total_cost,
    total_gmv,
    material_ids
  INTO
    v_count,
    v_total_impressions,
    v_total_clicks,
    v_total_orders,
    v_total_cost,
    v_total_gmv,
    v_json
  FROM dws.marketing_content_asset_qianchuan_summary
  WHERE asset_id = '11111111-1111-1111-1111-111111111111'
    AND product_material_count = 1
    AND live_material_count = 1
    AND latest_live_acceptance_status = 'ok';

  IF v_count <> 2
    OR v_total_impressions <> 30000
    OR v_total_clicks <> 2000
    OR v_total_orders <> 70
    OR v_total_cost <> 2000
    OR v_total_gmv <> 6800 THEN
    RAISE EXCEPTION 'main fixture asset summary mismatch: count %, impressions %, clicks %, orders %, cost %, gmv %',
      v_count, v_total_impressions, v_total_clicks, v_total_orders, v_total_cost, v_total_gmv;
  END IF;

  IF v_json IS NULL OR jsonb_array_length(v_json) <> 2 THEN
    RAISE EXCEPTION 'main fixture asset summary material_ids mismatch: %', v_json;
  END IF;

  SELECT latest_live_acceptance_status
  INTO v_text
  FROM dws.marketing_content_qianchuan_material_summary
  WHERE material_id = 'MAT-LIVE-001';

  IF v_text <> 'ok' THEN
    RAISE EXCEPTION 'live acceptance fixture status mismatch: %', v_text;
  END IF;

  SELECT data_quality_status || ':' || source_file_name || ':' || source_row_count::TEXT
  INTO v_text
  FROM dwd.marketing_content_qianchuan_material_performance_di
  WHERE material_id = 'MAT-DUP-001'
    AND stat_date = DATE '2026-06-18';

  IF v_text <> 'duplicate_material_date:dup_new.csv:2' THEN
    RAISE EXCEPTION 'duplicate material/date fixture mismatch: %', v_text;
  END IF;

  SELECT raw_metrics->'crossSourceConflict'
  INTO v_json
  FROM dwd.marketing_content_qianchuan_material_performance_di
  WHERE material_id = 'MAT-CONFLICT-001'
    AND stat_date = DATE '2026-06-18'
    AND objective = 'product_all_domain_shortvideo'
    AND source_table = 'ods.douyin_qianchuan_shortvideo_raw'
    AND source_file_name = 'conflict_product.csv'
    AND source_row_count = 1
    AND data_quality_status = 'cross_source_conflict'
    AND overall_cost = 600
    AND overall_gmv = 2400;

  IF v_json IS NULL
    OR v_json->>'conflictingObjective' <> 'live_all_domain_shortvideo'
    OR v_json->>'conflictingSourceTable' <> 'ods.douyin_qianchuan_live_video_raw'
    OR v_json->>'conflictingSourceFileName' <> 'conflict_live.csv' THEN
    RAISE EXCEPTION 'cross-source conflict fixture mismatch: %', v_json;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dws.marketing_content_qianchuan_material_summary
    WHERE latest_metrics::jsonb->>'boostPolicy' <> 'boost metrics are explanatory only; do not add to overall metrics'
  ) THEN
    RAISE EXCEPTION 'boost policy marker missing from fixture summaries';
  END IF;

  RAISE NOTICE 'qianchuan all-domain fixture smoke assertions passed';
END;
$$;
SQL

echo "==> Running qianchuan all-domain structural SQL check"
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/tests/sql/marketing_content_qianchuan_all_domain_performance_check.sql"

echo "==> qianchuan all-domain fixture smoke passed"
