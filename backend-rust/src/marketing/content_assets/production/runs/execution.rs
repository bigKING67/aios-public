use super::{adopt, domain, repository as repo, transitions::Control, types::*};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

pub(super) async fn produce(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    request: AdoptPlanRequest,
) -> AppResult<RunDetail> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    repo::check_version(&run, request.expected_version)?;
    if run.status != "waiting" || run.plan_revision != request.expected_plan_revision {
        return Err(domain::conflict());
    }
    enqueue(&mut tx, owner, &mut run, request.expected_project_revision).await?;
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    repo::detail(pool, owner, id).await
}

// Caller holds the Run row lock. Persisting a plan and dispatching it can share one transaction.
pub(super) async fn enqueue(
    db: &mut PgConnection,
    owner: &str,
    run: &mut Run,
    expected_project: Option<i32>,
) -> AppResult<()> {
    if run.status != "waiting" || run.pause_requested || run.active_attempt.is_some() {
        return Err(domain::conflict());
    }
    let plan = repo::plan(db, run.run_id, run.plan_revision)
        .await?
        .ok_or_else(domain::conflict)?;
    if plan.document.clips.is_empty() || !plan.document.gaps.is_empty() {
        return Err(AppError::bad_request("方案仍有素材缺口，不能开始制作"));
    }
    adopt::apply(db, owner, run, expected_project).await?;
    dispatch(db, run).await
}

async fn dispatch(db: &mut PgConnection, run: &mut Run) -> AppResult<()> {
    run.execution_version = repo::next(run.execution_version)?;
    let job = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES ($1,$2,$3,FALSE)")
        .bind(job).bind(run.project_id).bind(run.project_revision).execute(&mut *db).await.map_err(db_error)?;
    sqlx::query("INSERT INTO ads.content_production_run_renders (run_id,execution_version,plan_revision,job_id) VALUES ($1,$2,$3,$4)")
        .bind(run.run_id).bind(run.execution_version).bind(run.plan_revision).bind(job).execute(&mut *db).await.map_err(db_error)?;
    run.render_job_id = Some(job);
    run.status = "running".into();
    run.stage = "production".into();
    run.waiting_reason = None;
    Ok(())
}

// Worker job completion never locks Run: control uses Run -> job; reconciliation locks only Run.
pub(super) async fn control(
    db: &mut PgConnection,
    owner: &str,
    run: &mut Run,
    action: &Control,
) -> AppResult<bool> {
    let Some(job) = run.render_job_id else {
        return Ok(false);
    };
    let row = sqlx::query("SELECT j.status,j.project_id,j.revision,l.plan_revision,l.execution_version FROM ads.content_production_jobs j JOIN ads.content_production_run_renders l ON l.job_id=j.job_id WHERE j.job_id=$1 AND l.run_id=$2 FOR UPDATE OF j")
        .bind(job).bind(run.run_id).fetch_one(&mut *db).await.map_err(db_error)?;
    let status: String = row.get("status");
    let active = ["queued", "running", "cancel_requested"].contains(&status.as_str());
    match action {
        Control::Pause | Control::Cancel => {
            if active {
                sqlx::query("UPDATE ads.content_production_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancel_requested' END,stage=CASE WHEN status='queued' THEN '已取消' ELSE '取消处理中' END,finished_at=CASE WHEN status='queued' THEN NOW() ELSE NULL END WHERE job_id=$1")
                    .bind(job).execute(&mut *db).await.map_err(db_error)?;
            }
            let stopping = active && status != "queued";
            if matches!(action, Control::Pause) {
                run.status = if stopping { "running" } else { "paused" }.into();
                run.pause_requested = stopping;
                run.waiting_reason = Some(
                    if stopping {
                        "pause_requested"
                    } else {
                        "render_paused"
                    }
                    .into(),
                );
            } else {
                run.status = if stopping { "cancelling" } else { "cancelled" }.into();
                run.execution_version = repo::next(run.execution_version)?;
                run.pause_requested = false;
                run.waiting_reason = None;
            }
        }
        Control::Resume => {
            if active
                || run.pause_requested
                || !(run.status == "paused"
                    || (run.status == "waiting"
                        && [Some("render_failed"), Some("render_cancelled")]
                            .contains(&run.waiting_reason.as_deref())))
            {
                return Err(domain::conflict());
            }
            if status == "completed"
                && row.get::<i32, _>("plan_revision") == run.plan_revision
                && row.get::<i32, _>("execution_version") == run.execution_version
            {
                run.status = "running".into();
                run.waiting_reason = None;
            } else {
                run.status = "waiting".into();
                if row.get::<i32, _>("plan_revision") == run.plan_revision {
                    // Retry the already frozen revision. Re-adopting would run
                    // today's compiler/ASR preparation again after an upgrade.
                    let latest: Option<i32> = sqlx::query_scalar("SELECT revision FROM ads.content_production_projects WHERE project_id=$1 AND owner_user_id=$2 FOR UPDATE")
                        .bind(run.project_id).bind(owner).fetch_optional(&mut *db).await.map_err(db_error)?;
                    if latest != run.project_revision
                        || run.project_id != Some(row.get::<Uuid, _>("project_id"))
                        || run.project_revision != Some(row.get::<i32, _>("revision"))
                    {
                        return Err(domain::conflict());
                    }
                    dispatch(db, run).await?;
                } else {
                    let expected = run.project_revision;
                    enqueue(db, owner, run, expected).await?;
                }
            }
        }
    }
    Ok(true)
}
