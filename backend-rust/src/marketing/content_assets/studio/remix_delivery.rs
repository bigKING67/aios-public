//! Delivery status and retry intent. Vendor credentials/calls belong to the desktop worker.
use super::{
    error::StudioResult,
    remix_read,
    remix_types::{RemixBatchDetail, RemixBatchItem, RemixDelivery},
    repository::db_error,
};
use crate::{auth::CurrentUser, config::Settings, error::AppError, state::AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::{PgConnection, PgPool, Row};
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

fn approved(item: &RemixBatchItem) -> bool {
    item.outcome == "succeeded"
        && !item.output_deleted
        && item
            .review
            .as_ref()
            .is_some_and(|r| r.decision == "approved")
        && item.qc.as_ref().is_some_and(|qc| qc.status == "passed")
}

/// Same queue-row serialization as the desktop's pre-submit approval check.
/// Accepted imports cannot be recalled here; only the short submission window is locked.
pub(super) async fn lock_review_change(
    conn: &mut PgConnection,
    asset_id: Option<Uuid>,
) -> StudioResult<()> {
    if let Some(id) = asset_id {
        sqlx::query("SELECT PG_ADVISORY_XACT_LOCK(HASHTEXTEXTENDED($1,0))")
            .bind(format!("aios-cloud-push-review:{id}"))
            .execute(&mut *conn)
            .await
            .map_err(db_error)?;
    }
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM cloud_video.pushes WHERE output_asset_id=$1 FOR UPDATE",
    )
    .bind(asset_id)
    .fetch_optional(conn)
    .await
    .map_err(db_error)?;
    if status.as_deref() == Some("submitting") {
        return Err(AppError::Conflict("正在提交云管家，请稍后刷新再修改审核".into()).into());
    }
    Ok(())
}

pub(super) async fn attach(
    pool: &PgPool,
    settings: &Settings,
    items: &mut [RemixBatchItem],
) -> StudioResult<()> {
    let ids: Vec<Uuid> = items
        .iter()
        .filter_map(|item| item.output_asset_id)
        .collect();
    let rows = sqlx::query("SELECT output_asset_id, status, cloud_video_id::TEXT AS cloud_video_id, video_name, error_code, attempts, updated_at::TEXT AS updated_at FROM cloud_video.pushes WHERE output_asset_id = ANY($1)")
        .bind(&ids).fetch_all(pool).await.map_err(db_error)?;
    let by_asset: HashMap<Uuid, _> = rows
        .into_iter()
        .map(|r| (r.get("output_asset_id"), r))
        .collect();
    let enabled = settings.content_ai_studio_delivery_enabled;
    for item in items {
        let eligible = approved(item);
        if let Some(row) = item.output_asset_id.and_then(|id| by_asset.get(&id)) {
            let status: String = row.get("status");
            item.delivery = Some(RemixDelivery {
                can_retry: enabled && eligible && status == "failed",
                status,
                enabled,
                cloud_video_id: row.get("cloud_video_id"),
                video_name: row.get("video_name"),
                error_code: row.get("error_code"),
                attempts: row.get("attempts"),
                updated_at: Some(row.get("updated_at")),
            });
        } else if eligible {
            item.delivery = Some(RemixDelivery {
                status: "pending".into(),
                enabled,
                can_retry: false,
                cloud_video_id: None,
                video_name: None,
                error_code: None,
                attempts: 0,
                updated_at: None,
            });
        }
    }
    Ok(())
}

pub(super) async fn retry(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path((batch_id, ordinal)): Path<(Uuid, i32)>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = super::guard(&state.settings, &user, true)?;
    super::remix::ensure_enabled(&state.settings)?;
    remix_read::ensure_in_enterprise(&state.pool, batch_id, access.enterprise_tag()).await?;
    retry_output(
        &state.pool,
        &state.settings,
        &user.user_id,
        access.batch_owner(&user),
        batch_id,
        ordinal,
    )
    .await
    .map(Json)
}

pub(super) async fn retry_output(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    batch_id: Uuid,
    ordinal: i32,
) -> StudioResult<RemixBatchDetail> {
    if !settings.content_ai_studio_delivery_enabled {
        return Err(AppError::ServiceUnavailable("云管家推送尚未启用".into()).into());
    }
    let detail = remix_read::detail(pool, settings, viewer, owner, batch_id).await?;
    let item = detail
        .items
        .iter()
        .find(|i| i.ordinal == ordinal)
        .ok_or(AppError::NotFound)?;
    if !item.delivery.as_ref().is_some_and(|d| d.can_retry) {
        return Err(
            AppError::Conflict("只有仍审核通过且已明确推送失败的成片才能重新排队".into()).into(),
        );
    }
    // Retry is only an intent. Worker rechecks current review, QC, object and source category before import.
    let changed = sqlx::query("UPDATE cloud_video.pushes p SET status='pending', retry_limit=attempts+4, next_attempt_at=NOW(), error_code=NULL, updated_at=NOW() WHERE output_asset_id=$1 AND status='failed' AND EXISTS (SELECT 1 FROM ads.content_remix_output_reviews rv JOIN ads.content_remix_batch_runs br ON br.run_id=rv.run_id JOIN ads.marketing_content_assets a ON a.asset_id=br.output_asset_id JOIN ads.content_production_runs r ON r.run_id=br.run_id WHERE br.run_id=$2 AND rv.output_asset_id=p.output_asset_id AND br.output_asset_id=p.output_asset_id AND rv.decision='approved' AND NOT a.is_deleted AND r.status='succeeded')")
        .bind(item.output_asset_id).bind(item.run_id).execute(pool).await.map_err(db_error)?.rows_affected();
    if changed != 1 {
        return Err(AppError::Conflict("推送或审核状态已变化，请刷新".into()).into());
    }
    tracing::info!(target: "studio_audit", action="remix_delivery_retry", %batch_id, ordinal, user_id=%viewer);
    remix_read::detail(pool, settings, viewer, owner, batch_id).await
}
