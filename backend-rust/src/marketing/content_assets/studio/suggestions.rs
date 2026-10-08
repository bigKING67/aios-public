//! AI 切段打标 jobs. The API only records explicit requests and reports job
//! state; the independent Python worker performs the (optionally billable)
//! model call and writes `origin=ai, status=suggested` segments. Jobs are
//! visible like segments (any signed-in content user), creation requires the
//! edit permission on every requested asset (open studio access: sign-in
//! only), and one queued/running job per (asset, preset) is reused instead of duplicated. The job's candidate label
//! subset is stored as `request_settings.labelKeys`; the worker merges its own
//! call settings into that object instead of replacing it.
use super::access::StudioAccess;
use super::domain;
use super::error::StudioResult;
use super::repository::{active_preset_labels, db_error, writable_asset};
use super::types::{
    CreateSegmentSuggestionsRequest, CreateSegmentSuggestionsResponse, SegmentPresetLabel,
    SegmentSuggestionJob, SegmentSuggestionJobListQuery, SegmentSuggestionJobListResponse,
};
use crate::{
    auth::CurrentUser,
    config::Settings,
    error::{AppError, AppResult},
};
use serde_json::{json, Value};
use sqlx::{postgres::PgRow, PgPool, Row};
use std::collections::BTreeSet;
use uuid::Uuid;

const DEFAULT_JOB_LIST_LIMIT: i64 = 20;
const MAX_JOB_LIST_LIMIT: i64 = 50;

const JOB_SELECT: &str = "SELECT j.job_id, j.owner_user_id, j.asset_id, a.title AS asset_title, j.source_content_hash, COALESCE(LOWER(TRIM(a.raw_sha256)) = j.source_content_hash, FALSE) AS source_current, j.preset_key, j.preset_version, COALESCE(j.request_settings -> 'labelKeys', (SELECT jsonb_agg(l.value -> 'key' ORDER BY l.ordinality) FROM ads.content_segment_presets p CROSS JOIN LATERAL jsonb_array_elements(p.labels) WITH ORDINALITY AS l(value, ordinality) WHERE p.preset_key = j.preset_key AND p.version = j.preset_version), '[]'::JSONB) AS label_keys, j.status, j.stage, j.attempt, j.error_code, j.error_message, j.model, j.prompt_version, j.usage, j.result_summary, j.created_at::TEXT AS created_at, j.started_at::TEXT AS started_at, j.finished_at::TEXT AS finished_at FROM ads.content_segment_suggestion_jobs j JOIN ads.marketing_content_assets a ON a.asset_id = j.asset_id";

/// Studio flag first (same 503 as every studio route), then the suggestion flag.
pub(super) fn ensure_enabled(settings: &Settings) -> AppResult<()> {
    if !settings.content_ai_studio_segment_suggest_enabled {
        return Err(AppError::ServiceUnavailable("AI 切段尚未启用".into()));
    }
    Ok(())
}

/// Sorted unique asset ids within `1..=max_assets`; duplicates are rejected so
/// the caller notices a client bug instead of silently collapsing it.
pub(super) fn validate_asset_ids(asset_ids: &[Uuid], max_assets: usize) -> AppResult<Vec<Uuid>> {
    if asset_ids.is_empty() || asset_ids.len() > max_assets {
        return Err(AppError::bad_request(format!(
            "一次可对 1–{max_assets} 条原片发起 AI 切段"
        )));
    }
    let unique: BTreeSet<Uuid> = asset_ids.iter().copied().collect();
    if unique.len() != asset_ids.len() {
        return Err(AppError::bad_request("原片列表包含重复项"));
    }
    Ok(unique.into_iter().collect())
}

/// Omitted → every preset label. Present → non-empty, unique, known keys,
/// returned in preset order so equal subsets compare equal.
pub(super) fn normalize_label_keys(
    requested: Option<&[String]>,
    labels: &[SegmentPresetLabel],
) -> AppResult<Vec<String>> {
    let preset_keys = labels.iter().map(|label| label.key.clone());
    let Some(requested) = requested else {
        return Ok(preset_keys.collect());
    };
    if requested.is_empty() {
        return Err(AppError::bad_request("候选标签至少选择 1 个"));
    }
    let unique: BTreeSet<&str> = requested.iter().map(String::as_str).collect();
    if unique.len() != requested.len() {
        return Err(AppError::bad_request("候选标签包含重复项"));
    }
    if unique
        .iter()
        .any(|key| !labels.iter().any(|label| label.key == *key))
    {
        return Err(AppError::bad_request("候选标签不属于该分类预设版本"));
    }
    Ok(preset_keys
        .filter(|key| unique.contains(key.as_str()))
        .collect())
}

/// Stored label keys; anything other than an array of strings reads as empty.
fn label_keys_from_value(value: Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .into_iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

pub(super) fn job_list_limit(query: &SegmentSuggestionJobListQuery) -> AppResult<i64> {
    let limit = query.limit.unwrap_or(DEFAULT_JOB_LIST_LIMIT);
    if !(1..=MAX_JOB_LIST_LIMIT).contains(&limit) {
        return Err(AppError::bad_request("limit 取值范围为 1–50"));
    }
    Ok(limit)
}

fn job_from_row(row: &PgRow) -> SegmentSuggestionJob {
    SegmentSuggestionJob {
        job_id: row.get("job_id"),
        owner_user_id: row.get("owner_user_id"),
        asset_id: row.get("asset_id"),
        asset_title: row.get("asset_title"),
        source_content_hash: row.get("source_content_hash"),
        source_current: row.get("source_current"),
        preset_key: row.get("preset_key"),
        preset_version: row.get("preset_version"),
        label_keys: label_keys_from_value(row.get("label_keys")),
        status: row.get("status"),
        stage: row.get("stage"),
        attempt: row.get("attempt"),
        error_code: row.get("error_code"),
        error_message: row.get("error_message"),
        model: row.get("model"),
        prompt_version: row.get("prompt_version"),
        usage: row.get("usage"),
        result_summary: row.get("result_summary"),
        created_at: row.get("created_at"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
    }
}

/// `enterprise_tag` scopes reads like `list_jobs` (`None` = whole library).
pub(super) async fn fetch_job(
    pool: &PgPool,
    job_id: Uuid,
    enterprise_tag: Option<&str>,
) -> StudioResult<SegmentSuggestionJob> {
    let row = sqlx::query(&format!(
        "{JOB_SELECT} WHERE j.job_id = $1 AND a.is_deleted = FALSE AND ($2::TEXT IS NULL OR $2 = ANY(a.tags))"
    ))
    .bind(job_id)
    .bind(enterprise_tag)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(AppError::NotFound)?;
    Ok(job_from_row(&row))
}

/// With `assetId`: that asset's jobs from any user (segments are shared per
/// asset). Without it: the caller's own recent jobs.
pub(super) async fn list_jobs(
    pool: &PgPool,
    user: &CurrentUser,
    query: SegmentSuggestionJobListQuery,
    enterprise_tag: Option<&str>,
) -> StudioResult<SegmentSuggestionJobListResponse> {
    let limit = job_list_limit(&query)?;
    let owner = query.asset_id.is_none().then(|| user.user_id.clone());
    let rows = sqlx::query(&format!("{JOB_SELECT} WHERE a.is_deleted = FALSE AND ($1::UUID IS NULL OR j.asset_id = $1) AND ($2::TEXT IS NULL OR j.owner_user_id = $2) AND ($4::TEXT IS NULL OR $4 = ANY(a.tags)) ORDER BY j.created_at DESC, j.job_id LIMIT $3"))
        .bind(query.asset_id).bind(owner).bind(limit).bind(enterprise_tag)
        .fetch_all(pool).await.map_err(db_error)?;
    Ok(SegmentSuggestionJobListResponse {
        items: rows.iter().map(job_from_row).collect(),
    })
}

/// All assets are validated before any job is written, so one unwritable or
/// unready asset rejects the whole request. Existing active jobs are reused.
pub(super) async fn create_jobs(
    pool: &PgPool,
    user: &CurrentUser,
    access: StudioAccess<'_>,
    max_assets: usize,
    request: CreateSegmentSuggestionsRequest,
) -> StudioResult<CreateSegmentSuggestionsResponse> {
    domain::validate_key(&request.preset_key, "presetKey")?;
    let asset_ids = validate_asset_ids(&request.asset_ids, max_assets)?;
    let mut hashes = Vec::with_capacity(asset_ids.len());
    for asset_id in &asset_ids {
        hashes.push(writable_asset(pool, user, access, *asset_id).await?.sha256);
    }
    let mut tx = pool.begin().await.map_err(db_error)?;
    let labels = active_preset_labels(&mut tx, &request.preset_key, request.preset_version).await?;
    let label_keys = normalize_label_keys(request.label_keys.as_deref(), &labels)?;
    let settings = json!({ "labelKeys": label_keys });
    let mut job_ids = Vec::with_capacity(asset_ids.len());
    let mut reused_job_ids = Vec::new();
    for (asset_id, sha256) in asset_ids.iter().zip(&hashes) {
        let inserted: Option<Uuid> = sqlx::query_scalar("INSERT INTO ads.content_segment_suggestion_jobs (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, request_settings) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (asset_id, preset_key) WHERE status IN ('queued', 'running') DO NOTHING RETURNING job_id")
            .bind(Uuid::new_v4()).bind(&user.user_id).bind(asset_id).bind(sha256)
            .bind(&request.preset_key).bind(request.preset_version).bind(&settings)
            .fetch_optional(&mut *tx).await.map_err(db_error)?;
        let job_id = match inserted {
            Some(job_id) => job_id,
            None => {
                // The active job may finish between the conflict and this read.
                let existing: Uuid = sqlx::query_scalar("SELECT job_id FROM ads.content_segment_suggestion_jobs WHERE asset_id = $1 AND preset_key = $2 AND status IN ('queued', 'running')")
                    .bind(asset_id).bind(&request.preset_key)
                    .fetch_optional(&mut *tx).await.map_err(db_error)?
                    .ok_or_else(|| AppError::Conflict("切段任务状态刚刚变化，请刷新后重试".into()))?;
                reused_job_ids.push(existing);
                existing
            }
        };
        job_ids.push(job_id);
    }
    tx.commit().await.map_err(db_error)?;
    let mut items = Vec::with_capacity(job_ids.len());
    for job_id in job_ids {
        // Jobs were just created on admitted (in-scope) originals.
        items.push(fetch_job(pool, job_id, None).await?);
    }
    // Reused jobs keep their own candidate labels; report the difference.
    let label_key_mismatch_job_ids = items
        .iter()
        .filter(|job| reused_job_ids.contains(&job.job_id) && job.label_keys != label_keys)
        .map(|job| job.job_id)
        .collect();
    Ok(CreateSegmentSuggestionsResponse {
        items,
        reused_job_ids,
        label_key_mismatch_job_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(n: u128) -> Uuid {
        Uuid::from_u128(n)
    }

    #[test]
    fn asset_ids_are_bounded_unique_and_sorted() {
        assert!(validate_asset_ids(&[], 5).is_err());
        assert!(validate_asset_ids(&[id(1); 2], 5).is_err());
        assert!(validate_asset_ids(&[id(1), id(2), id(3)], 2).is_err());
        assert_eq!(
            validate_asset_ids(&[id(3), id(1)], 5).unwrap(),
            vec![id(1), id(3)]
        );
    }

    fn labels(keys: &[&str]) -> Vec<SegmentPresetLabel> {
        keys.iter()
            .map(|key| SegmentPresetLabel {
                key: (*key).into(),
                name: key.to_uppercase(),
                definition: String::new(),
                min_duration_sec: None,
            })
            .collect()
    }

    fn keys(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn label_keys_default_to_preset_and_normalize_to_preset_order() {
        let preset = labels(&["a", "b", "c", "koc"]);
        assert_eq!(
            normalize_label_keys(None, &preset).unwrap(),
            keys(&["a", "b", "c", "koc"])
        );
        assert_eq!(
            normalize_label_keys(Some(&keys(&["c", "a"])), &preset).unwrap(),
            keys(&["a", "c"])
        );
        for bad in [
            keys(&[]),
            keys(&["a", "a"]),
            keys(&["a", "x"]),
            keys(&["A"]),
        ] {
            assert!(matches!(
                normalize_label_keys(Some(&bad), &preset),
                Err(AppError::BadRequest(_))
            ));
        }
    }

    #[test]
    fn stored_label_keys_ignore_malformed_values() {
        assert_eq!(
            label_keys_from_value(json!(["a", 1, "b"])),
            keys(&["a", "b"])
        );
        assert!(label_keys_from_value(json!({"a": 1})).is_empty());
    }

    #[test]
    fn job_list_limit_bounds() {
        let mut query = SegmentSuggestionJobListQuery::default();
        assert_eq!(job_list_limit(&query).unwrap(), DEFAULT_JOB_LIST_LIMIT);
        query.limit = Some(0);
        assert!(job_list_limit(&query).is_err());
        query.limit = Some(51);
        assert!(job_list_limit(&query).is_err());
        query.limit = Some(50);
        assert!(job_list_limit(&query).is_ok());
    }

    #[test]
    fn suggestion_flag_is_required() {
        let mut settings =
            super::super::super::handlers::qianchuan_http_route_tests::fixture_settings(
                "postgres://fixture".into(),
            );
        assert!(matches!(
            ensure_enabled(&settings),
            Err(AppError::ServiceUnavailable(_))
        ));
        settings.content_ai_studio_segment_suggest_enabled = true;
        assert!(ensure_enabled(&settings).is_ok());
    }
}
