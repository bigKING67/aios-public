//! Search existing raw-video analysis segments; these are model descriptions, not verified shots.
use super::super::{
    delivery::build_object_read_url, permissions::can_edit_content_asset_owner_scope,
};
use super::{repository::db_error, types::SearchQuery};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualHit {
    asset_id: Uuid,
    title: String,
    analysis_result_id: Uuid,
    start_ms: u32,
    end_ms: u32,
    text: String,
    purpose: String,
    model: String,
    can_use: bool,
    playback_url: String,
}

// The legacy schema promises HH:MM:SS. Never guess units, proxy offsets or missing endpoints.
fn timestamp(value: &Value) -> Option<u32> {
    let s = value.as_str()?;
    let bytes = s.as_bytes();
    if bytes.len() != 8 || bytes[2] != b':' || bytes[5] != b':' {
        return None;
    }
    if bytes
        .iter()
        .enumerate()
        .any(|(i, c)| i != 2 && i != 5 && !c.is_ascii_digit())
    {
        return None;
    }
    let h = s[0..2].parse::<u32>().ok()?;
    let m = s[3..5].parse::<u32>().ok()?;
    let sec = s[6..8].parse::<u32>().ok()?;
    (m < 60 && sec < 60).then_some((h * 3600 + m * 60 + sec) * 1000)
}
fn segment(item: &Value, duration: f64) -> Option<(u32, u32, String, String)> {
    let start = timestamp(&item["start_time"])?;
    let end = timestamp(&item["end_time"])?;
    if !duration.is_finite()
        || end <= start
        || f64::from(end) > duration * 1000.0
        || end > 1_800_000
    {
        return None;
    }
    let text = item["visual"].as_str()?.trim();
    if text.is_empty() || text.chars().count() > 1000 {
        return None;
    }
    let purpose = item["purpose"].as_str().unwrap_or("").trim();
    if purpose.chars().count() > 500 {
        return None;
    }
    Some((start, end, text.to_string(), purpose.to_string()))
}

pub(super) async fn search(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, false)?;
    let q = query.q.trim();
    if q.is_empty() || q.chars().count() > 100 {
        return Err(AppError::bad_request("请输入 1–100 个字符的画面关键词"));
    }
    let available:bool=sqlx::query_scalar("SELECT to_regclass('ads.marketing_content_asset_video_understanding_results') IS NOT NULL AND to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL").fetch_one(&state.pool).await.map_err(db_error)?;
    if !available {
        return Err(AppError::ServiceUnavailable(
            "视频分析结果库尚未就绪".into(),
        ));
    }
    let rows=sqlx::query(r#"
        SELECT a.asset_id,a.title,a.owner_user_id,a.uploaded_by_user_id,a.raw_object_key,
          a.duration_seconds::FLOAT8 AS duration_seconds,r.result_id,r.model_name,r.result_json->'analysis'->'timeline' AS timeline
        FROM ads.marketing_content_assets a
        JOIN LATERAL (
          SELECT r.result_id,r.model_name,r.result_json FROM ads.marketing_content_asset_video_understanding_results r
          WHERE r.asset_id=a.asset_id AND LOWER(r.media_hash)=LOWER(a.raw_sha256)
            AND r.result_json->'inputSnapshot'->>'modelInputRole'='raw'
            AND r.result_json->'inputSnapshot'->>'modelInputObjectKey'=a.raw_object_key
            AND EXISTS (
              SELECT 1 FROM ads.marketing_content_asset_video_understanding_jobs j
              WHERE j.asset_id=r.asset_id AND j.media_hash=r.media_hash AND j.model_name=r.model_name
                AND j.prompt_version=r.prompt_version AND j.analysis_schema_version=r.analysis_schema_version
                AND j.input_snapshot_hash=r.input_snapshot_hash AND j.cache_key=r.cache_key
                AND j.status='succeeded' AND j.storage_key=a.raw_object_key
            )
          ORDER BY r.updated_at DESC,r.result_id LIMIT 1
        ) r ON TRUE
        WHERE a.asset_status='ready' AND NOT a.external_only AND a.bucket=$2
          AND LENGTH(a.raw_sha256)=64 AND a.raw_sha256 ~ '^[0-9a-fA-F]{64}$'
          AND STRPOS(LOWER((r.result_json->'analysis'->'timeline')::TEXT),LOWER($1))>0
        ORDER BY a.updated_at DESC,a.asset_id LIMIT 100
    "#).bind(q).bind(&state.settings.tos_bucket).fetch_all(&state.pool).await.map_err(db_error)?;
    let mut hits = Vec::new();
    let needle = q.to_lowercase();
    for row in rows {
        let timeline: Value = row.get("timeline");
        let Some(items) = timeline.as_array() else {
            continue;
        };
        let Some(duration) = row.get::<Option<f64>, _>("duration_seconds") else {
            continue;
        };
        let can_use = can_edit_content_asset_owner_scope(
            &user,
            row.get::<Option<String>, _>("owner_user_id").as_deref(),
            row.get::<Option<String>, _>("uploaded_by_user_id")
                .as_deref(),
            "ready",
        );
        for item in items.iter().take(100) {
            let Some((start_ms, end_ms, text, purpose)) = segment(item, duration) else {
                continue;
            };
            if !text.to_lowercase().contains(&needle) && !purpose.to_lowercase().contains(&needle) {
                continue;
            }
            hits.push(VisualHit {
                asset_id: row.get("asset_id"),
                title: row.get("title"),
                analysis_result_id: row.get("result_id"),
                start_ms,
                end_ms,
                text,
                purpose,
                model: row.get("model_name"),
                can_use,
                playback_url: build_object_read_url(
                    &state.settings,
                    &row.get::<String, _>("raw_object_key"),
                )?,
            });
            if hits.len() == 50 {
                break;
            }
        }
        if hits.len() == 50 {
            break;
        }
    }
    Ok(Json(
        json!({"items":hits,"basis":"raw-video-analysis","notice":"仅检索直接分析当前原片的关键段落；模型描述和切点需试听核对，不是逐镜头索引。"}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_ambiguous_times_and_invalid_ranges() {
        for s in ["1:02", "00:60:00", "00:00:01.5", "-1:00:00", "１２:00:00"] {
            assert!(timestamp(&json!(s)).is_none());
        }
        assert_eq!(timestamp(&json!("00:01:02")), Some(62000));
        let mut v = json!({"start_time":"00:00:01","end_time":"00:00:04","visual":"手持产品特写","purpose":"展示"});
        assert!(segment(&v, 3.9).is_none());
        assert!(segment(&v, f64::NAN).is_none());
        assert_eq!(segment(&v, 4.0).unwrap().0, 1000);
        v["end_time"] = json!("00:00:01");
        assert!(segment(&v, 4.0).is_none());
        v["end_time"] = json!("00:00:04");
        v["visual"] = json!("");
        assert!(segment(&v, 4.0).is_none());
    }
}
