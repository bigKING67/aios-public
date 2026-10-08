//! Park the existing planning intent while one same-source preprocessing job runs.
use super::{planning_queue::Claim, repository as repo};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
    state::AppState,
};
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

pub(super) async fn ready(state: &AppState, claim: &Claim) -> AppResult<bool> {
    if !claim.run.request.generate_captions {
        return Ok(true);
    }
    let mut tx = state.pool.begin().await.map_err(db_error)?;
    let mut run = repo::lock(&mut tx, &claim.owner, claim.run.run_id).await?;
    if run.status == "paused" && run.active_attempt == Some(claim.token) {
        sqlx::query("UPDATE ads.content_production_plan_attempts SET status='queued',expires_at=clock_timestamp()+INTERVAL '10 seconds' WHERE attempt_id=$1 AND status='running'")
            .bind(claim.token).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        return Ok(false);
    }
    if run.status != "running"
        || run.active_attempt != Some(claim.token)
        || run.execution_version != claim.run.execution_version
    {
        return Ok(false);
    }
    let source = run
        .sources
        .assets
        .iter()
        .find(|a| Some(a.asset_id) == run.request.narration_asset_id)
        .ok_or_else(|| AppError::bad_request("缺少主讲原片"))?;
    // Serialize same-asset jobs across Runs; verify the frozen source under this lock.
    let current = sqlx::query("SELECT raw_object_key,raw_sha256 FROM ads.marketing_content_assets WHERE asset_id=$1 FOR UPDATE")
        .bind(source.asset_id).fetch_one(&mut *tx).await.map_err(db_error)?;
    if current
        .get::<Option<String>, _>("raw_object_key")
        .as_deref()
        != Some(&source.object_key)
        || current.get::<Option<String>, _>("raw_sha256").as_deref() != Some(&source.sha256)
    {
        return Err(AppError::Conflict("主讲原片版本已改变".into()));
    }
    let transcript: Option<serde_json::Value> = sqlx::query_scalar("SELECT metadata FROM ads.marketing_content_asset_transcripts WHERE asset_id=$1 AND status='active' AND provider='seed_asr' AND source_object_key=$2 AND metadata->>'source_sha256'=$3 ORDER BY created_at DESC LIMIT 1")
        .bind(source.asset_id).bind(&source.object_key).bind(&source.sha256).fetch_optional(&mut *tx).await.map_err(db_error)?;
    if let Some(metadata) = transcript {
        if !metadata.get("caption_plan").is_some_and(|v| v.is_object()) {
            return Err(AppError::bad_request(
                "逐字ASR已完成但字幕未生成；不会重新收费转写",
            ));
        }
        tx.commit().await.map_err(db_error)?;
        return Ok(true);
    }
    let expired: bool = sqlx::query_scalar("SELECT created_at < clock_timestamp()-INTERVAL '30 minutes' FROM ads.content_production_plan_attempts WHERE attempt_id=$1")
        .bind(claim.token).fetch_one(&mut *tx).await.map_err(db_error)?;
    if expired {
        return Err(AppError::bad_request("等待字幕预处理超时"));
    }
    let job: Option<String> = sqlx::query_scalar("SELECT status FROM ads.marketing_content_asset_processing_jobs WHERE asset_id=$1 AND job_type='transcript' AND input_object_key=$2 AND metadata->>'source_sha256'=$3 AND metadata->>'caption_required'='true' ORDER BY created_at DESC LIMIT 1")
        .bind(source.asset_id).bind(&source.object_key).bind(&source.sha256).fetch_optional(&mut *tx).await.map_err(db_error)?;
    match job.as_deref() {
        Some("queued" | "running") => {}
        Some(_) => {
            return Err(AppError::bad_request(
                "字幕预处理失败或结果不可用；不会自动重复收费",
            ))
        }
        None => {
            sqlx::query("INSERT INTO ads.marketing_content_asset_processing_jobs(job_id,asset_id,job_type,status,input_object_key,max_attempts,metadata) VALUES($1,$2,'transcript','queued',$3,1,$4)")
                .bind(Uuid::new_v4()).bind(source.asset_id).bind(&source.object_key)
                .bind(json!({"created_by":"content-production-run","transcript_source":"raw","source_sha256":source.sha256,"caption_required":true}))
                .execute(&mut *tx).await.map_err(db_error)?;
        }
    }
    sqlx::query("UPDATE ads.content_production_plan_attempts SET status='queued',expires_at=clock_timestamp()+INTERVAL '10 seconds' WHERE attempt_id=$1 AND status='running'")
        .bind(claim.token).execute(&mut *tx).await.map_err(db_error)?;
    run.waiting_reason = Some("caption_preprocessing".into());
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(false)
}
