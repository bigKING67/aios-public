use super::{domain, execution, repository as repo, types::*};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub(super) async fn enqueue(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    expected: i32,
) -> AppResult<(Run, Uuid)> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    repo::check_version(&run, expected)?;
    let continuation = if run.plan_revision > 0 {
        let context = super::planning_continuation::freeze(&mut tx, &run).await?;
        run.execution_version = repo::next(run.execution_version)?;
        Some(context)
    } else {
        if run.status != "queued" || run.active_attempt.is_some() {
            return Err(AppError::Conflict(
                "任务不在等待规划状态；不会重复调用模型".into(),
            ));
        }
        None
    };
    let token = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_production_plan_attempts (attempt_id,run_id,execution_version,input,status,expires_at) VALUES ($1,$2,$3,$4,'queued',clock_timestamp())")
        .bind(token).bind(id).bind(run.execution_version)
        .bind(json!({"request":run.request,"sources":run.sources.assets,"planRevision":run.plan_revision,"continuation":continuation}))
        .execute(&mut *tx).await.map_err(db_error)?;
    run.active_attempt = Some(token);
    run.status = "running".into();
    run.waiting_reason = None;
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    Ok((run, token))
}

// A stale result is retained, but only the current non-expired attempt can activate a plan.
pub(super) async fn finish(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    token: Uuid,
    result: Result<(PlanDocument, Value), &str>,
) -> AppResult<bool> {
    settle(pool, owner, id, token, result, false).await
}

pub(super) async fn finish_and_dispatch(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    token: Uuid,
    result: (PlanDocument, Value),
) -> AppResult<bool> {
    settle(pool, owner, id, token, Ok(result), true).await
}

async fn settle(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    token: Uuid,
    result: Result<(PlanDocument, Value), &str>,
    dispatch: bool,
) -> AppResult<bool> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    let row=sqlx::query("SELECT status,execution_version,expires_at>clock_timestamp() AS live FROM ads.content_production_plan_attempts WHERE attempt_id=$1 AND run_id=$2 FOR UPDATE")
        .bind(token).bind(id).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    let eligible = row.get::<String, _>("status") == "running"
        && row.get::<bool, _>("live")
        && run.active_attempt == Some(token)
        && row.get::<i32, _>("execution_version") == run.execution_version
        && ["running", "paused"].contains(&run.status.as_str());
    let (document, receipt, error) = match result {
        Ok((d, r)) => (Some(d), Some(r), None),
        Err(code) => (None, None, Some(code)),
    };
    let status = if !eligible {
        "superseded"
    } else if document.is_some() {
        "succeeded"
    } else {
        "failed"
    };
    sqlx::query("UPDATE ads.content_production_plan_attempts SET status=$2,result=$3,error_code=$4,finished_at=NOW() WHERE attempt_id=$1 AND result IS NULL AND status IN ('running','superseded')")
        .bind(token).bind(status).bind(&receipt).bind(error).execute(&mut *tx).await.map_err(db_error)?;
    if eligible {
        run.active_attempt = None;
        if let Some(document) = &document {
            domain::validate_plan(document, &run.request, &run.sources)?;
            repo::insert_plan(&mut tx, &mut run, document, "model", Some(token)).await?;
            if dispatch
                && run.status == "waiting"
                && !run.request.review_before_production
                && !document.clips.is_empty()
                && document.gaps.is_empty()
            {
                let expected = run.project_revision;
                execution::enqueue(&mut tx, owner, &mut run, expected).await?;
            }
        } else {
            if run.status != "paused" {
                run.status = "waiting".into();
            }
            run.waiting_reason = Some("planning_failed".into());
        }
        repo::save(&mut tx, &mut run).await?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(eligible)
}
