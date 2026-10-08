use super::{domain::conflict, types::*};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
};
use serde_json::Value;
use sqlx::{postgres::PgRow, PgConnection, PgPool, Row};
use uuid::Uuid;

fn row_run(row: PgRow) -> AppResult<Run> {
    Ok(Run {
        run_id: row.get("run_id"),
        version: row.get("version"),
        execution_version: row.get("execution_version"),
        plan_revision: row.get("plan_revision"),
        status: row.get("status"),
        stage: row.get("stage"),
        waiting_reason: row.get("waiting_reason"),
        request: serde_json::from_value(row.get("request")).map_err(|_| AppError::Internal)?,
        sources: serde_json::from_value(row.get("source_snapshot"))
            .map_err(|_| AppError::Internal)?,
        active_attempt: row.get("active_attempt"),
        project_id: row.get("project_id"),
        project_revision: row.get("project_revision"),
        render_job_id: row.get("render_job_id"),
        pause_requested: row.get("pause_requested"),
        created_at: row.get("created_text"),
        updated_at: row.get("updated_text"),
    })
}

pub(super) fn encode<T: serde::Serialize>(value: &T) -> AppResult<Value> {
    serde_json::to_value(value).map_err(|_| AppError::Internal)
}

pub(super) async fn get(pool: &PgPool, owner: &str, id: Uuid) -> AppResult<Run> {
    let row = sqlx::query("SELECT *,created_at::TEXT AS created_text,updated_at::TEXT AS updated_text FROM ads.content_production_runs WHERE run_id=$1 AND owner_user_id=$2")
        .bind(id).bind(owner).fetch_optional(pool).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    row_run(row)
}

pub(super) async fn lock(db: &mut PgConnection, owner: &str, id: Uuid) -> AppResult<Run> {
    let row = sqlx::query("SELECT *,created_at::TEXT AS created_text,updated_at::TEXT AS updated_text FROM ads.content_production_runs WHERE run_id=$1 AND owner_user_id=$2 FOR UPDATE")
        .bind(id).bind(owner).fetch_optional(db).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    row_run(row)
}

pub(super) async fn list(pool: &PgPool, owner: &str) -> AppResult<Vec<Run>> {
    sqlx::query("SELECT *,created_at::TEXT AS created_text,updated_at::TEXT AS updated_text FROM ads.content_production_runs WHERE owner_user_id=$1 ORDER BY created_at DESC,run_id DESC LIMIT 50")
        .bind(owner).fetch_all(pool).await.map_err(db_error)?.into_iter().map(row_run).collect()
}

pub(super) async fn create(
    pool: &PgPool,
    owner: &str,
    request: &CreateRunRequest,
    sources: &crate::marketing::content_assets::production::types::Snapshot,
) -> AppResult<Run> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let id = create_in(&mut tx, owner, request, sources).await?;
    tx.commit().await.map_err(db_error)?;
    get(pool, owner, id).await
}

/// Idempotent Run insert inside a caller-owned transaction.
pub(super) async fn create_in(
    db: &mut PgConnection,
    owner: &str,
    request: &CreateRunRequest,
    sources: &crate::marketing::content_assets::production::types::Snapshot,
) -> AppResult<Uuid> {
    let input = encode(request)?;
    sqlx::query("INSERT INTO ads.content_production_runs (run_id,owner_user_id,idempotency_key,request,source_snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_user_id,idempotency_key) DO NOTHING")
        .bind(Uuid::new_v4()).bind(owner).bind(&request.idempotency_key).bind(&input).bind(encode(sources)?)
        .execute(&mut *db).await.map_err(db_error)?;
    let row = sqlx::query("SELECT run_id,request FROM ads.content_production_runs WHERE owner_user_id=$1 AND idempotency_key=$2")
        .bind(owner).bind(&request.idempotency_key).fetch_one(&mut *db).await.map_err(db_error)?;
    if row.get::<Value, _>("request") != input {
        return Err(AppError::Conflict("幂等键已用于不同制作要求".into()));
    }
    Ok(row.get("run_id"))
}

pub(super) async fn plan(
    db: &mut PgConnection,
    id: Uuid,
    revision: i32,
) -> AppResult<Option<PlanRevision>> {
    if revision == 0 {
        return Ok(None);
    }
    let row = sqlx::query("SELECT revision,execution_version,document,origin,created_at::TEXT AS created_text FROM ads.content_production_plans WHERE run_id=$1 AND revision=$2")
        .bind(id).bind(revision).fetch_optional(db).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    Ok(Some(PlanRevision {
        revision: row.get("revision"),
        execution_version: row.get("execution_version"),
        document: serde_json::from_value(row.get("document")).map_err(|_| AppError::Internal)?,
        origin: row.get("origin"),
        created_at: row.get("created_text"),
    }))
}

pub(super) async fn detail(pool: &PgPool, owner: &str, id: Uuid) -> AppResult<RunDetail> {
    let run = get(pool, owner, id).await?;
    let mut db = pool.acquire().await.map_err(db_error)?;
    let plan = plan(&mut db, id, run.plan_revision).await?;
    Ok(RunDetail { run, plan })
}

pub(super) fn check_version(run: &Run, expected: i32) -> AppResult<()> {
    if expected != run.version {
        return Err(conflict());
    }
    Ok(())
}

pub(super) fn next(value: i32) -> AppResult<i32> {
    value.checked_add(1).ok_or(AppError::Internal)
}

pub(super) async fn save(db: &mut PgConnection, run: &mut Run) -> AppResult<()> {
    run.version = next(run.version)?;
    sqlx::query("UPDATE ads.content_production_runs SET version=$2,execution_version=$3,plan_revision=$4,status=$5,stage=$6,waiting_reason=$7,active_attempt=$8,project_id=$9,project_revision=$10,render_job_id=$11,pause_requested=$12,updated_at=NOW() WHERE run_id=$1")
        .bind(run.run_id).bind(run.version).bind(run.execution_version).bind(run.plan_revision)
        .bind(&run.status).bind(&run.stage).bind(&run.waiting_reason).bind(run.active_attempt)
        .bind(run.project_id).bind(run.project_revision).bind(run.render_job_id).bind(run.pause_requested).execute(db).await.map_err(db_error)?;
    Ok(())
}

pub(super) async fn insert_plan(
    db: &mut PgConnection,
    run: &mut Run,
    document: &PlanDocument,
    origin: &str,
    attempt: Option<Uuid>,
) -> AppResult<()> {
    run.plan_revision = next(run.plan_revision)?;
    sqlx::query("INSERT INTO ads.content_production_plans (run_id,revision,execution_version,document,origin,attempt_id) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(run.run_id).bind(run.plan_revision).bind(run.execution_version).bind(encode(document)?).bind(origin).bind(attempt)
        .execute(db).await.map_err(db_error)?;
    if run.status != "paused" {
        run.status = "waiting".into();
    }
    run.stage = "planning".into();
    run.waiting_reason = Some(
        if document.clips.is_empty() || !document.gaps.is_empty() {
            "missing_material"
        } else if run.request.review_before_production {
            "awaiting_plan_confirmation"
        } else {
            "awaiting_execution_adapter"
        }
        .into(),
    );
    Ok(())
}
