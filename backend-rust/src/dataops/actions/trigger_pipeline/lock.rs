use axum::{http::StatusCode, response::Response};

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    responses::action_error_with_lock, runtime_store::try_acquire_trigger_lock,
    runtime_store_types::RuntimeLockResult, types::DataOpsPipeline,
};
use super::{
    super::{
        lock_detail_with_optional_warning, lock_fallback_warning_text,
        DATAOPS_TRIGGER_LOCK_NAMESPACE,
    },
    audit::append_trigger_pipeline_audit,
};

const PIPELINE_TRIGGER_LOCK_TTL_MS: i64 = 2 * 60 * 1000;

pub(super) async fn acquire_pipeline_trigger_lock(
    state: &AppState,
    pipeline_id: &str,
) -> RuntimeLockResult {
    try_acquire_trigger_lock(
        state,
        format!("{}:{}", DATAOPS_TRIGGER_LOCK_NAMESPACE, pipeline_id).as_str(),
        PIPELINE_TRIGGER_LOCK_TTL_MS,
    )
    .await
}

pub(super) async fn handle_pipeline_lock_conflict(
    state: &AppState,
    current_user: &CurrentUser,
    pipeline: &DataOpsPipeline,
    lock_result: RuntimeLockResult,
) -> Response {
    let message = format!("任务「{}」正在触发中，请勿重复提交", pipeline.name);
    append_trigger_pipeline_audit(
        state,
        current_user,
        pipeline.name.as_str(),
        "失败",
        lock_detail_with_optional_warning(
            message.as_str(),
            lock_result.mode.as_str(),
            lock_result.warning.as_ref(),
        ),
    )
    .await;

    action_error_with_lock(
        StatusCode::CONFLICT,
        "trigger_pipeline",
        message.as_str(),
        Some(pipeline.id.clone()),
        None,
        Some(lock_result.mode),
        lock_fallback_warning_text(lock_result.warning.as_ref()),
    )
}
