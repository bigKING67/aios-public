use super::super::{
    delivery::build_object_read_url, permissions::can_edit_content_asset_owner_scope,
};
use super::{domain::segment, repository::db_error, types::ClipHit};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::Value;
use sqlx::Row;

pub(super) async fn search(
    state: &AppState,
    user: &CurrentUser,
    q: &str,
) -> AppResult<Vec<ClipHit>> {
    search_scoped(state, user, q, &[]).await
}

pub(super) async fn search_scoped(
    state: &AppState,
    user: &CurrentUser,
    q: &str,
    asset_ids: &[uuid::Uuid],
) -> AppResult<Vec<ClipHit>> {
    let q = q.trim();
    if q.is_empty() || q.chars().count() > 100 {
        return Err(AppError::bad_request("请输入 1–100 个字符的台词或素材名称"));
    }
    search_candidates(state, user, q, asset_ids, None).await
}

pub(super) async fn planning_candidates(
    state: &AppState,
    user: &CurrentUser,
    asset_ids: &[uuid::Uuid],
) -> AppResult<Vec<ClipHit>> {
    if asset_ids.is_empty() || asset_ids.len() > 10 {
        return Err(AppError::bad_request("规划需要明确的素材范围"));
    }
    search_candidates(state, user, "", asset_ids, None).await
}

/// Narration is a continuous excerpt, not the ordinary 30-candidate sample.
pub(super) async fn narration_candidates(
    state: &AppState,
    user: &CurrentUser,
    asset_id: uuid::Uuid,
    end_ms: u32,
) -> AppResult<Vec<ClipHit>> {
    if !(3000..=120_000).contains(&end_ms) {
        return Err(AppError::bad_request("主讲范围超限"));
    }
    search_candidates(state, user, "", &[asset_id], Some(end_ms)).await
}

async fn search_candidates(
    state: &AppState,
    user: &CurrentUser,
    q: &str,
    asset_ids: &[uuid::Uuid],
    narration_end_ms: Option<u32>,
) -> AppResult<Vec<ClipHit>> {
    let rows=sqlx::query(r#"
        SELECT a.asset_id,a.title,a.owner_user_id,a.uploaded_by_user_id,a.asset_status,a.raw_object_key,
          a.duration_seconds::FLOAT8 AS duration_seconds,t.transcript_id,t.segments
        FROM ads.marketing_content_assets a
        JOIN LATERAL (
          SELECT transcript_id,segments,transcript_text FROM ads.marketing_content_asset_transcripts
          WHERE asset_id=a.asset_id AND status='active' AND source_object_key=a.raw_object_key
          ORDER BY created_at DESC LIMIT 1
        ) t ON TRUE
        WHERE a.asset_status='ready' AND NOT a.external_only
          AND (cardinality($2::uuid[]) = 0 OR a.asset_id = ANY($2))
          AND (STRPOS(LOWER(t.transcript_text),LOWER($1))>0 OR STRPOS(LOWER(a.title),LOWER($1))>0)
        ORDER BY a.updated_at DESC,a.asset_id LIMIT 100
    "#).bind(q).bind(asset_ids).fetch_all(&state.pool).await.map_err(db_error)?;
    let needle = q.to_lowercase();
    let mut hits = Vec::new();
    let planning = q.is_empty() && !asset_ids.is_empty();
    for row in rows {
        let segments: Value = row.get("segments");
        let Some(items) = segments.as_array() else {
            continue;
        };
        if narration_end_ms.is_some() && items.len() > 5000 {
            return Err(AppError::bad_request("主讲台词分段超限，请重新分析"));
        }
        let title: String = row.get("title");
        let can_use = can_edit_content_asset_owner_scope(
            user,
            row.get::<Option<String>, _>("owner_user_id").as_deref(),
            row.get::<Option<String>, _>("uploaded_by_user_id")
                .as_deref(),
            "ready",
        );
        let mut asset_hits = 0;
        for item in items.iter().take(5000) {
            let Some((start_ms, end_ms, text)) = segment(item) else {
                continue;
            };
            // Keep a segment crossing the endpoint so the caller can reject a cut sentence.
            if narration_end_ms.is_some_and(|end| start_ms >= end) {
                continue;
            }
            let duration: Option<f64> = row.get("duration_seconds");
            if !duration.is_some_and(|d| d.is_finite() && f64::from(end_ms) <= d * 1000.0) {
                continue;
            }
            if !text.to_lowercase().contains(&needle) && !title.to_lowercase().contains(&needle) {
                continue;
            }
            hits.push(ClipHit {
                asset_id: row.get("asset_id"),
                title: title.clone(),
                transcript_id: row.get("transcript_id"),
                start_ms,
                end_ms,
                text,
                can_use,
                playback_url: build_object_read_url(
                    &state.settings,
                    &row.get::<String, _>("raw_object_key"),
                )?,
            });
            asset_hits += 1;
            if narration_end_ms.is_some() && asset_hits > 500 {
                return Err(AppError::bad_request(
                    "主讲范围内台词超过 500 段，请缩短范围",
                ));
            }
            if planning && narration_end_ms.is_none() && asset_hits == 30 {
                break;
            }
            if !planning && hits.len() == 50 {
                return Ok(hits);
            }
        }
    }
    Ok(hits)
}
