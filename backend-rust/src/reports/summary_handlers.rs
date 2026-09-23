use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::json;
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    summary_generation::{
        check_generate_rate_limit, normalize_weekly_summary_scope,
        prepare_weekly_summary_generation, run_weekly_summary_job,
    },
    summary_jobs::{PrepareWeeklySummaryGenerationInput, WeeklySummaryJob},
    summary_storage::ensure_weekly_summary_storage,
    types::{WeeklySummaryGeneratePayload, WeeklySummaryGenerateResponse},
    weekly_query::resolve_week_period,
    REPORT_READ_PERMISSIONS, REPORT_SUMMARY_GENERATE_PERMISSIONS,
};

pub(super) async fn generate_weekly_summary(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(report_id): Path<String>,
    Json(payload): Json<WeeklySummaryGeneratePayload>,
) -> AppResult<Json<WeeklySummaryGenerateResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    ensure_any_permission(&current_user, &REPORT_SUMMARY_GENERATE_PERMISSIONS)?;
    ensure_weekly_summary_storage(&state.pool).await?;
    check_generate_rate_limit(&state, &current_user).await?;

    let query_period = resolve_week_period(
        &state.pool,
        report_id.as_str(),
        payload.week_period.as_deref(),
    )
    .await?;
    let summary_scope = normalize_weekly_summary_scope(payload.summary_scope.as_deref());

    let provider = payload
        .provider
        .clone()
        .unwrap_or_else(|| state.settings.llm_default_provider.clone())
        .trim()
        .to_lowercase();

    if provider != "kimi" && provider != "deepseek" {
        return Err(AppError::bad_request(format!(
            "Unsupported provider: {provider}"
        )));
    }

    let model = {
        let custom = payload.model.clone().unwrap_or_default().trim().to_string();
        if !custom.is_empty() {
            custom
        } else if !state.settings.llm_default_model.trim().is_empty() {
            state.settings.llm_default_model.clone()
        } else if provider == "kimi" {
            state.settings.kimi_model.clone()
        } else {
            state.settings.deepseek_model.clone()
        }
    };

    let prompt_config = json!({
        "summary_scope": summary_scope.clone(),
        "business_framework": payload.business_framework.clone().unwrap_or_default(),
        "custom_prompt": payload.custom_prompt.clone().unwrap_or_default(),
    });

    let facts_snapshot_overrides = payload.facts_data.clone().unwrap_or_else(|| json!({}));
    let requested_by = current_user
        .username
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
    let task_id = Uuid::new_v4().simple().to_string();

    let prepared = prepare_weekly_summary_generation(PrepareWeeklySummaryGenerationInput {
        pool: &state.pool,
        week_period: query_period.as_str(),
        summary_scope: summary_scope.as_str(),
        task_id: task_id.as_str(),
        provider: provider.as_str(),
        model: model.as_str(),
        prompt_config: prompt_config.clone(),
        facts_snapshot: facts_snapshot_overrides.clone(),
        requested_by: requested_by.as_str(),
        force_regenerate: payload.force_regenerate,
        retry: payload.retry,
    })
    .await?;

    if prepared.should_enqueue {
        let app_state = Arc::clone(&state);
        let week_period = query_period.clone();
        let week_summary_scope = summary_scope.clone();
        let background_task_id = prepared.task_id.clone();
        let background_provider = provider.clone();
        let background_model = model.clone();
        let background_prompt_config = prompt_config.clone();
        let background_facts_snapshot_overrides = facts_snapshot_overrides.clone();

        tokio::spawn(async move {
            if let Err(error) = run_weekly_summary_job(WeeklySummaryJob {
                state: app_state,
                week_period,
                summary_scope: week_summary_scope,
                task_id: background_task_id,
                provider: background_provider,
                model: background_model,
                prompt_config: background_prompt_config,
                facts_snapshot_overrides: background_facts_snapshot_overrides,
            })
            .await
            {
                error!(?error, "weekly summary background task failed");
            }
        });
    }

    let message = if prepared.should_enqueue {
        "Summary generation queued. Use /summary-status to check progress.".to_string()
    } else if prepared.status == "SUCCESS" {
        "Summary already exists. Use force_regenerate=true to regenerate.".to_string()
    } else {
        "Summary generation is already in progress.".to_string()
    };

    Ok(Json(WeeklySummaryGenerateResponse {
        report_id,
        week_period: query_period,
        summary_scope,
        task_id: Some(prepared.task_id),
        status: prepared.status,
        queued: prepared.should_enqueue,
        message,
    }))
}
