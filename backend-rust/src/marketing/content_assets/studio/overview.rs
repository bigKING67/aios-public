//! AI 创作中心首页总览: estimated model-analysis and cloud-composition spend,
//! pipeline counts and recent work in one read. Costs are estimates from the
//! usage each job recorded and the published list prices below; they ignore
//! resource-package deductions and are not a bill.
//!
//! Prices (verified 2026-09-30):
//! - 火山方舟模型价格 · 在线推理（常规） doubao-seed-2.1-lite, input ≤1024k:
//!   input 0.80 / audio input 12.00 / cache hit 0.16 / output 2.70 CNY per million tokens.
//! - AI MediaKit 剪辑工具计费: 0.01 CNY per output minute × resolution coefficient.
use super::access::batch_in_enterprise_sql;
use super::error::StudioResult;
use super::overview_types::{
    StudioCloudCompositionCost, StudioModelAnalysisCost, StudioModelPricing,
    StudioOverviewActivity, StudioOverviewCosts, StudioOverviewPeriod, StudioOverviewPipeline,
    StudioOverviewQuery, StudioOverviewResponse, StudioResolutionUsage,
};
use super::repository::db_error;
use crate::error::AppError;
use sqlx::{PgPool, Row};

const VERIFIED_ON: &str = "2026-09-30";
/// Enterprise scope (`$2`) of a suggestion job `j`: its original carries the tag.
const JOB_IN_SCOPE: &str =
    "($2::TEXT IS NULL OR EXISTS (SELECT 1 FROM ads.marketing_content_assets sa \
     WHERE sa.asset_id = j.asset_id AND $2 = ANY(sa.tags)))";
const PRICED_MODEL_PREFIX: &str = "doubao-seed-2-1-lite";
const INPUT_PER_MILLION: f64 = 0.80;
const AUDIO_INPUT_PER_MILLION: f64 = 12.00;
const CACHED_PER_MILLION: f64 = 0.16;
const OUTPUT_PER_MILLION: f64 = 2.70;
const MEDIAKIT_BASE_PER_MINUTE: f64 = 0.01;
const MEDIAKIT_ENGINE: &str = "mediakit/multi-track-edit";
const RECENT_LIMIT: i64 = 8;

/// Billing coefficient by output resolution tier (short side); unknown tiers use 1080p.
pub(super) fn resolution_coefficient(resolution: &str) -> f64 {
    match resolution.to_ascii_lowercase().as_str() {
        "4k" => 24.0,
        "2k" => 12.0,
        "720p" => 3.0,
        "540p" => 2.0,
        "480p" => 1.5,
        "360p" | "240p" => 1.0,
        _ => 6.0,
    }
}

/// Non-audio, non-cached input is billed at the base input price.
pub(super) fn model_cost_cny(input: i64, audio: i64, cached: i64, output: i64) -> f64 {
    let plain = (input - audio - cached).max(0) as f64;
    (plain * INPUT_PER_MILLION
        + audio as f64 * AUDIO_INPUT_PER_MILLION
        + cached as f64 * CACHED_PER_MILLION
        + output as f64 * OUTPUT_PER_MILLION)
        / 1_000_000.0
}

fn round_cny(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn period_start_sql(period: &str) -> Result<&'static str, AppError> {
    Ok(match period {
        "last7" => "NOW() - INTERVAL '7 days'",
        "last30" => "NOW() - INTERVAL '30 days'",
        "month" => {
            "(DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')"
        }
        _ => return Err(AppError::bad_request("period 只支持 last7、last30、month")),
    })
}

pub(super) async fn overview(
    pool: &PgPool,
    query: StudioOverviewQuery,
    owner: Option<&str>,
    enterprise_tag: Option<&str>,
) -> StudioResult<StudioOverviewResponse> {
    let key = query.period.unwrap_or_else(|| "last30".to_string());
    let batch_in_scope = batch_in_enterprise_sql(2);
    let start = period_start_sql(&key)?;
    let period = sqlx::query(&format!(
        "SELECT TO_CHAR(({start}) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS from_at, \
                TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS to_at"
    ))
    .fetch_one(pool)
    .await
    .map_err(db_error)?;

    let model = sqlx::query(&format!(
        "SELECT COUNT(*) AS calls, \
                COALESCE(SUM((usage->>'input_tokens')::BIGINT), 0)::BIGINT AS input_tokens, \
                COALESCE(SUM((usage->'input_tokens_details'->>'audio_tokens')::BIGINT), 0)::BIGINT AS audio_tokens, \
                COALESCE(SUM((usage->'input_tokens_details'->>'cached_tokens')::BIGINT), 0)::BIGINT AS cached_tokens, \
                COALESCE(SUM((usage->>'output_tokens')::BIGINT), 0)::BIGINT AS output_tokens, \
                COUNT(*) FILTER (WHERE model IS NULL OR model NOT LIKE '{PRICED_MODEL_PREFIX}%') AS unpriced \
         FROM ads.content_segment_suggestion_jobs j \
         WHERE created_at >= {start} AND usage ? 'input_tokens' AND ($1::TEXT IS NULL OR owner_user_id = $1) \
           AND {JOB_IN_SCOPE}"
    ))
    .bind(owner)
    .bind(enterprise_tag)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    // Price only the calls on the priced model; others still count their tokens.
    let priced = sqlx::query(&format!(
        "SELECT COALESCE(SUM((usage->>'input_tokens')::BIGINT), 0)::BIGINT AS input_tokens, \
                COALESCE(SUM((usage->'input_tokens_details'->>'audio_tokens')::BIGINT), 0)::BIGINT AS audio_tokens, \
                COALESCE(SUM((usage->'input_tokens_details'->>'cached_tokens')::BIGINT), 0)::BIGINT AS cached_tokens, \
                COALESCE(SUM((usage->>'output_tokens')::BIGINT), 0)::BIGINT AS output_tokens \
         FROM ads.content_segment_suggestion_jobs j \
         WHERE created_at >= {start} AND usage ? 'input_tokens' AND model LIKE '{PRICED_MODEL_PREFIX}%' \
           AND ($1::TEXT IS NULL OR owner_user_id = $1) AND {JOB_IN_SCOPE}"
    ))
    .bind(owner)
    .bind(enterprise_tag)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    let model_cny = round_cny(model_cost_cny(
        priced.get("input_tokens"),
        priced.get("audio_tokens"),
        priced.get("cached_tokens"),
        priced.get("output_tokens"),
    ));

    let composition_rows = sqlx::query(&format!(
        "SELECT COALESCE(j.receipt->'mediakit'->>'resultResolution', 'unknown') AS resolution, \
                COUNT(*) AS tasks, \
                COALESCE(SUM((j.receipt->'mediakit'->>'resultDurationSeconds')::DOUBLE PRECISION), 0) AS seconds \
         FROM ads.content_production_jobs j \
         JOIN ads.content_production_run_renders l ON l.job_id = j.job_id \
         JOIN ads.content_remix_batch_runs br ON br.run_id = l.run_id \
         JOIN ads.content_remix_batches b ON b.batch_id = br.batch_id \
         WHERE j.receipt->>'engine' = '{MEDIAKIT_ENGINE}' AND j.finished_at >= {start} \
           AND ($1::TEXT IS NULL OR b.owner_user_id = $1) AND {batch_in_scope} \
         GROUP BY 1 ORDER BY 1"
    ))
    .bind(owner)
    .bind(enterprise_tag)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    let mut tasks = 0;
    let mut output_seconds = 0.0;
    let mut composition_cny = 0.0;
    let by_resolution = composition_rows
        .iter()
        .map(|row| {
            let resolution: String = row.get("resolution");
            let seconds: f64 = row.get("seconds");
            let coefficient = resolution_coefficient(&resolution);
            let cny = seconds / 60.0 * coefficient * MEDIAKIT_BASE_PER_MINUTE;
            tasks += row.get::<i64, _>("tasks");
            output_seconds += seconds;
            composition_cny += cny;
            StudioResolutionUsage {
                resolution,
                seconds: (seconds * 10.0).round() / 10.0,
                coefficient,
                estimated_cny: round_cny(cny),
            }
        })
        .collect();

    let pipeline = sqlx::query(&format!(
        "SELECT \
           (SELECT COUNT(*) FROM ads.marketing_content_assets \
              WHERE is_deleted = FALSE AND asset_status = 'ready' \
                AND source_type IS DISTINCT FROM 'ai_studio_output' \
                AND ($2::TEXT IS NULL OR $2 = ANY(tags))) AS ready_assets, \
           (SELECT COUNT(*) FROM ads.content_segment_suggestion_jobs j \
              WHERE status IN ('queued', 'running') AND ($1::TEXT IS NULL OR owner_user_id = $1) \
                AND {JOB_IN_SCOPE}) AS analysis_active, \
           (SELECT COUNT(*) FROM ads.content_segment_suggestion_jobs j \
              WHERE status = 'succeeded' AND created_at >= {start} AND ($1::TEXT IS NULL OR owner_user_id = $1) \
                AND {JOB_IN_SCOPE}) AS analysis_succeeded, \
           (SELECT COUNT(*) FROM ads.content_segment_suggestion_jobs j \
              WHERE status = 'failed' AND created_at >= {start} AND ($1::TEXT IS NULL OR owner_user_id = $1) \
                AND {JOB_IN_SCOPE}) AS analysis_failed, \
           (SELECT COUNT(*) FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id \
              WHERE s.status = 'suggested' AND a.is_deleted = FALSE \
                AND LOWER(TRIM(a.raw_sha256)) = s.source_content_hash \
                AND ($2::TEXT IS NULL OR $2 = ANY(a.tags))) AS segments_suggested, \
           (SELECT COUNT(*) FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id \
              WHERE s.status = 'confirmed' AND a.is_deleted = FALSE \
                AND LOWER(TRIM(a.raw_sha256)) = s.source_content_hash \
                AND ($2::TEXT IS NULL OR $2 = ANY(a.tags))) AS segments_confirmed, \
           (SELECT COUNT(*) FROM ads.content_remix_batches b \
              WHERE status = 'running' AND ($1::TEXT IS NULL OR owner_user_id = $1) \
                AND {batch_in_scope}) AS remix_running, \
           (SELECT COUNT(*) FROM ads.content_remix_batches b \
              WHERE status IN ('failed', 'partially_failed') AND created_at >= {start} \
                AND ($1::TEXT IS NULL OR owner_user_id = $1) AND {batch_in_scope}) AS remix_failed, \
           (SELECT COUNT(*) FROM ads.marketing_content_assets \
              WHERE is_deleted = FALSE AND source_type = 'ai_studio_output' AND created_at >= {start} \
                AND ($2::TEXT IS NULL OR $2 = ANY(tags))) AS outputs"
    ))
    .bind(owner)
    .bind(enterprise_tag)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;

    let recent = sqlx::query(&format!(
        "SELECT * FROM ( \
           SELECT 'analysis' AS kind, j.job_id AS id, COALESCE(a.title, '已删除的素材') AS title, j.status, \
                  j.error_code AS detail, j.created_at \
           FROM ads.content_segment_suggestion_jobs j \
           LEFT JOIN ads.marketing_content_assets a ON a.asset_id = j.asset_id \
           WHERE ($1::TEXT IS NULL OR j.owner_user_id = $1) AND {JOB_IN_SCOPE} \
           UNION ALL \
           SELECT CASE WHEN b.structure->>'mode' = 'edit' THEN 'edit' ELSE 'remix' END, b.batch_id, COALESCE(NULLIF(b.constraints->>'productName', ''), '框架混剪'), b.status, \
                  b.planned_count::TEXT || ' 条', b.created_at \
           FROM ads.content_remix_batches b \
           WHERE ($1::TEXT IS NULL OR b.owner_user_id = $1) AND {batch_in_scope} \
         ) recent ORDER BY created_at DESC LIMIT $3"
    ))
    .bind(owner)
    .bind(enterprise_tag)
    .bind(RECENT_LIMIT)
    .fetch_all(pool)
    .await
    .map_err(db_error)?
    .iter()
    .map(|row| StudioOverviewActivity {
        kind: row.get("kind"),
        id: row.get("id"),
        title: row.get("title"),
        status: row.get("status"),
        detail: row.get("detail"),
        created_at: row.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
    })
    .collect();

    let composition_cny = round_cny(composition_cny);
    Ok(StudioOverviewResponse {
        period: StudioOverviewPeriod {
            key,
            from: period.get("from_at"),
            to: period.get("to_at"),
        },
        costs: StudioOverviewCosts {
            model_analysis: StudioModelAnalysisCost {
                calls: model.get("calls"),
                input_tokens: model.get("input_tokens"),
                audio_input_tokens: model.get("audio_tokens"),
                cached_tokens: model.get("cached_tokens"),
                output_tokens: model.get("output_tokens"),
                estimated_cny: model_cny,
                unpriced_calls: model.get("unpriced"),
                pricing: StudioModelPricing {
                    model: "doubao-seed-2.1-lite".to_string(),
                    tier: "在线推理（常规）".to_string(),
                    input_per_million: INPUT_PER_MILLION,
                    audio_input_per_million: AUDIO_INPUT_PER_MILLION,
                    cached_per_million: CACHED_PER_MILLION,
                    output_per_million: OUTPUT_PER_MILLION,
                    verified_on: VERIFIED_ON.to_string(),
                },
            },
            cloud_composition: StudioCloudCompositionCost {
                tasks,
                output_seconds: (output_seconds * 10.0).round() / 10.0,
                by_resolution,
                estimated_cny: composition_cny,
                base_per_minute: MEDIAKIT_BASE_PER_MINUTE,
                verified_on: VERIFIED_ON.to_string(),
            },
            total_cny: round_cny(model_cny + composition_cny),
        },
        pipeline: StudioOverviewPipeline {
            ready_assets: pipeline.get("ready_assets"),
            analysis_active: pipeline.get("analysis_active"),
            analysis_succeeded: pipeline.get("analysis_succeeded"),
            analysis_failed: pipeline.get("analysis_failed"),
            segments_suggested: pipeline.get("segments_suggested"),
            segments_confirmed: pipeline.get("segments_confirmed"),
            remix_batches_running: pipeline.get("remix_running"),
            remix_batches_failed: pipeline.get("remix_failed"),
            outputs: pipeline.get("outputs"),
        },
        recent,
        scope: if owner.is_some() { "own" } else { "team" }.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_cost_prices_audio_and_cache_separately() {
        // One 3-minute AI 切段 call: 42173 input (862 audio), 410 output.
        let cny = model_cost_cny(42_173, 862, 0, 410);
        let expected = (41_311.0 * 0.80 + 862.0 * 12.0 + 410.0 * 2.70) / 1e6;
        assert!((cny - expected).abs() < 1e-12);
        assert!((model_cost_cny(1_000_000, 0, 1_000_000, 0) - 0.16).abs() < 1e-12);
        assert_eq!(model_cost_cny(10, 20, 0, 0), 20.0 * 12.0 / 1e6);
    }

    #[test]
    fn resolution_coefficients_follow_the_published_table() {
        assert_eq!(resolution_coefficient("1080p"), 6.0);
        assert_eq!(resolution_coefficient("720P"), 3.0);
        assert_eq!(resolution_coefficient("540p"), 2.0);
        assert_eq!(resolution_coefficient("4k"), 24.0);
        assert_eq!(resolution_coefficient("unknown"), 6.0);
    }

    #[test]
    fn unknown_period_is_rejected() {
        assert!(period_start_sql("last30").is_ok());
        assert!(period_start_sql("month").is_ok());
        assert!(period_start_sql("year").is_err());
    }
}
