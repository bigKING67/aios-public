// SQLx 0.9 audit: Internal fragments/columns are selected by fixed callers or allowlists; request values remain bound.
//! Reads of 框架混剪批次: the owner's batches in scoped studio access, every
//! batch in open access (`owner` filter `None`). Batch and item status are
//! derived from the live Runs so pause/cancel through the Runs API is
//! reflected without a worker round trip; the stored `status` column is a summary refreshed by the
//! worker reconciliation and by batch cancel with the same rule.
use super::super::delivery::build_cover_url_for_key;
use super::access::batch_in_enterprise_sql;
use super::domain;
use super::error::StudioResult;
use super::remix_types::{
    RemixBatch, RemixBatchDetail, RemixBatchItem, RemixBatchSegment, RemixOutputReview,
    RemixProduct, RemixProductListQuery, RemixProductListResponse,
};
use super::repository::db_error;
use crate::config::Settings;
use crate::error::AppError;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{postgres::PgRow, PgPool, Row};
use std::collections::HashMap;
use uuid::Uuid;

const PRODUCT_LIST_LIMIT: i64 = 200;

/// One batch with its live counts; `created_at_ts` keeps the raw timestamp for keyset paging.
/// A review counts only for the output asset it was given for (reviews are one row per Run).
pub(super) const BATCH_SELECT: &str = "SELECT b.batch_id, b.owner_user_id, b.preset_key, b.preset_version, b.structure, b.constraints, b.requested_count, b.planned_count, b.seed, b.shortfall_reason, b.created_at::TEXT AS created_at, b.created_at AS created_at_ts, b.updated_at::TEXT AS updated_at, ARRAY(SELECT oa.cover_object_key FROM ads.content_remix_batch_runs cbr JOIN ads.marketing_content_assets oa ON oa.asset_id = cbr.output_asset_id WHERE cbr.batch_id = b.batch_id AND oa.is_deleted = FALSE AND oa.cover_object_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ads.content_remix_output_reviews crv WHERE crv.run_id=cbr.run_id AND crv.output_asset_id=cbr.output_asset_id AND crv.decision='rejected') ORDER BY cbr.ordinal LIMIT 4) AS cover_keys, (SELECT fr.waiting_reason FROM ads.content_remix_batch_runs fbr JOIN ads.content_production_runs fr ON fr.run_id = fbr.run_id WHERE fbr.batch_id = b.batch_id AND fr.waiting_reason IS NOT NULL AND fr.status NOT IN ('succeeded', 'cancelled', 'queued', 'running', 'cancelling', 'paused') ORDER BY fbr.ordinal LIMIT 1) AS failure_reason, COUNT(*) FILTER (WHERE r.status = 'succeeded') AS succeeded, COUNT(*) FILTER (WHERE r.status IN ('queued', 'running', 'cancelling', 'paused')) AS running, COUNT(*) FILTER (WHERE r.status = 'cancelled') AS cancelled, COUNT(*) AS total, COUNT(*) FILTER (WHERE r.status = 'failed' AND r.waiting_reason IN ('remix_qc_failed', 'remix_qc_incomplete', 'remix_qc_sources_changed')) AS qc_failed, COUNT(*) FILTER (WHERE r.status = 'succeeded' AND (br.output_asset_id IS NULL OR ao.asset_id IS NOT NULL) AND NOT COALESCE(rv.output_asset_id=br.output_asset_id AND rv.decision='rejected',FALSE)) AS available, COUNT(*) FILTER (WHERE r.status = 'succeeded' AND (ao.asset_id IS NOT NULL OR (rv.output_asset_id=br.output_asset_id AND rv.decision='rejected'))) AS reviewable, COUNT(*) FILTER (WHERE r.status = 'succeeded' AND ao.asset_id IS NOT NULL AND rv.output_asset_id = br.output_asset_id AND rv.decision = 'approved') AS approved, COUNT(*) FILTER (WHERE r.status = 'succeeded' AND rv.output_asset_id = br.output_asset_id AND rv.decision = 'rejected') AS rejected FROM ads.content_remix_batches b JOIN ads.content_remix_batch_runs br ON br.batch_id = b.batch_id JOIN ads.content_production_runs r ON r.run_id = br.run_id LEFT JOIN ads.marketing_content_assets ao ON ao.asset_id = br.output_asset_id AND ao.is_deleted = FALSE LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id = br.run_id WHERE ($1::TEXT IS NULL OR b.owner_user_id = $1)";

/// Run status → item outcome. Paused/queued/running/cancelling stay running
/// (a cancelling render may still be stopping); cancelled is its own outcome;
/// every other state (waiting after a failed render, failed) is failed for the
/// batch, and a failed render remains resumable.
pub(super) fn outcome(run_status: &str) -> &'static str {
    match run_status {
        "succeeded" => "succeeded",
        "queued" | "running" | "cancelling" | "paused" => "running",
        "cancelled" => "cancelled",
        _ => "failed",
    }
}

/// Batch summary; Python `remix_output.refresh_batches` applies the same rule.
/// Any live Run keeps the batch running; once every Run settled, a batch with
/// a cancelled Run is `cancelled` (succeeded outputs stay counted), otherwise
/// succeeded / failed / partially_failed by the succeeded count.
pub(super) fn batch_status(
    total: i64,
    succeeded: i64,
    running: i64,
    cancelled: i64,
) -> &'static str {
    if running > 0 {
        "running"
    } else if succeeded == total {
        "succeeded"
    } else if cancelled > 0 {
        "cancelled"
    } else if succeeded == 0 {
        "failed"
    } else {
        "partially_failed"
    }
}

/// `settings` resolves output covers; summary-only reads (status refresh) pass `None`.
pub(super) fn batch_from_row(row: &PgRow, viewer: &str, settings: Option<&Settings>) -> RemixBatch {
    let structure: Value = row.get("structure");
    let constraints: Value = row.get("constraints");
    let (total, succeeded, running, cancelled): (i64, i64, i64, i64) = (
        row.get("total"),
        row.get("succeeded"),
        row.get("running"),
        row.get("cancelled"),
    );
    let owner_user_id: String = row.get("owner_user_id");
    RemixBatch {
        qc_failed_count: row.get::<i64, _>("qc_failed") as i32,
        batch_id: row.get("batch_id"),
        mode: structure["mode"].as_str().unwrap_or("framework").to_owned(),
        owned_by_current_user: owner_user_id == viewer,
        owner_user_id,
        owner_name: None,
        preset_key: row.get("preset_key"),
        preset_version: row.get("preset_version"),
        labels: structure["labels"]
            .as_array()
            .map(|labels| {
                labels
                    .iter()
                    .filter_map(|label| label.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        source_asset_id: structure["sourceAssetId"]
            .as_str()
            .and_then(|id| Uuid::parse_str(id).ok()),
        product_name: constraints["productName"].as_str().unwrap_or("").to_owned(),
        requested_count: row.get("requested_count"),
        planned_count: row.get("planned_count"),
        seed: row.get("seed"),
        status: batch_status(total, succeeded, running, cancelled).into(),
        shortfall_reason: row.get("shortfall_reason"),
        succeeded_count: succeeded as i32,
        failed_count: (total - succeeded - running - cancelled) as i32,
        running_count: running as i32,
        cancelled_count: cancelled as i32,
        available_count: row.get::<i64, _>("available") as i32,
        reviewable_count: row.get::<i64, _>("reviewable") as i32,
        approved_count: row.get::<i64, _>("approved") as i32,
        rejected_count: row.get::<i64, _>("rejected") as i32,
        cover_urls: settings
            .map(|settings| {
                row.get::<Vec<String>, _>("cover_keys")
                    .iter()
                    .filter_map(|key| build_cover_url_for_key(settings, key))
                    .collect()
            })
            .unwrap_or_default(),
        failure_reason: row.get("failure_reason"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

/// Best-effort display names (one lookup per distinct user). Only the display
/// name is exposed — never the login username or email, since every signed-in
/// user may read these batches in open access; an unresolvable user maps to
/// `None` rather than failing the read.
pub(super) async fn display_names(
    pool: &PgPool,
    user_ids: &[String],
) -> HashMap<String, Option<String>> {
    let mut names: HashMap<String, Option<String>> = HashMap::new();
    for user_id in user_ids {
        if names.contains_key(user_id) {
            continue;
        }
        let name = match crate::auth::fetch_user_profile(pool, user_id).await {
            Ok(Some(profile)) => profile
                .full_name
                .map(|name| name.trim().to_string())
                .filter(|name| !name.is_empty()),
            Ok(None) => None,
            Err(error) => {
                tracing::warn!(?error, "remix batch user name lookup failed");
                None
            }
        };
        names.insert(user_id.clone(), name);
    }
    names
}

/// Creator display names for at most one list page (see `display_names`).
pub(super) async fn attach_owner_names(pool: &PgPool, batches: &mut [RemixBatch]) {
    let owners: Vec<String> = batches
        .iter()
        .map(|batch| batch.owner_user_id.clone())
        .collect();
    let names = display_names(pool, &owners).await;
    for batch in batches.iter_mut() {
        batch.owner_name = names.get(&batch.owner_user_id).cloned().flatten();
    }
}

/// Refreshes the stored summary `status` with the live rule. The batch row is
/// locked before counting, the same order as the worker's reconciliation, so
/// the count reads the latest committed Run states and never regresses a
/// newer summary.
pub(super) async fn refresh_stored_status(
    pool: &PgPool,
    owner: Option<&str>,
    batch_id: Uuid,
) -> StudioResult<()> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query(
        "SELECT 1 FROM ads.content_remix_batches WHERE batch_id = $1 AND ($2::TEXT IS NULL OR owner_user_id = $2) FOR UPDATE",
    )
    .bind(batch_id)
    .bind(owner)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or(AppError::NotFound)?;
    let sql = format!("{BATCH_SELECT} AND b.batch_id = $2 GROUP BY b.batch_id");
    let row = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(owner)
        .bind(batch_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    // Before migration 032 the stored summary keeps the 031 vocabulary, the
    // same fallback as Python `remix_output.cancelled_supported`.
    let widened: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ads.content_remix_batches'::regclass AND conname = 'content_remix_batches_status_check' AND pg_get_constraintdef(oid) LIKE '%''cancelled''%')")
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    let batch = batch_from_row(&row, "", None);
    let status = if widened {
        batch.status
    } else {
        let (s, f, r, c) = (
            i64::from(batch.succeeded_count),
            i64::from(batch.failed_count),
            i64::from(batch.running_count),
            i64::from(batch.cancelled_count),
        );
        batch_status(s + f + r + c, s, r, 0).into()
    };
    sqlx::query("UPDATE ads.content_remix_batches SET status = $2, updated_at = NOW() WHERE batch_id = $1 AND status <> $2")
        .bind(batch_id)
        .bind(status)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSegment {
    #[serde(default)]
    spend_class: Option<String>,
    #[serde(default)]
    spend30d: Option<f64>,
    segment_id: Uuid,
    asset_id: Uuid,
    start_ms: i32,
    end_ms: i32,
    label_key: String,
    #[serde(default)]
    slot: Option<i32>,
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    fallback: Option<bool>,
    #[serde(default)]
    selling_points: Option<Vec<String>>,
    #[serde(default)]
    segment_ids: Option<Vec<Uuid>>,
}

/// 404 unless the batch is in the enterprise (same predicate as `remix_list::list`); a
/// no-op without an enterprise tag. Guards the by-id read and cancel routes.
pub(super) async fn ensure_in_enterprise(
    pool: &PgPool,
    batch_id: Uuid,
    enterprise_tag: Option<&str>,
) -> StudioResult<()> {
    if enterprise_tag.is_none() {
        return Ok(());
    }
    let sql = format!(
        "SELECT EXISTS (SELECT 1 FROM ads.content_remix_batches b WHERE b.batch_id = $1 AND {})",
        batch_in_enterprise_sql(2)
    );
    let inside: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(batch_id)
        .bind(enterprise_tag)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    if inside {
        Ok(())
    } else {
        Err(AppError::NotFound.into())
    }
}

pub(super) async fn detail(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    batch_id: Uuid,
) -> StudioResult<RemixBatchDetail> {
    let sql = format!("{BATCH_SELECT} AND b.batch_id = $2 GROUP BY b.batch_id");
    let row = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(owner)
        .bind(batch_id)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or(AppError::NotFound)?;
    let mut batch = batch_from_row(&row, viewer, Some(settings));
    attach_owner_names(pool, std::slice::from_mut(&mut batch)).await;
    let rows = sqlx::query("SELECT br.ordinal, br.run_id, br.combination_hash, br.segments, br.output_asset_id, (br.output_asset_id IS NOT NULL AND oa.asset_id IS NULL) AS output_deleted, oa.cover_object_key AS output_cover_key, r.status, r.stage, r.waiting_reason, j.status AS job_status, j.error_message AS job_error, j.receipt->'host_remix_qc' AS qc, j.receipt->'host_remix_picture_review' AS picture_review, j.receipt->'host_inspection'->>'sha256' AS inspected_sha, (r.status = 'succeeded' AND (oa.asset_id IS NOT NULL OR rv.decision='rejected') AND rv.output_asset_id = br.output_asset_id) AS review_current, rv.decision AS review_decision, rv.reasons AS review_reasons, rv.note AS review_note, rv.reviewer_user_id, rv.reviewed_at::TEXT AS reviewed_at FROM ads.content_remix_batch_runs br JOIN ads.content_production_runs r ON r.run_id = br.run_id LEFT JOIN ads.content_production_jobs j ON j.job_id = r.render_job_id LEFT JOIN ads.marketing_content_assets oa ON oa.asset_id = br.output_asset_id AND oa.is_deleted = FALSE LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id = br.run_id WHERE br.batch_id = $1 ORDER BY br.ordinal")
        .bind(batch_id).fetch_all(pool).await.map_err(db_error)?;
    let mut stored = Vec::with_capacity(rows.len());
    for row in &rows {
        let segments: Vec<StoredSegment> =
            serde_json::from_value(row.get("segments")).map_err(|error| {
                tracing::error!(?error, "stored remix batch segments are invalid");
                AppError::Internal
            })?;
        stored.push(segments);
    }
    let asset_ids: Vec<Uuid> = stored.iter().flatten().map(|s| s.asset_id).collect();
    let titles: HashMap<Uuid, String> = sqlx::query(
        "SELECT asset_id, title FROM ads.marketing_content_assets WHERE asset_id = ANY($1)",
    )
    .bind(&asset_ids)
    .fetch_all(pool)
    .await
    .map_err(db_error)?
    .into_iter()
    .map(|row| (row.get("asset_id"), row.get("title")))
    .collect();
    // A review stays on its Run after the output is replaced or deleted; only a
    // review of the current, still-present output is shown.
    fn current(row: &PgRow) -> bool {
        row.get::<Option<bool>, _>("review_current") == Some(true)
    }
    let reviewer_ids: Vec<String> = rows
        .iter()
        .filter(|row| current(row))
        .map(|row| row.get("reviewer_user_id"))
        .collect();
    let reviewers = display_names(pool, &reviewer_ids).await;
    let mut items: Vec<RemixBatchItem> = rows
        .iter()
        .zip(stored)
        .map(|(row, segments)| {
            let status: String = row.get("status");
            let review = current(row).then(|| {
                let reviewer_user_id: String = row.get("reviewer_user_id");
                RemixOutputReview {
                    decision: row.get("review_decision"),
                    reasons: row.get("review_reasons"),
                    note: row.get("review_note"),
                    reviewer_name: reviewers.get(&reviewer_user_id).cloned().flatten(),
                    reviewer_user_id,
                    reviewed_at: row.get("reviewed_at"),
                }
            });
            RemixBatchItem {
                qc: super::remix_quality::project(
                    row.get("qc"),
                    row.get("inspected_sha"),
                    row.get::<Option<String>, _>("waiting_reason").as_deref(),
                ),
                ordinal: row.get("ordinal"),
                run_id: row.get("run_id"),
                combination_hash: row.get("combination_hash"),
                outcome: outcome(&status).into(),
                run_status: status,
                run_stage: row.get("stage"),
                waiting_reason: row.get("waiting_reason"),
                job_status: row.get("job_status"),
                job_error: row.get("job_error"),
                picture_review: super::remix_picture_review::project(
                    row.get("picture_review"),
                    row.get("inspected_sha"),
                ),
                review,
                delivery: None,
                retention: None,
                output_asset_id: row.get("output_asset_id"),
                output_deleted: row.get("output_deleted"),
                output_cover_url: row
                    .get::<Option<String>, _>("output_cover_key")
                    .and_then(|key| build_cover_url_for_key(settings, &key)),
                duration_ms: segments
                    .iter()
                    .map(|s| i64::from(s.end_ms - s.start_ms))
                    .sum(),
                segments: segments
                    .into_iter()
                    .map(|s| RemixBatchSegment {
                        spend_class: s.spend_class,
                        spend30d: s.spend30d,
                        asset_title: titles.get(&s.asset_id).cloned().unwrap_or_default(),
                        segment_id: s.segment_id,
                        asset_id: s.asset_id,
                        label_key: s.label_key,
                        start_ms: s.start_ms,
                        end_ms: s.end_ms,
                        slot: s.slot,
                        tier: s.tier,
                        fallback: s.fallback,
                        selling_points: s.selling_points,
                        segment_ids: s.segment_ids,
                    })
                    .collect(),
            }
        })
        .collect();
    super::remix_delivery::attach(pool, settings, &mut items).await?;
    super::remix_retention::attach(pool, &mut items).await?;
    Ok(RemixBatchDetail { batch, items })
}

/// Products of current confirmed segments, most segments first.
pub(super) async fn products(
    pool: &PgPool,
    query: &RemixProductListQuery,
    enterprise_tag: Option<&str>,
    cloud_enabled: bool,
) -> StudioResult<RemixProductListResponse> {
    if let Some(key) = query.preset_key.as_deref() {
        domain::validate_key(key, "presetKey")?;
    }
    let rows = sqlx::query("SELECT s.product_name, COUNT(*) AS segment_count FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id WHERE s.status = 'confirmed' AND s.product_name IS NOT NULL AND a.is_deleted = FALSE AND s.source_content_hash = LOWER(TRIM(a.raw_sha256)) AND ($5::BOOLEAN OR a.bucket <> 'cloud_video') AND ($1::TEXT IS NULL OR s.preset_key = $1) AND ($2::INTEGER IS NULL OR s.preset_version = $2) AND ($4::TEXT IS NULL OR $4 = ANY(a.tags)) GROUP BY s.product_name ORDER BY segment_count DESC, s.product_name LIMIT $3")
        .bind(query.preset_key.as_deref()).bind(query.preset_version).bind(PRODUCT_LIST_LIMIT).bind(enterprise_tag).bind(cloud_enabled)
        .fetch_all(pool).await.map_err(db_error)?;
    Ok(RemixProductListResponse {
        items: rows
            .into_iter()
            .map(|row| RemixProduct {
                product_name: row.get("product_name"),
                confirmed_segment_count: row.get("segment_count"),
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcomes_and_batch_status() {
        assert_eq!(outcome("succeeded"), "succeeded");
        for status in ["queued", "running", "cancelling", "paused"] {
            assert_eq!(outcome(status), "running");
        }
        for status in ["waiting", "failed"] {
            assert_eq!(outcome(status), "failed");
        }
        assert_eq!(outcome("cancelled"), "cancelled");
        assert_eq!(batch_status(3, 1, 1, 1), "running");
        assert_eq!(batch_status(3, 3, 0, 0), "succeeded");
        assert_eq!(batch_status(3, 0, 0, 0), "failed");
        assert_eq!(batch_status(3, 2, 0, 0), "partially_failed");
        assert_eq!(batch_status(3, 0, 0, 3), "cancelled");
        assert_eq!(batch_status(3, 1, 0, 1), "cancelled");
    }
}
