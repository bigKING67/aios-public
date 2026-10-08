use super::repository as repo;
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    marketing::content_assets::{
        delivery::build_object_read_url,
        production::{assets, repository::db_error, types::OutputProfile},
    },
    state::AppState,
};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

pub(super) async fn read(state: &AppState, user: &CurrentUser, id: Uuid) -> AppResult<Value> {
    let run = repo::get(&state.pool, &user.user_id, id).await?;
    let Some(job) = run.render_job_id else {
        return Ok(json!({"ready":false,"job":null}));
    };
    let row = sqlx::query("SELECT j.status,j.stage,j.error_message,j.output_object_key,j.receipt,l.execution_version,l.plan_revision FROM ads.content_production_jobs j JOIN ads.content_production_run_renders l ON l.job_id=j.job_id WHERE l.run_id=$1 AND j.job_id=$2")
        .bind(id).bind(job).fetch_one(&state.pool).await.map_err(db_error)?;
    let status: String = row.get("status");
    let ready = run.status == "succeeded"
        && status == "completed"
        && row.get::<i32, _>("execution_version") == run.execution_version
        && row.get::<i32, _>("plan_revision") == run.plan_revision;
    let mut result = json!({"ready":false,"job":{"jobId":job,"status":status,"stage":row.get::<String,_>("stage"),"errorMessage":row.get::<Option<String>,_>("error_message")},"playbackUrl":null});
    if run.request.max_auto_repairs > 0 {
        let (used, latest): (i64, Option<String>) = sqlx::query_as(
            "SELECT COUNT(*),(array_agg(j.receipt #>> '{host_auto_repair,status}' ORDER BY l.execution_version DESC))[1]
             FROM ads.content_production_run_renders l JOIN ads.content_production_jobs j ON j.job_id=l.job_id
             WHERE l.run_id=$1 AND j.receipt ? 'host_auto_repair'"
        ).bind(id).fetch_one(&state.pool).await.map_err(db_error)?;
        result["automaticRepair"] = json!({"maxRounds":run.request.max_auto_repairs,"roundsReserved":used,
            "budgetExhausted":used >= i64::from(run.request.max_auto_repairs),"latestStatus":latest,"deliveryApproved":false});
    }
    if status == "completed"
        && ["waiting", "paused"].contains(&run.status.as_str())
        && row.get::<i32, _>("execution_version") == run.execution_version
        && row.get::<i32, _>("plan_revision") == run.plan_revision
    {
        let receipt: Value = row.get("receipt");
        if receipt["host_caption_review"]["candidateRendered"] == true {
            assets::revalidate(state, user, &run.sources).await?;
            let mut db = state.pool.acquire().await.map_err(db_error)?;
            let plan = repo::plan(&mut db, id, run.plan_revision)
                .await?
                .ok_or_else(|| AppError::Conflict("候选方案已失效".into()))?;
            let snapshot: Value = sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1 AND revision=$2")
                .bind(run.project_id).bind(run.project_revision).fetch_one(&mut *db).await.map_err(db_error)?;
            if let Some(mut candidate) =
                super::caption_candidate::inspect(&run, job, &receipt, &snapshot, &plan.document)?
            {
                let key = candidate["objectKey"].as_str().ok_or(AppError::Internal)?;
                let playback = build_object_read_url(&state.settings, key)?;
                candidate
                    .as_object_mut()
                    .ok_or(AppError::Internal)?
                    .remove("objectKey");
                candidate["playbackUrl"] = json!(playback);
                result["captionCandidate"] = candidate;
            }
        }
    }
    if status == "completed"
        && ["waiting", "paused", "succeeded"].contains(&run.status.as_str())
        && row.get::<i32, _>("execution_version") == run.execution_version
        && row.get::<i32, _>("plan_revision") == run.plan_revision
    {
        let receipt: Value = row.get("receipt");
        if receipt.get("host_visual_review").is_some()
            || receipt["host_selected_semantic_review"]
                .get("followUp")
                .is_some()
        {
            assets::revalidate(state, user, &run.sources).await?;
            let snapshot: Value = sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1 AND revision=$2")
                .bind(run.project_id).bind(run.project_revision).fetch_one(&state.pool).await.map_err(db_error)?;
            if receipt.get("host_visual_review").is_some() {
                result["visualReview"] =
                    super::visual_review::inspect(&run, job, &receipt, &snapshot)?;
            }
            if receipt["host_selected_semantic_review"]
                .get("followUp")
                .is_some()
            {
                result["selectedReview"] =
                    super::selected_review::inspect(&run, job, &receipt, &snapshot)?;
            }
        }
    }
    if ready {
        assets::revalidate(state, user, &run.sources).await?;
        let receipt: Value = row.get("receipt");
        if !super::super::render_binding::receipt_matches(
            run.sources.render_binding.as_ref(),
            &receipt,
        ) {
            return Err(AppError::Conflict(
                "产物与任务冻结的渲染包不一致，不能交付".into(),
            ));
        }
        let inspection = &receipt["host_inspection"];
        if inspection["schema"] != "aios.media-inspection.v1" || inspection["status"] != "passed" {
            return Err(AppError::Conflict("产物检查回执缺失，不能交付".into()));
        }
        let profile = run.sources.output_profile;
        let (width, height) = profile
            .dimensions(&run.sources.aspect)
            .ok_or(AppError::Internal)?;
        let profile_json = json!(profile);
        let profile_matches = inspection["outputProfile"] == profile_json
            || (profile == OutputProfile::LegacyV1 && inspection.get("outputProfile").is_none());
        if !profile_matches
            || inspection["width"].as_u64() != Some(width)
            || inspection["height"].as_u64() != Some(height)
            || inspection["fps"].as_f64() != Some(30.0)
        {
            return Err(AppError::Conflict(
                "产物与冻结输出规格不一致，不能交付".into(),
            ));
        }
        let key: String = row.try_get("output_object_key").map_err(db_error)?;
        result["ready"] = json!(true);
        result["playbackUrl"] = json!(build_object_read_url(&state.settings, &key)?);
        result["inspection"] = json!({"scope":"technical","status":"passed","decode":inspection["decode"],"width":inspection["width"],"height":inspection["height"],"durationSeconds":inspection["durationSeconds"],"fps":inspection["fps"],"visual":"unverified","listening":"unverified","semantic":"unverified"});
        result["inspection"]["outputProfile"] = profile_json;
    }
    Ok(result)
}
