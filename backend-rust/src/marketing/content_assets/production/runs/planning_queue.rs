//! Durable admission and bounded claiming. Never retry a possibly dispatched call.
use super::{repository as repo, types::Run};
use crate::{error::AppResult, marketing::content_assets::production::repository::db_error};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

pub(super) struct Claim {
    pub owner: String,
    pub run: Run,
    pub token: Uuid,
}

pub(super) async fn claim(pool: &PgPool) -> AppResult<Option<Claim>> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    // A database-wide, transaction-only admission lock bounds all API replicas.
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(72819026, 1)")
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    if !locked {
        return Ok(None);
    }
    recover(&mut tx).await?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.content_production_plan_attempts WHERE status='running' AND expires_at>clock_timestamp()")
        .fetch_one(&mut *tx).await.map_err(db_error)?;
    if count >= 2 {
        tx.commit().await.map_err(db_error)?;
        return Ok(None);
    }
    let row = sqlx::query("SELECT r.run_id,r.owner_user_id,a.attempt_id FROM ads.content_production_runs r JOIN ads.content_production_plan_attempts a ON a.attempt_id=r.active_attempt AND a.run_id=r.run_id AND a.execution_version=r.execution_version WHERE r.status='running' AND r.stage='planning' AND (r.plan_revision=0 OR a.input->'planRevision'=to_jsonb(r.plan_revision)) AND a.status='queued' AND a.expires_at<=clock_timestamp() ORDER BY a.created_at,a.attempt_id LIMIT 1 FOR UPDATE OF r SKIP LOCKED")
        .fetch_optional(&mut *tx).await.map_err(db_error)?;
    let result = if let Some(row) = row {
        let owner: String = row.get("owner_user_id");
        let id = row.get("run_id");
        let token = row.get("attempt_id");
        // All mutators lock Run before attempt; no long transaction spans the LLM.
        let run = repo::lock(&mut tx, &owner, id).await?;
        sqlx::query("UPDATE ads.content_production_plan_attempts SET status='running',expires_at=clock_timestamp()+INTERVAL '210 seconds' WHERE attempt_id=$1 AND status='queued'")
            .bind(token).execute(&mut *tx).await.map_err(db_error)?;
        Some(Claim { owner, run, token })
    } else {
        None
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

async fn recover(db: &mut PgConnection) -> AppResult<()> {
    let rows = sqlx::query("SELECT r.run_id,r.owner_user_id,a.attempt_id FROM ads.content_production_plan_attempts a JOIN ads.content_production_runs r ON r.run_id=a.run_id WHERE (a.status='running' AND a.expires_at<=clock_timestamp()) OR (a.status='queued' AND (r.active_attempt IS DISTINCT FROM a.attempt_id OR r.execution_version<>a.execution_version OR r.status NOT IN ('running','paused'))) ORDER BY a.created_at LIMIT 32 FOR UPDATE OF r SKIP LOCKED")
        .fetch_all(&mut *db).await.map_err(db_error)?;
    for row in rows {
        let owner: String = row.get("owner_user_id");
        let token: Uuid = row.get("attempt_id");
        let mut run = repo::lock(db, &owner, row.get("run_id")).await?;
        // Superseded permits a late receipt to be retained, never made current.
        sqlx::query("UPDATE ads.content_production_plan_attempts SET status='superseded',error_code=CASE WHEN status='running' THEN 'planning_outcome_unknown' ELSE 'planning_withdrawn' END,finished_at=NOW() WHERE attempt_id=$1 AND status IN ('queued','running')")
            .bind(token).execute(&mut *db).await.map_err(db_error)?;
        if run.active_attempt == Some(token) {
            run.active_attempt = None;
            run.execution_version = repo::next(run.execution_version)?;
            if run.status != "paused" {
                run.status = "waiting".into();
            }
            run.waiting_reason = Some("planning_failed".into());
            repo::save(db, &mut run).await?;
        }
    }
    Ok(())
}

// Last dispatch gate after preparation. Pausing before this point preserves the
// same queued intent; pausing after it may receive a result, but cannot render it.
pub(super) async fn ready(pool: &PgPool, claim: &Claim) -> AppResult<bool> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let run = repo::lock(&mut tx, &claim.owner, claim.run.run_id).await?;
    let live: bool = sqlx::query_scalar("SELECT status='running' AND expires_at>clock_timestamp() FROM ads.content_production_plan_attempts WHERE attempt_id=$1 AND run_id=$2")
        .bind(claim.token).bind(run.run_id).fetch_one(&mut *tx).await.map_err(db_error)?;
    let current = live
        && run.active_attempt == Some(claim.token)
        && run.execution_version == claim.run.execution_version;
    if current && run.status == "paused" {
        sqlx::query(
            "UPDATE ads.content_production_plan_attempts SET status='queued' WHERE attempt_id=$1",
        )
        .bind(claim.token)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    }
    if live && !(current && ["running", "paused"].contains(&run.status.as_str())) {
        sqlx::query("UPDATE ads.content_production_plan_attempts SET status='superseded',error_code='planning_withdrawn',finished_at=NOW() WHERE attempt_id=$1 AND status='running'")
            .bind(claim.token).execute(&mut *tx).await.map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(current && run.status == "running")
}
