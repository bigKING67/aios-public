//! 竞品爆款：链接型竞品视频与单条拆解（卡 A）排队。
//!
//! Competitor videos live in schema `competitor`, apart from the asset library, so
//! remix pools and the segment library never see them. Requesting an analysis
//! downloads the original through the asset import path (dtk → detail → page) and
//! stages it at `competitor/raw/{aweme_id}.mp4`; the worker
//! (`content_production.competitor_analysis.worker`) verifies the staged hash,
//! runs card A, stores evidence and deletes the staged original.

use std::{sync::Arc, time::Duration};

use serde_json::Value;
use sqlx::{postgres::PgRow, PgPool, Row};
use tracing::warn;
use uuid::Uuid;

use super::{
    competitor_overview::opening_frame,
    competitor_types::{CompetitorAnalysis, CompetitorAnalysisSummary, CompetitorVideo},
    error::StudioResult,
    repository::db_error,
};
use crate::{
    auth::CurrentUser,
    config::Settings,
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    delivery::{build_object_read_url, build_upload_url},
    douyin_video_link::{VideoLinkPreviewCandidate, VideoLinkSourceType},
    douyin_video_source::is_douyin_video_not_found,
    video_link_import::{
        download_remote_video, resolve_video_link_import_source, upload_downloaded_video_to_tos,
    },
};

pub(super) const VIDEO_SELECT: &str = "SELECT v.aweme_id, v.share_url, v.title, v.author_name, v.brand_name, \
    v.product_category, \
    COALESCE(v.manual_added_at, CASE WHEN v.source = 'manual' THEN v.first_seen_at END)::TEXT AS manual_added_at, \
    EXISTS(SELECT 1 FROM competitor.compass_traffic_videos_daily t WHERE t.aweme_id = v.aweme_id) AS has_compass, \
    v.duration_seconds::FLOAT8 AS duration_seconds, v.availability, v.source, v.notes, \
    v.first_seen_at::TEXT AS first_seen_at, v.last_resolved_at::TEXT AS last_resolved_at, \
    a.analysis_id, a.status AS analysis_status, \
    COALESCE(a.status = 'succeeded' AND a.card -> 'framework' ->> 'status' = 'ok' \
      AND NOT (a.card -> 'framework' ?| ARRAY['transcriptError', 'sellingPointError']), FALSE) AS analysis_complete, a.cost_yuan::FLOAT8 AS analysis_cost_yuan, \
    a.created_at::TEXT AS analysis_created_at, a.finished_at::TEXT AS analysis_finished_at, \
    (SELECT f.evidence_objects FROM competitor.analyses f WHERE f.aweme_id = v.aweme_id \
     AND f.evidence_objects <> '[]'::JSONB ORDER BY f.created_at DESC LIMIT 1) AS cover_evidence \
    FROM competitor.videos v LEFT JOIN LATERAL (SELECT * FROM competitor.analyses x \
    WHERE x.aweme_id = v.aweme_id ORDER BY x.created_at DESC LIMIT 1) a ON TRUE";

const ANALYSIS_SELECT: &str = "SELECT analysis_id, aweme_id, status, model_id, prompt_version, \
    taxonomy_version, card, host_errors, evidence_objects, cost_yuan::FLOAT8 AS cost_yuan, error_code, \
    error_message, created_at::TEXT AS created_at, started_at::TEXT AS started_at, \
    finished_at::TEXT AS finished_at FROM competitor.analyses";

pub(super) fn raw_object_key(aweme_id: &str) -> String {
    format!("competitor/raw/{aweme_id}.mp4")
}

pub(super) fn valid_aweme_id(value: &str) -> bool {
    (6..=32).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit())
}

pub(super) fn optional_text(
    value: Option<String>,
    field: &str,
    max_chars: usize,
) -> AppResult<Option<String>> {
    let Some(value) = value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
    else {
        return Ok(None);
    };
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(AppError::bad_request(format!(
            "{field} 最多 {max_chars} 个字符，且不能含控制字符"
        )));
    }
    Ok(Some(value))
}

/// `settings` resolves the cover URL; existence checks pass `None`. A cover whose URL cannot be
/// built is left out rather than failing the read.
pub(super) fn video_from_row(row: &PgRow, settings: Option<&Settings>) -> CompetitorVideo {
    let latest_analysis = row
        .get::<Option<Uuid>, _>("analysis_id")
        .map(|analysis_id| CompetitorAnalysisSummary {
            analysis_id,
            status: row.get("analysis_status"),
            complete: row.get("analysis_complete"),
            cost_yuan: row.get("analysis_cost_yuan"),
            created_at: row.get("analysis_created_at"),
            finished_at: row.get("analysis_finished_at"),
        });
    CompetitorVideo {
        aweme_id: row.get("aweme_id"),
        share_url: row.get("share_url"),
        title: row.get("title"),
        author_name: row.get("author_name"),
        brand_name: row.get("brand_name"),
        product_category: row.get("product_category"),
        duration_seconds: row.get("duration_seconds"),
        availability: row.get("availability"),
        source: row.get("source"),
        sources: [
            (
                row.get::<String, _>("source") == "compass" || row.get::<bool, _>("has_compass"),
                "compass",
            ),
            (
                row.get::<Option<String>, _>("manual_added_at").is_some(),
                "manual",
            ),
        ]
        .into_iter()
        .filter(|(present, _)| *present)
        .map(|(_, name)| name.to_string())
        .collect(),
        manual_added_at: row.get("manual_added_at"),
        latest_ranking_date: None,
        ranking_days: 0,
        best_rank: None,
        relevant_date: None,
        add_outcome: None,
        notes: row.get("notes"),
        first_seen_at: row.get("first_seen_at"),
        last_resolved_at: row.get("last_resolved_at"),
        latest_analysis,
        cover_url: settings.and_then(|settings| {
            let evidence: Option<Value> = row.get("cover_evidence");
            let (key, _) = opening_frame(evidence.as_ref()?)?;
            build_object_read_url(settings, &key).ok()
        }),
    }
}

fn analysis_from_row(row: &PgRow) -> CompetitorAnalysis {
    CompetitorAnalysis {
        analysis_id: row.get("analysis_id"),
        aweme_id: row.get("aweme_id"),
        status: row.get("status"),
        model_id: row.get("model_id"),
        prompt_version: row.get("prompt_version"),
        taxonomy_version: row.get("taxonomy_version"),
        card: row.get("card"),
        host_errors: row.get("host_errors"),
        evidence_objects: row.get("evidence_objects"),
        cost_yuan: row.get("cost_yuan"),
        error_code: row.get("error_code"),
        error_message: row.get("error_message"),
        created_at: row.get("created_at"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
    }
}

pub(super) async fn fetch_video(
    pool: &PgPool,
    settings: Option<&Settings>,
    aweme_id: &str,
) -> StudioResult<CompetitorVideo> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "{VIDEO_SELECT} WHERE v.aweme_id = $1"
    )))
    .bind(aweme_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(AppError::NotFound)?;
    Ok(video_from_row(&row, settings))
}

async fn active_analysis(
    pool: &PgPool,
    aweme_id: &str,
) -> StudioResult<Option<CompetitorAnalysis>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "{ANALYSIS_SELECT} WHERE aweme_id = $1 AND status IN ('queued', 'running')"
    )))
    .bind(aweme_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    Ok(row.as_ref().map(analysis_from_row))
}

pub(super) async fn finished_analysis(
    pool: &PgPool,
    aweme_id: &str,
) -> StudioResult<Option<CompetitorAnalysis>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "{ANALYSIS_SELECT} WHERE aweme_id = $1 AND status = 'succeeded' \
         AND card -> 'framework' ->> 'status' = 'ok' \
         AND NOT (card -> 'framework' ?| ARRAY['transcriptError', 'sellingPointError']) \
         ORDER BY finished_at DESC NULLS LAST LIMIT 1"
    )))
    .bind(aweme_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    Ok(row.as_ref().map(analysis_from_row))
}

struct StagedVideo {
    sha256: String,
    title: Option<String>,
}

/// Download the original through the asset import path and store it at the staging key.
async fn stage_original(state: &AppState, aweme_id: &str) -> AppResult<StagedVideo> {
    let candidate = VideoLinkPreviewCandidate {
        source_type: VideoLinkSourceType::DouyinVideo,
        source_url: String::new(),
        resolved_url: String::new(),
        external_video_id: Some(aweme_id.to_string()),
        external_item_id: None,
    };
    let source = resolve_video_link_import_source(&candidate).await?;
    let video = download_remote_video(&source).await?;
    let upload = build_upload_url(
        &state.settings,
        &raw_object_key(aweme_id),
        &video.content_type,
    )?;
    upload_downloaded_video_to_tos(&state.http_client, &upload, video.bytes).await?;
    Ok(StagedVideo {
        sha256: video.sha256,
        title: source.default_title,
    })
}

/// Downloading an original from Douyin's CDN can take minutes from the VPS, longer than the
/// browser waits; staging runs after the response, bounded by this deadline.
const STAGE_DEADLINE: Duration = Duration::from_secs(600);
const STAGE_FAILED_MESSAGE: &str =
    "抖音原视频暂时无法下载，可能是作品受限、已删除或抖音风控，请稍后重新分析";
const VIDEO_REMOVED_MESSAGE: &str =
    "抖音作品不存在或已不可见（已删除、设为私密或被下架），重新分析也无法下载";

/// Queues an analysis and stages the original in the background. The row stays queued without
/// a source hash until staging finishes; the worker only claims staged rows.
pub(super) async fn request_analysis(
    state: &Arc<AppState>,
    user: &CurrentUser,
    aweme_id: &str,
) -> StudioResult<CompetitorAnalysis> {
    queue_analysis(state, &user.user_id, aweme_id).await
}

/// The one way an analysis is queued, by a person or by the 罗盘 auto queue (`competitor_auto`).
pub(super) async fn queue_analysis(
    state: &Arc<AppState>,
    requested_by: &str,
    aweme_id: &str,
) -> StudioResult<CompetitorAnalysis> {
    if !valid_aweme_id(aweme_id) {
        return Err(AppError::bad_request("抖音视频 ID 不合法").into());
    }
    let pool = &state.pool;
    fetch_video(pool, None, aweme_id).await?;
    if let Some(existing) = active_analysis(pool, aweme_id).await? {
        return Ok(existing);
    }
    // A Douyin aweme id is immutable content: a finished card with its complete framework structure
    // is reused, not paid for again. Older cards, a failed structure, or one missing its script or
    // selling points can be re-run.
    if let Some(existing) = finished_analysis(pool, aweme_id).await? {
        return Ok(existing);
    }
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO competitor.analyses (aweme_id, requested_by) VALUES ($1, $2) \
         ON CONFLICT DO NOTHING RETURNING analysis_id",
    )
    .bind(aweme_id)
    .bind(requested_by)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    let Some(analysis_id) = inserted else {
        if let Some(active) = active_analysis(pool, aweme_id).await? {
            return Ok(active);
        }
        // The database also fences one historical automatic repair even after its terminal state.
        if requested_by == super::competitor_auto::AUTO_REPAIR_REQUESTER {
            let prior: Option<Uuid> = sqlx::query_scalar(
                "SELECT analysis_id FROM competitor.analyses WHERE aweme_id=$1 AND requested_by=$2",
            )
            .bind(aweme_id)
            .bind(requested_by)
            .fetch_optional(pool)
            .await
            .map_err(db_error)?;
            if let Some(id) = prior {
                return get_analysis(pool, id).await;
            }
        }
        return Err(AppError::NotFound.into());
    };
    let task_state = Arc::clone(state);
    let task_aweme = aweme_id.to_string();
    tokio::spawn(async move { stage_in_background(&task_state, analysis_id, &task_aweme).await });
    get_analysis(pool, analysis_id).await
}

async fn stage_in_background(state: &AppState, analysis_id: Uuid, aweme_id: &str) {
    let outcome = match tokio::time::timeout(STAGE_DEADLINE, stage_original(state, aweme_id)).await
    {
        Ok(Ok(staged)) => record_staged(&state.pool, analysis_id, aweme_id, &staged).await,
        Ok(Err(error)) if is_douyin_video_not_found(&error) => {
            warn!(aweme_id, "competitor original is gone from Douyin");
            let failure = StageFailure {
                code: "video_removed",
                message: VIDEO_REMOVED_MESSAGE,
                availability: Some("removed"),
            };
            record_stage_failure(&state.pool, analysis_id, aweme_id, failure).await
        }
        Ok(Err(error)) => {
            // The import path's message suggests a manual asset upload, which does not apply here.
            warn!(?error, aweme_id, "competitor original download failed");
            let failure = StageFailure::retryable("download_failed");
            record_stage_failure(&state.pool, analysis_id, aweme_id, failure).await
        }
        Err(_) => {
            warn!(aweme_id, "competitor original download timed out");
            let failure = StageFailure::retryable("download_timeout");
            record_stage_failure(&state.pool, analysis_id, aweme_id, failure).await
        }
    };
    if let Err(error) = outcome {
        warn!(?error, aweme_id, "competitor staging result not recorded");
    }
}

async fn record_staged(
    pool: &PgPool,
    analysis_id: Uuid,
    aweme_id: &str,
    staged: &StagedVideo,
) -> StudioResult<()> {
    sqlx::query(
        "UPDATE competitor.videos SET title = COALESCE(title, $2), availability = 'available', \
         last_resolved_at = CURRENT_TIMESTAMP WHERE aweme_id = $1",
    )
    .bind(aweme_id)
    .bind(&staged.title)
    .execute(pool)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE competitor.analyses SET source_sha256 = $2 \
         WHERE analysis_id = $1 AND status = 'queued' AND source_sha256 IS NULL",
    )
    .bind(analysis_id)
    .bind(&staged.sha256)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

struct StageFailure {
    code: &'static str,
    message: &'static str,
    /// Set when Douyin settled the post's state; `None` keeps the stored value.
    availability: Option<&'static str>,
}

impl StageFailure {
    fn retryable(code: &'static str) -> Self {
        Self {
            code,
            message: STAGE_FAILED_MESSAGE,
            availability: None,
        }
    }
}

async fn record_stage_failure(
    pool: &PgPool,
    analysis_id: Uuid,
    aweme_id: &str,
    failure: StageFailure,
) -> StudioResult<()> {
    sqlx::query(
        "UPDATE competitor.videos SET availability = COALESCE($2, availability), \
         last_resolved_at = CURRENT_TIMESTAMP WHERE aweme_id = $1",
    )
    .bind(aweme_id)
    .bind(failure.availability)
    .execute(pool)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE competitor.analyses SET status = 'failed', error_code = $2, error_message = $3, \
         finished_at = CURRENT_TIMESTAMP WHERE analysis_id = $1 AND status = 'queued'",
    )
    .bind(analysis_id)
    .bind(failure.code)
    .bind(failure.message)
    .execute(pool)
    .await
    .map_err(db_error)?;
    Ok(())
}

pub(super) async fn get_analysis(
    pool: &PgPool,
    analysis_id: Uuid,
) -> StudioResult<CompetitorAnalysis> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "{ANALYSIS_SELECT} WHERE analysis_id = $1"
    )))
    .bind(analysis_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(AppError::NotFound)?;
    Ok(analysis_from_row(&row))
}

/// The analysis with a signed read URL on every evidence object (clip and frames).
pub(super) async fn get_analysis_with_evidence_urls(
    state: &AppState,
    analysis_id: Uuid,
) -> StudioResult<CompetitorAnalysis> {
    let mut analysis = get_analysis(&state.pool, analysis_id).await?;
    sign_evidence(&mut analysis.evidence_objects, |key| {
        build_object_read_url(&state.settings, key)
    })?;
    Ok(analysis)
}

/// Adds `url` to evidence objects under `competitor/evidence/`; other keys are never signed.
fn sign_evidence(evidence: &mut Value, sign: impl Fn(&str) -> AppResult<String>) -> AppResult<()> {
    let Some(items) = evidence.as_array_mut() else {
        return Ok(());
    };
    for item in items {
        let Some(key) = item
            .get("objectKey")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        if !key.starts_with("competitor/evidence/") {
            continue;
        }
        let url = sign(&key)?;
        if let Some(object) = item.as_object_mut() {
            object.insert("url".to_string(), Value::String(url));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{optional_text, raw_object_key, valid_aweme_id};

    #[test]
    fn aweme_ids_are_bounded_digit_strings() {
        assert!(valid_aweme_id("7400000000000000001"));
        assert!(!valid_aweme_id("12345"));
        assert!(!valid_aweme_id("74000000000000000x1"));
        assert!(!valid_aweme_id(&"1".repeat(33)));
    }

    #[test]
    fn only_competitor_evidence_keys_are_signed() {
        let mut evidence = serde_json::json!([
            {"kind": "clip", "objectKey": "competitor/evidence/a1/clip.mp4"},
            {"kind": "clip", "objectKey": "raw/2026/09/other-asset.mp4"},
            {"kind": "frame"},
        ]);
        super::sign_evidence(&mut evidence, |key| Ok(format!("https://signed/{key}"))).unwrap();
        assert_eq!(
            evidence[0]["url"],
            "https://signed/competitor/evidence/a1/clip.mp4"
        );
        assert!(evidence[1].get("url").is_none());
        assert!(evidence[2].get("url").is_none());
        let mut not_a_list = evidence[0].clone();
        super::sign_evidence(&mut not_a_list, |_| unreachable!()).unwrap();
    }

    #[test]
    fn staging_key_is_derived_from_the_video_id() {
        assert_eq!(
            raw_object_key("7400000000000000001"),
            "competitor/raw/7400000000000000001.mp4"
        );
    }

    #[test]
    fn optional_text_trims_and_bounds_input() {
        assert_eq!(
            optional_text(Some("  雅诗兰黛 ".into()), "brandName", 120)
                .unwrap()
                .as_deref(),
            Some("雅诗兰黛")
        );
        assert_eq!(
            optional_text(Some("   ".into()), "brandName", 120).unwrap(),
            None
        );
        assert!(optional_text(Some("x".repeat(121)), "brandName", 120).is_err());
        assert!(optional_text(Some("a\u{0007}b".into()), "notes", 500).is_err());
    }
}
