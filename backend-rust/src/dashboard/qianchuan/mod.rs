use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::error;

use crate::state::AppState;

use super::errors::normalize_qianchuan_error_message;
use super::params::LiveQueryParams;
use super::responses::{json_message_response, json_value_response};
use super::validation::{
    get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
    normalize_platform, resolve_max_query_date_range_days,
};

mod empty_payloads;
mod material_scopes;

use empty_payloads::empty_totals_value;
use material_scopes::build_material_scopes_payload;

const DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.douyin_qianchuan_live_all_domain_material_daily
"#;

const AS_OF_SQL: &str = r#"
SELECT MAX(stat_date)::TEXT AS as_of_date
FROM ads.douyin_qianchuan_live_all_domain_material_daily
WHERE stat_date BETWEEN $1::DATE AND $2::DATE
"#;

const TOTALS_SQL: &str = r#"
WITH scope AS (
  SELECT 'current'::TEXT AS bucket, $1::DATE AS start_date, $2::DATE AS end_date
  UNION ALL
  SELECT 'previous'::TEXT, $3::DATE, $4::DATE
),
bucket_agg AS (
  SELECT
    sc.bucket,
    COUNT(DISTINCT CONCAT_WS('||', d.material_type, d.promotion_type, d.douyin_account_display_id, d.material_key))
      FILTER (WHERE d.material_key IS NOT NULL)::BIGINT AS material_count,
    COUNT(DISTINCT d.douyin_account_display_id)::BIGINT AS account_count,
    COALESCE(SUM(d.overall_impression_count), 0)::NUMERIC AS overall_impression_count,
    COALESCE(SUM(d.overall_click_count), 0)::NUMERIC AS overall_click_count,
    COALESCE(SUM(d.overall_order_count), 0)::NUMERIC AS overall_order_count,
    COALESCE(SUM(d.overall_gmv), 0)::NUMERIC AS overall_gmv,
    COALESCE(SUM(d.overall_cost), 0)::NUMERIC AS overall_cost,
    COALESCE(SUM(d.net_gmv), 0)::NUMERIC AS net_gmv,
    COALESCE(SUM(d.net_order_count), 0)::NUMERIC AS net_order_count,
    COALESCE(SUM(d.refund_amount_1h), 0)::NUMERIC AS refund_amount_1h,
    COALESCE(SUM(d.settlement_amount_7d), 0)::NUMERIC AS settlement_amount_7d,
    COALESCE(SUM(d.settlement_amount_14d), 0)::NUMERIC AS settlement_amount_14d,
    COALESCE(SUM(d.settlement_amount_30d), 0)::NUMERIC AS settlement_amount_30d,
    COALESCE(SUM(d.settlement_amount_90d), 0)::NUMERIC AS settlement_amount_90d,
    COALESCE(SUM(d.new_fans_count), 0)::NUMERIC AS new_fans_count,
    COALESCE(SUM(d.live_comment_count), 0)::NUMERIC AS live_comment_count,
    COALESCE(SUM(d.live_like_count), 0)::NUMERIC AS live_like_count,
    COALESCE(SUM(d.video_like_count), 0)::NUMERIC AS video_like_count,
    COALESCE(SUM(d.video_play_count), 0)::NUMERIC AS video_play_count,
    COALESCE(SUM(d.video_complete_play_count), 0)::NUMERIC AS video_complete_play_count,
    COALESCE(SUM(d.video_comment_count), 0)::NUMERIC AS video_comment_count
  FROM scope sc
  LEFT JOIN ads.douyin_qianchuan_live_all_domain_material_daily d
    ON d.stat_date BETWEEN sc.start_date AND sc.end_date
   AND ($5::TEXT IS NULL OR d.material_type = $5::TEXT)
  GROUP BY sc.bucket
)
SELECT COALESCE(
  jsonb_object_agg(
    bucket,
    jsonb_build_object(
      'material_count', material_count,
      'account_count', account_count,
      'overall_impression_count', overall_impression_count,
      'overall_click_count', overall_click_count,
      'overall_click_rate', CASE WHEN overall_impression_count > 0 THEN ROUND(overall_click_count / overall_impression_count, 6) END,
      'overall_conversion_rate', CASE WHEN overall_click_count > 0 THEN ROUND(overall_order_count / overall_click_count, 6) END,
      'overall_order_count', overall_order_count,
      'overall_gmv', overall_gmv,
      'overall_cost', overall_cost,
      'overall_pay_roi', CASE WHEN overall_cost > 0 THEN ROUND(overall_gmv / overall_cost, 6) END,
      'overall_order_cost', CASE WHEN overall_order_count > 0 THEN ROUND(overall_cost / overall_order_count, 2) END,
      'overall_cpm', CASE WHEN overall_impression_count > 0 THEN ROUND(overall_cost * 1000 / overall_impression_count, 2) END,
      'overall_cpc', CASE WHEN overall_click_count > 0 THEN ROUND(overall_cost / overall_click_count, 2) END,
      'net_gmv', net_gmv,
      'net_gmv_roi', CASE WHEN overall_cost > 0 THEN ROUND(net_gmv / overall_cost, 6) END,
      'net_order_count', net_order_count,
      'net_order_cost', CASE WHEN net_order_count > 0 THEN ROUND(overall_cost / net_order_count, 2) END,
      'refund_amount_1h', refund_amount_1h,
      'refund_rate_1h', CASE WHEN overall_gmv > 0 THEN ROUND(refund_amount_1h / overall_gmv, 6) END,
      'settlement_amount_7d', settlement_amount_7d,
      'settlement_roi_7d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_7d / overall_cost, 6) END,
      'settlement_amount_14d', settlement_amount_14d,
      'settlement_roi_14d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_14d / overall_cost, 6) END,
      'settlement_amount_30d', settlement_amount_30d,
      'settlement_roi_30d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_30d / overall_cost, 6) END,
      'settlement_amount_90d', settlement_amount_90d,
      'settlement_roi_90d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_90d / overall_cost, 6) END,
      'new_fans_count', new_fans_count,
      'live_comment_count', live_comment_count,
      'live_like_count', live_like_count,
      'video_like_count', video_like_count,
      'video_play_count', video_play_count,
      'video_complete_play_count', video_complete_play_count,
      'video_complete_play_rate', CASE WHEN video_play_count > 0 THEN ROUND(video_complete_play_count / video_play_count, 6) END,
      'video_comment_count', video_comment_count
    )
  ),
  '{}'::JSONB
) AS totals_payload
FROM bucket_agg
"#;

const TREND_SQL: &str = r#"
WITH date_spine AS (
  SELECT generate_series($1::DATE, $2::DATE, INTERVAL '1 day')::DATE AS stat_date
),
day_agg AS (
  SELECT
    stat_date,
    COALESCE(SUM(overall_cost), 0)::NUMERIC AS overall_cost,
    COALESCE(SUM(overall_gmv), 0)::NUMERIC AS overall_gmv,
    COALESCE(SUM(net_gmv), 0)::NUMERIC AS net_gmv,
    COALESCE(SUM(overall_order_count), 0)::NUMERIC AS overall_order_count,
    COALESCE(SUM(overall_impression_count), 0)::NUMERIC AS overall_impression_count,
    COALESCE(SUM(overall_click_count), 0)::NUMERIC AS overall_click_count,
    COALESCE(SUM(refund_amount_1h), 0)::NUMERIC AS refund_amount_1h,
    COALESCE(SUM(settlement_amount_7d), 0)::NUMERIC AS settlement_amount_7d,
    COALESCE(SUM(settlement_amount_14d), 0)::NUMERIC AS settlement_amount_14d,
    COALESCE(SUM(settlement_amount_30d), 0)::NUMERIC AS settlement_amount_30d
  FROM ads.douyin_qianchuan_live_all_domain_material_daily
  WHERE stat_date BETWEEN $1::DATE AND $2::DATE
    AND ($3::TEXT IS NULL OR material_type = $3::TEXT)
  GROUP BY stat_date
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'date', spine.stat_date::TEXT,
      'overall_cost', COALESCE(agg.overall_cost, 0),
      'overall_gmv', COALESCE(agg.overall_gmv, 0),
      'overall_pay_roi', CASE WHEN COALESCE(agg.overall_cost, 0) > 0 THEN ROUND(agg.overall_gmv / agg.overall_cost, 6) END,
      'net_gmv', COALESCE(agg.net_gmv, 0),
      'net_gmv_roi', CASE WHEN COALESCE(agg.overall_cost, 0) > 0 THEN ROUND(agg.net_gmv / agg.overall_cost, 6) END,
      'overall_order_count', COALESCE(agg.overall_order_count, 0),
      'overall_click_rate', CASE WHEN COALESCE(agg.overall_impression_count, 0) > 0 THEN ROUND(agg.overall_click_count / agg.overall_impression_count, 6) END,
      'refund_rate_1h', CASE WHEN COALESCE(agg.overall_gmv, 0) > 0 THEN ROUND(agg.refund_amount_1h / agg.overall_gmv, 6) END,
      'settlement_roi_7d', CASE WHEN COALESCE(agg.overall_cost, 0) > 0 THEN ROUND(agg.settlement_amount_7d / agg.overall_cost, 6) END,
      'settlement_roi_14d', CASE WHEN COALESCE(agg.overall_cost, 0) > 0 THEN ROUND(agg.settlement_amount_14d / agg.overall_cost, 6) END,
      'settlement_roi_30d', CASE WHEN COALESCE(agg.overall_cost, 0) > 0 THEN ROUND(agg.settlement_amount_30d / agg.overall_cost, 6) END
    )
    ORDER BY spine.stat_date ASC
  ),
  '[]'::JSONB
) AS trend_payload
FROM date_spine spine
LEFT JOIN day_agg agg
  ON agg.stat_date = spine.stat_date
"#;

const TYPE_MIX_SQL: &str = r#"
WITH by_type AS (
  SELECT
    material_type,
    COUNT(DISTINCT CONCAT_WS('||', promotion_type, douyin_account_display_id, material_key))::BIGINT AS material_count,
    COALESCE(SUM(overall_cost), 0)::NUMERIC AS overall_cost,
    COALESCE(SUM(overall_gmv), 0)::NUMERIC AS overall_gmv,
    COALESCE(SUM(net_gmv), 0)::NUMERIC AS net_gmv,
    COALESCE(SUM(overall_order_count), 0)::NUMERIC AS overall_order_count,
    COALESCE(SUM(overall_impression_count), 0)::NUMERIC AS overall_impression_count,
    COALESCE(SUM(overall_click_count), 0)::NUMERIC AS overall_click_count,
    COALESCE(SUM(refund_amount_1h), 0)::NUMERIC AS refund_amount_1h
  FROM ads.douyin_qianchuan_live_all_domain_material_daily
  WHERE stat_date BETWEEN $1::DATE AND $2::DATE
  GROUP BY material_type
),
total AS (
  SELECT
    COALESCE(SUM(overall_cost), 0)::NUMERIC AS total_cost,
    COALESCE(SUM(overall_gmv), 0)::NUMERIC AS total_gmv
  FROM by_type
)
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'material_type', by_type.material_type,
      'material_type_label', CASE by_type.material_type WHEN 'live_room_screen' THEN '直播间画面' WHEN 'live_video' THEN '视频' ELSE by_type.material_type END,
      'material_count', by_type.material_count,
      'overall_cost', by_type.overall_cost,
      'overall_cost_share', CASE WHEN total.total_cost > 0 THEN ROUND(by_type.overall_cost / total.total_cost, 6) END,
      'overall_gmv', by_type.overall_gmv,
      'overall_gmv_share', CASE WHEN total.total_gmv > 0 THEN ROUND(by_type.overall_gmv / total.total_gmv, 6) END,
      'overall_pay_roi', CASE WHEN by_type.overall_cost > 0 THEN ROUND(by_type.overall_gmv / by_type.overall_cost, 6) END,
      'net_gmv', by_type.net_gmv,
      'net_gmv_roi', CASE WHEN by_type.overall_cost > 0 THEN ROUND(by_type.net_gmv / by_type.overall_cost, 6) END,
      'overall_order_count', by_type.overall_order_count,
      'overall_click_rate', CASE WHEN by_type.overall_impression_count > 0 THEN ROUND(by_type.overall_click_count / by_type.overall_impression_count, 6) END,
      'refund_rate_1h', CASE WHEN by_type.overall_gmv > 0 THEN ROUND(by_type.refund_amount_1h / by_type.overall_gmv, 6) END
    )
    ORDER BY by_type.overall_cost DESC, by_type.material_type ASC
  ),
  '[]'::JSONB
) AS material_type_mix_payload
FROM by_type
CROSS JOIN total
"#;

const ROWS_SQL: &str = r#"
WITH scoped AS (
  SELECT d.*
  FROM ads.douyin_qianchuan_live_all_domain_material_daily d
  WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
    AND d.material_type = $3::TEXT
),
source_file_agg AS (
  SELECT
    s.material_type,
    s.promotion_type,
    s.douyin_account_display_id,
    s.material_key,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT unnested.source_file_name), NULL)::TEXT[] AS source_file_names
  FROM scoped s
  LEFT JOIN LATERAL UNNEST(s.source_file_names) AS unnested(source_file_name) ON true
  GROUP BY
    s.material_type,
    s.promotion_type,
    s.douyin_account_display_id,
    s.material_key
),
material_asset_candidates AS (
  SELECT
    NULLIF(BTRIM(material.external_material_id), '') AS material_id,
    material.asset_id
  FROM ads.marketing_content_ad_materials material
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = material.asset_id
   AND asset.is_deleted = FALSE
  WHERE material.relation_status = 'active'
    AND material.ad_platform = 'qianchuan'
    AND NULLIF(BTRIM(material.external_material_id), '') IS NOT NULL
  UNION ALL
  SELECT
    NULLIF(BTRIM(video.external_item_id), '') AS material_id,
    video.asset_id
  FROM ads.marketing_content_platform_videos video
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = video.asset_id
   AND asset.is_deleted = FALSE
  WHERE video.relation_status = 'active'
    AND video.platform = 'douyin'
    AND NULLIF(BTRIM(video.external_item_id), '') IS NOT NULL
),
material_asset_resolution AS (
  SELECT
    material_id,
    CASE
      WHEN COUNT(DISTINCT asset_id) = 1
        THEN ((ARRAY_AGG(DISTINCT asset_id))[1])::TEXT
    END AS asset_id
  FROM material_asset_candidates
  GROUP BY material_id
),
period_agg AS (
  SELECT
    s.material_type,
    s.promotion_type,
    s.douyin_account_display_id,
    MAX(s.douyin_account_name) AS douyin_account_name,
    MAX(s.live_room_name) AS live_room_name,
    s.material_key,
    MAX(s.material_id) AS material_id,
    MAX(s.material_video_name) AS material_video_name,
    MIN(s.material_created_at) AS material_created_at,
    MAX(s.global_material_video_type) AS global_material_video_type,
    MIN(s.stat_date)::TEXT AS start_date,
    MAX(s.stat_date)::TEXT AS end_date,
    MAX(s.stat_date)::TEXT AS stat_date,
    SUM(s.source_row_count)::BIGINT AS source_row_count,
    SUM(s.overall_impression_count)::NUMERIC AS overall_impression_count,
    SUM(s.overall_click_count)::NUMERIC AS overall_click_count,
    SUM(s.overall_order_count)::NUMERIC AS overall_order_count,
    SUM(s.overall_gmv)::NUMERIC AS overall_gmv,
    SUM(s.overall_cost)::NUMERIC AS overall_cost,
    SUM(s.net_gmv)::NUMERIC AS net_gmv,
    SUM(s.net_order_count)::NUMERIC AS net_order_count,
    SUM(s.refund_amount_1h)::NUMERIC AS refund_amount_1h,
    SUM(s.settlement_amount_7d)::NUMERIC AS settlement_amount_7d,
    SUM(s.settlement_amount_14d)::NUMERIC AS settlement_amount_14d,
    SUM(s.settlement_amount_30d)::NUMERIC AS settlement_amount_30d,
    SUM(s.settlement_amount_90d)::NUMERIC AS settlement_amount_90d,
    SUM(s.new_fans_count)::NUMERIC AS new_fans_count,
    SUM(s.live_comment_count)::NUMERIC AS live_comment_count,
    SUM(s.live_like_count)::NUMERIC AS live_like_count,
    SUM(s.video_like_count)::NUMERIC AS video_like_count,
    SUM(s.video_play_count)::NUMERIC AS video_play_count,
    SUM(s.video_complete_play_count)::NUMERIC AS video_complete_play_count,
    SUM(s.video_comment_count)::NUMERIC AS video_comment_count,
    CASE
      WHEN SUM(CASE WHEN s.avg_watch_duration IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END) > 0
        THEN ROUND(
          SUM(COALESCE(s.avg_watch_duration, 0) * COALESCE(s.video_play_count, 0))
          / SUM(CASE WHEN s.avg_watch_duration IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END),
          6
        )
    END AS avg_watch_duration,
    CASE
      WHEN SUM(CASE WHEN s.play_rate_2s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END) > 0
        THEN ROUND(
          SUM(COALESCE(s.play_rate_2s, 0) * COALESCE(s.video_play_count, 0))
          / SUM(CASE WHEN s.play_rate_2s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END),
          6
        )
    END AS play_rate_2s,
    CASE
      WHEN SUM(CASE WHEN s.play_rate_3s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END) > 0
        THEN ROUND(
          SUM(COALESCE(s.play_rate_3s, 0) * COALESCE(s.video_play_count, 0))
          / SUM(CASE WHEN s.play_rate_3s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END),
          6
        )
    END AS play_rate_3s,
    CASE
      WHEN SUM(CASE WHEN s.play_rate_5s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END) > 0
        THEN ROUND(
          SUM(COALESCE(s.play_rate_5s, 0) * COALESCE(s.video_play_count, 0))
          / SUM(CASE WHEN s.play_rate_5s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END),
          6
        )
    END AS play_rate_5s,
    CASE
      WHEN SUM(CASE WHEN s.play_rate_10s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END) > 0
        THEN ROUND(
          SUM(COALESCE(s.play_rate_10s, 0) * COALESCE(s.video_play_count, 0))
          / SUM(CASE WHEN s.play_rate_10s IS NOT NULL THEN COALESCE(s.video_play_count, 0) ELSE 0 END),
          6
        )
    END AS play_rate_10s,
    SUM(s.boost_cost)::NUMERIC AS boost_cost,
    SUM(s.boost_gmv)::NUMERIC AS boost_gmv
  FROM scoped s
  GROUP BY
    s.material_type,
    s.promotion_type,
    s.douyin_account_display_id,
    s.material_key
),
ranked AS (
  SELECT
    p.*,
    mar.asset_id,
    COALESCE(sf.source_file_names, '{}'::TEXT[]) AS source_file_names,
    ROW_NUMBER() OVER (
      ORDER BY p.overall_cost DESC, p.overall_gmv DESC, p.material_key ASC
    ) AS rn,
    SUM(p.overall_cost) OVER () AS total_material_type_cost
  FROM period_agg p
  LEFT JOIN source_file_agg sf
    ON sf.material_type = p.material_type
   AND sf.promotion_type = p.promotion_type
   AND sf.douyin_account_display_id = p.douyin_account_display_id
   AND sf.material_key = p.material_key
  LEFT JOIN material_asset_resolution mar
    ON mar.material_id = NULLIF(BTRIM(p.material_id), '')
)
SELECT COALESCE(
  jsonb_agg(
    (
      jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date,
      'stat_date', stat_date,
      'material_type', material_type,
      'promotion_type', promotion_type,
      'douyin_account_display_id', douyin_account_display_id,
      'douyin_account_name', douyin_account_name,
      'live_room_name', live_room_name,
      'material_key', material_key,
      'material_id', material_id,
      'asset_id', asset_id,
      'material_video_name', material_video_name,
      'material_created_at', material_created_at::TEXT,
      'global_material_video_type', global_material_video_type,
      'source_file_names', source_file_names,
      'source_row_count', source_row_count,
      'overall_impression_count', overall_impression_count,
      'overall_click_count', overall_click_count,
      'overall_click_rate', CASE WHEN overall_impression_count > 0 THEN ROUND(overall_click_count / overall_impression_count, 6) END,
      'overall_conversion_rate', CASE WHEN overall_click_count > 0 THEN ROUND(overall_order_count / overall_click_count, 6) END,
      'overall_order_count', overall_order_count,
      'overall_gmv', overall_gmv,
      'overall_cost', overall_cost,
      'overall_cost_ratio', CASE WHEN total_material_type_cost > 0 THEN ROUND(overall_cost / total_material_type_cost, 6) END
    )
    || jsonb_build_object(
      'overall_pay_roi', CASE WHEN overall_cost > 0 THEN ROUND(overall_gmv / overall_cost, 6) END,
      'overall_order_cost', CASE WHEN overall_order_count > 0 THEN ROUND(overall_cost / overall_order_count, 2) END,
      'overall_cpm', CASE WHEN overall_impression_count > 0 THEN ROUND(overall_cost * 1000 / overall_impression_count, 2) END,
      'overall_cpc', CASE WHEN overall_click_count > 0 THEN ROUND(overall_cost / overall_click_count, 2) END,
      'net_gmv', net_gmv,
      'net_gmv_roi', CASE WHEN overall_cost > 0 THEN ROUND(net_gmv / overall_cost, 6) END,
      'net_order_count', net_order_count,
      'net_order_cost', CASE WHEN net_order_count > 0 THEN ROUND(overall_cost / net_order_count, 2) END,
      'refund_rate_1h', CASE WHEN overall_gmv > 0 THEN ROUND(refund_amount_1h / overall_gmv, 6) END,
      'settlement_roi_7d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_7d / overall_cost, 6) END,
      'settlement_roi_14d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_14d / overall_cost, 6) END,
      'settlement_roi_30d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_30d / overall_cost, 6) END,
      'settlement_roi_90d', CASE WHEN overall_cost > 0 THEN ROUND(settlement_amount_90d / overall_cost, 6) END,
      'new_fans_count', new_fans_count,
      'live_comment_count', live_comment_count,
      'live_like_count', live_like_count,
      'video_like_count', video_like_count,
      'avg_watch_duration', avg_watch_duration,
      'video_play_count', video_play_count,
      'video_complete_play_count', video_complete_play_count,
      'video_complete_play_rate', CASE WHEN video_play_count > 0 THEN ROUND(video_complete_play_count / video_play_count, 6) END,
      'video_comment_count', video_comment_count,
      'play_rate_2s', play_rate_2s,
      'play_rate_3s', play_rate_3s,
      'play_rate_5s', play_rate_5s,
      'play_rate_10s', play_rate_10s,
      'boost_cost', boost_cost,
      'boost_gmv', boost_gmv,
      'boost_pay_roi', CASE WHEN boost_cost > 0 THEN ROUND(boost_gmv / boost_cost, 6) END
    )
    )
    ORDER BY overall_cost DESC, overall_gmv DESC, material_key ASC
  ),
  '[]'::JSONB
) AS rows_payload
FROM ranked
WHERE rn <= 500
"#;

const DETAIL_ROW_COUNT_SQL: &str = r#"
WITH period_agg AS (
  SELECT
    d.material_type,
    d.promotion_type,
    d.douyin_account_display_id,
    d.material_key
  FROM ads.douyin_qianchuan_live_all_domain_material_daily d
  WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
    AND ($3::TEXT IS NULL OR d.material_type = $3::TEXT)
  GROUP BY
    d.material_type,
    d.promotion_type,
    d.douyin_account_display_id,
    d.material_key
)
SELECT COUNT(*)::BIGINT AS detail_row_count
FROM period_agg
"#;

#[derive(Debug)]
struct QianchuanDataBundle {
    min_date: Option<String>,
    max_date: Option<String>,
    as_of_date: Option<String>,
    current_totals: Value,
    previous_totals: Value,
    trend: Value,
    material_scopes: Value,
    material_type_mix: Value,
    live_room_screen_rows: Value,
    live_video_rows: Value,
}

pub(crate) async fn get_qianchuan(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LiveQueryParams>,
) -> Response {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let prev_start_date = get_validated_date_param(query.prev_start_date.as_deref());
    let prev_end_date = get_validated_date_param(query.prev_end_date.as_deref());
    let platform = normalize_platform(query.platform.as_deref());

    if start_date.is_none()
        || end_date.is_none()
        || prev_start_date.is_none()
        || prev_end_date.is_none()
    {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date/prev_start_date/prev_end_date 必须为 YYYY-MM-DD",
        );
    }

    if platform != "douyin" {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：千川直播全域维度仅支持 platform=douyin",
        );
    }

    let start_date = start_date.expect("validated above");
    let end_date = end_date.expect("validated above");
    let prev_start_date = prev_start_date.expect("validated above");
    let prev_end_date = prev_end_date.expect("validated above");

    if !is_start_not_after_end(start_date.as_str(), end_date.as_str())
        || !is_start_not_after_end(prev_start_date.as_str(), prev_end_date.as_str())
    {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：开始日期不能大于结束日期",
        );
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(start_date.as_str(), end_date.as_str(), max_range_days)
        || !is_date_range_within_limit(
            prev_start_date.as_str(),
            prev_end_date.as_str(),
            max_range_days,
        )
    {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            format!("参数校验失败：日期跨度不能超过 {max_range_days} 天").as_str(),
        );
    }

    let data = match fetch_qianchuan_data(
        &state.pool,
        start_date.as_str(),
        end_date.as_str(),
        prev_start_date.as_str(),
        prev_end_date.as_str(),
    )
    .await
    {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_qianchuan_error_message(raw_error.as_str());
            error!(target: "dashboard-qianchuan", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(
        StatusCode::OK,
        json!({
          "startDate": start_date,
          "endDate": end_date,
          "prevStartDate": prev_start_date,
          "prevEndDate": prev_end_date,
          "platform": "douyin",
          "asOfDate": data.as_of_date,
          "dataDateBounds": {
            "minDate": data.min_date,
            "maxDate": data.max_date
          },
          "overview": {
            "currentTotals": data.current_totals,
            "previousTotals": data.previous_totals,
            "trend": data.trend
          },
          "materialScopes": data.material_scopes,
          "materialTypeMix": data.material_type_mix,
          "liveRoomScreen": {
            "rows": data.live_room_screen_rows
          },
          "liveVideo": {
            "rows": data.live_video_rows
          }
        }),
    )
}

async fn fetch_qianchuan_data(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
) -> Result<QianchuanDataBundle, String> {
    let current_dates = [start_date, end_date];
    let (
        (min_date, max_date),
        as_of_date,
        (current_totals, previous_totals),
        trend,
        (video_current_totals, video_previous_totals),
        video_trend,
        (live_room_current_totals, live_room_previous_totals),
        live_room_trend,
        material_type_mix,
        all_detail_row_count,
        live_room_detail_row_count,
        video_detail_row_count,
        live_room_screen_rows,
        live_video_rows,
    ) = tokio::try_join!(
        fetch_data_date_bounds(pool),
        fetch_as_of_date(pool, start_date, end_date),
        fetch_totals(
            pool,
            start_date,
            end_date,
            prev_start_date,
            prev_end_date,
            None
        ),
        fetch_trend(pool, start_date, end_date, None),
        fetch_totals(
            pool,
            start_date,
            end_date,
            prev_start_date,
            prev_end_date,
            Some("live_video")
        ),
        fetch_trend(pool, start_date, end_date, Some("live_video")),
        fetch_totals(
            pool,
            start_date,
            end_date,
            prev_start_date,
            prev_end_date,
            Some("live_room_screen")
        ),
        fetch_trend(pool, start_date, end_date, Some("live_room_screen")),
        fetch_json_payload(
            pool,
            TYPE_MIX_SQL,
            &current_dates,
            "material_type_mix_payload"
        ),
        fetch_detail_row_count(pool, start_date, end_date, None),
        fetch_detail_row_count(pool, start_date, end_date, Some("live_room_screen")),
        fetch_detail_row_count(pool, start_date, end_date, Some("live_video")),
        fetch_rows(pool, start_date, end_date, "live_room_screen"),
        fetch_rows(pool, start_date, end_date, "live_video"),
    )?;

    let material_scopes = build_material_scopes_payload(
        &current_totals,
        &previous_totals,
        &trend,
        &video_current_totals,
        &video_previous_totals,
        &video_trend,
        &live_room_current_totals,
        &live_room_previous_totals,
        &live_room_trend,
        all_detail_row_count,
        video_detail_row_count,
        live_room_detail_row_count,
    );

    Ok(QianchuanDataBundle {
        min_date,
        max_date,
        as_of_date,
        current_totals,
        previous_totals,
        trend,
        material_scopes,
        material_type_mix,
        live_room_screen_rows,
        live_video_rows,
    })
}

async fn fetch_data_date_bounds(pool: &PgPool) -> Result<(Option<String>, Option<String>), String> {
    let row = sqlx::query(DATE_BOUNDS_SQL)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let min_date = row
        .try_get::<Option<String>, _>("min_date")
        .map_err(|error| error.to_string())?;
    let max_date = row
        .try_get::<Option<String>, _>("max_date")
        .map_err(|error| error.to_string())?;

    Ok((min_date, max_date))
}

async fn fetch_as_of_date(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query(AS_OF_SQL)
        .bind(start_date)
        .bind(end_date)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    row.try_get::<Option<String>, _>("as_of_date")
        .map_err(|error| error.to_string())
}

async fn fetch_totals(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
    material_type: Option<&str>,
) -> Result<(Value, Value), String> {
    let row = sqlx::query(TOTALS_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(prev_start_date)
        .bind(prev_end_date)
        .bind(material_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let payload = row
        .try_get::<Value, _>("totals_payload")
        .map_err(|error| error.to_string())?;

    Ok((
        payload
            .get("current")
            .cloned()
            .unwrap_or_else(empty_totals_value),
        payload
            .get("previous")
            .cloned()
            .unwrap_or_else(empty_totals_value),
    ))
}

async fn fetch_trend(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    material_type: Option<&str>,
) -> Result<Value, String> {
    let row = sqlx::query(TREND_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(material_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    row.try_get::<Value, _>("trend_payload")
        .map_err(|error| error.to_string())
}

async fn fetch_json_payload(
    pool: &PgPool,
    sql: &str,
    dates: &[&str],
    column: &str,
) -> Result<Value, String> {
    let mut query = sqlx::query(sql);
    for date in dates {
        query = query.bind(*date);
    }
    let row = query
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    row.try_get::<Value, _>(column)
        .map_err(|error| error.to_string())
}

async fn fetch_rows(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    material_type: &str,
) -> Result<Value, String> {
    let row = sqlx::query(ROWS_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(material_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    row.try_get::<Value, _>("rows_payload")
        .map_err(|error| error.to_string())
}

async fn fetch_detail_row_count(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    material_type: Option<&str>,
) -> Result<usize, String> {
    let row = sqlx::query(DETAIL_ROW_COUNT_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(material_type)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let count = row
        .try_get::<i64, _>("detail_row_count")
        .map_err(|error| error.to_string())?;

    Ok(usize::try_from(count).unwrap_or(0))
}
