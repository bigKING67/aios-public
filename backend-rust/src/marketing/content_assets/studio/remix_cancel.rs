//! Cancel of a 框架混剪批次: owner-only in scoped studio access, any signed-in
//! user in open access (`owner` filter `None`). Runs always belong to the batch
//! creator, so the Runs cancel transition is applied as that owner; the real
//! caller is recorded in a structured `studio_audit` log line (Runs and batches
//! have no canceller column). Each unsettled Run goes through the existing
//! Runs cancel transition: a queued render is cancelled at once, a running
//! render becomes `cancelling` until the worker stops it. Settled Runs
//! (succeeded, failed, cancelled, cancelling) and their outputs are untouched,
//! so repeating the call is idempotent and returns the current detail.
use super::error::StudioResult;
use super::remix_read;
use super::remix_types::RemixBatchDetail;
use super::repository::db_error;
use crate::{
    config::Settings, error::AppError, marketing::content_assets::production::framework_remix,
};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub(super) async fn cancel(
    pool: &PgPool,
    settings: &Settings,
    viewer: &str,
    owner: Option<&str>,
    batch_id: Uuid,
) -> StudioResult<RemixBatchDetail> {
    let rows = sqlx::query("SELECT br.run_id, r.status, b.owner_user_id FROM ads.content_remix_batches b JOIN ads.content_remix_batch_runs br ON br.batch_id = b.batch_id JOIN ads.content_production_runs r ON r.run_id = br.run_id WHERE b.batch_id = $1 AND ($2::TEXT IS NULL OR b.owner_user_id = $2) ORDER BY br.ordinal")
        .bind(batch_id)
        .bind(owner)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    let Some(first) = rows.first() else {
        return Err(AppError::NotFound.into());
    };
    let run_owner: String = first.get("owner_user_id");
    // Try every Run before reporting, so one conflict does not leave the rest
    // running; a retry only touches the Runs that are still unsettled.
    let mut first_error = None;
    let mut attempted = 0usize;
    for row in &rows {
        let status: String = row.get("status");
        if framework_remix::CANCEL_SETTLED.contains(&status.as_str()) {
            continue;
        }
        let run_id: Uuid = row.get("run_id");
        attempted += 1;
        if let Err(error) = framework_remix::cancel(pool, &run_owner, run_id).await {
            tracing::warn!(%batch_id, %run_id, ?error, "framework remix run cancel failed");
            first_error.get_or_insert(error);
        }
    }
    if attempted > 0 {
        // Audit trail for the actual canceller: Runs are cancelled as the
        // batch owner, so this line is the only record of who asked.
        tracing::info!(
            target: "studio_audit",
            action = "remix_batch_cancel",
            %batch_id,
            operator = viewer,
            owner = %run_owner,
            non_owner = run_owner != viewer,
            attempted,
            failed = first_error.is_some(),
            "framework remix batch cancel"
        );
    }
    remix_read::refresh_stored_status(pool, owner, batch_id).await?;
    if let Some(error) = first_error {
        return Err(error.into());
    }
    remix_read::detail(pool, settings, viewer, owner, batch_id).await
}
