use super::{domain, execution, repository as repo, types::*};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub(super) enum Control {
    Pause,
    Resume,
    Cancel,
}

pub(super) async fn control(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    expected: i32,
    action: Control,
) -> AppResult<RunDetail> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    repo::check_version(&run, expected)?;
    if ["cancelled", "failed", "succeeded", "cancelling"].contains(&run.status.as_str()) {
        return Err(domain::conflict());
    }
    if execution::control(&mut tx, owner, &mut run, &action).await? {
        repo::save(&mut tx, &mut run).await?;
        tx.commit().await.map_err(db_error)?;
        return repo::detail(pool, owner, id).await;
    }
    match action {
        Control::Pause => {
            run.status = "paused".into();
        }
        Control::Cancel => {
            run.status = "cancelled".into();
            run.execution_version = repo::next(run.execution_version)?;
            run.active_attempt = None;
            run.waiting_reason = None;
        }
        Control::Resume => {
            let live = if let Some(attempt) = run.active_attempt {
                let row=sqlx::query("SELECT status='queued' OR (status='running' AND expires_at>clock_timestamp()) AS live FROM ads.content_production_plan_attempts WHERE attempt_id=$1 AND run_id=$2")
                    .bind(attempt).bind(id).fetch_one(&mut *tx).await.map_err(db_error)?;
                row.get::<bool, _>("live")
            } else {
                false
            };
            let expired = run.active_attempt.is_some() && !live;
            if run.status != "paused"
                && !expired
                && run.waiting_reason.as_deref() != Some("planning_failed")
            {
                return Err(AppError::Conflict(
                    "只有暂停、失败待处理或执行已过期的任务可以恢复".into(),
                ));
            }
            if expired {
                sqlx::query("UPDATE ads.content_production_plan_attempts SET status='superseded',error_code='lease_expired',finished_at=COALESCE(finished_at,NOW()) WHERE attempt_id=$1 AND status='running'")
                    .bind(run.active_attempt).execute(&mut *tx).await.map_err(db_error)?;
                run.active_attempt = None;
                run.execution_version = repo::next(run.execution_version)?;
            }
            run.status = if live {
                "running"
            } else if run.plan_revision > 0 {
                "waiting"
            } else {
                "queued"
            }
            .into();
            if run.plan_revision == 0 {
                run.waiting_reason = None;
            }
        }
    }
    if matches!(action, Control::Resume)
        && run.status == "waiting"
        && !run.request.review_before_production
    {
        if let Some(plan) = repo::plan(&mut tx, id, run.plan_revision).await? {
            if !plan.document.clips.is_empty() && plan.document.gaps.is_empty() {
                let expected = run.project_revision;
                execution::enqueue(&mut tx, owner, &mut run, expected).await?;
            }
        }
    }
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    repo::detail(pool, owner, id).await
}

pub(super) async fn revise(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    request: RevisePlanRequest,
) -> AppResult<RunDetail> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    repo::check_version(&run, request.expected_version)?;
    if ["cancelled", "failed", "running", "succeeded", "cancelling"].contains(&run.status.as_str())
        || run.plan_revision != request.expected_plan_revision
    {
        return Err(AppError::Conflict(
            "方案版本冲突或任务仍在执行，请暂停并重新读取".into(),
        ));
    }
    domain::validate_plan(&request.document, &run.request, &run.sources)?;
    // Validate against the latest frozen treated edit before persisting a plan.
    super::treated_captions::preserve(&mut tx, owner, &run, &request.document).await?;
    if let Some(old) = repo::plan(&mut tx, id, run.plan_revision).await? {
        domain::preserve_locks(&old.document, &request.document, &request.unlock_clip_ids)?;
    } else if !request.unlock_clip_ids.is_empty() {
        return Err(domain::conflict());
    }
    run.execution_version = repo::next(run.execution_version)?;
    run.active_attempt = None;
    run.render_job_id = None;
    run.pause_requested = false;
    repo::insert_plan(&mut tx, &mut run, &request.document, "user", None).await?;
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    repo::detail(pool, owner, id).await
}
