use super::{attempts, evidence_planning, planning_queue as queue, types::PlanDocument};
use crate::{
    auth::{fetch_user_profile, CurrentUser},
    error::{AppError, AppResult},
    marketing::content_assets::production::assets,
    state::AppState,
};
use std::{sync::Arc, time::Duration};

pub(crate) fn spawn(state: Arc<AppState>) -> Vec<tokio::task::JoinHandle<()>> {
    if !enabled(&state) {
        return vec![];
    }
    let mut workers: Vec<_> = (0..2)
        .map(|_| {
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                loop {
                    if let Err(error) = step(&state).await {
                        // Do not log model responses, transcript text or credentials.
                        tracing::warn!(
                            status = error.status_code().as_u16(),
                            "content planning worker step failed"
                        );
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            })
        })
        .collect();
    workers.push(tokio::spawn(async move {
        loop {
            if let Err(error) = super::automatic_repair::step(&state).await {
                tracing::warn!(
                    status = error.status_code().as_u16(),
                    "content automatic repair step failed"
                );
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }));
    workers
}

fn enabled(state: &AppState) -> bool {
    state.settings.content_production_enabled
        && state.settings.content_production_runs_enabled
        && state.settings.content_production_planning_enabled
}

pub(super) async fn owner(state: &AppState, id: &str) -> AppResult<CurrentUser> {
    let profile = fetch_user_profile(&state.pool, id)
        .await?
        .filter(|profile| profile.is_active)
        .ok_or(AppError::Forbidden)?;
    let user = CurrentUser {
        user_id: profile.id,
        username: Some(profile.username),
        roles: profile.roles,
        permissions: profile.permissions,
    };
    super::guard(state, &user, true)?;
    Ok(user)
}

pub(super) async fn step(state: &AppState) -> AppResult<bool> {
    if !enabled(state) {
        return Ok(false);
    }
    let Some(claim) = queue::claim(&state.pool).await? else {
        return Ok(false);
    };
    let outcome =
        tokio::time::timeout(Duration::from_secs(180), prepare_and_call(state, &claim)).await;
    match outcome {
        Ok(Ok(Some(result))) => {
            attempts::finish_and_dispatch(
                &state.pool,
                &claim.owner,
                claim.run.run_id,
                claim.token,
                result,
            )
            .await?;
        }
        // Paused while preparing: ready() put the same intent back in the queue.
        Ok(Ok(None)) => {}
        failed => {
            let code = if matches!(
                failed,
                Ok(Err(AppError::Forbidden | AppError::Unauthorized))
            ) {
                "planning_access_denied"
            } else if failed.is_err() {
                "planning_outcome_unknown"
            } else {
                "planning_failed"
            };
            attempts::finish(
                &state.pool,
                &claim.owner,
                claim.run.run_id,
                claim.token,
                Err(code),
            )
            .await?;
        }
    }
    Ok(true)
}

async fn prepare_and_call(
    state: &AppState,
    claim: &queue::Claim,
) -> AppResult<Option<(PlanDocument, serde_json::Value)>> {
    let run = &claim.run;
    if !run.request.model_call_confirmed {
        return Err(AppError::Forbidden);
    }
    let user = owner(state, &claim.owner).await?;
    assets::revalidate(state, &user, &run.sources).await?;
    if !super::caption_dependency::ready(state, claim).await? {
        return Ok(None);
    }
    let captions = super::caption_source::load(state, &user, run).await?;
    let mut prepared = evidence_planning::prepare(state, &user, run).await?;
    if !super::caption_preflight_planning::ready(state, claim, &mut prepared).await? {
        return Ok(None);
    }
    let user = owner(state, &claim.owner).await?;
    assets::revalidate(state, &user, &run.sources).await?;
    if !queue::ready(&state.pool, claim).await? {
        return Ok(None);
    }
    let mut result = evidence_planning::complete(state, &user, run, prepared).await?;
    let user = owner(state, &claim.owner).await?;
    assets::revalidate(state, &user, &run.sources).await?;
    if let Some((captions, receipt)) = captions {
        result.0.narration_captions = Some(captions);
        super::captions::validate(&result.0, &run.request, &run.sources)?;
        result.1["narrationCaptions"] = receipt;
        result.1["limitations"] = serde_json::json!([
            "字幕来自同版本原片的预处理结果，未完成专业质量评价",
            "保留指定主讲原片固定时长，仅替换画面，不生成新镜头"
        ]);
    }
    Ok(Some(result))
}

// A second provider call must not outlive the task's active, unpaused intent.
pub(super) async fn repair_allowed(
    state: &AppState,
    user: &CurrentUser,
    run: &super::types::Run,
) -> AppResult<()> {
    let current_user = owner(state, &user.user_id).await?;
    assets::revalidate(state, &current_user, &run.sources).await?;
    let allowed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ads.content_production_runs r JOIN ads.content_production_plan_attempts a ON a.attempt_id=r.active_attempt AND a.run_id=r.run_id WHERE r.run_id=$1 AND r.owner_user_id=$2 AND r.active_attempt=$3 AND r.execution_version=$4 AND a.execution_version=$4 AND r.status='running' AND NOT r.pause_requested AND a.status='running' AND a.expires_at>clock_timestamp())")
        .bind(run.run_id).bind(&user.user_id).bind(run.active_attempt).bind(run.execution_version)
        .fetch_one(&state.pool).await.map_err(super::super::repository::db_error)?;
    if !allowed {
        return Err(AppError::Conflict(
            "任务已暂停、撤销或过期，不执行规划修订".into(),
        ));
    }
    Ok(())
}
