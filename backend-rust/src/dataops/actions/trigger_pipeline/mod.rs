use axum::http::StatusCode;

use crate::{auth::CurrentUser, state::AppState};

use self::{
    audit::append_trigger_pipeline_audit,
    lock::{acquire_pipeline_trigger_lock, handle_pipeline_lock_conflict},
    prefect_run::trigger_pipeline_flow_run,
    success::handle_pipeline_trigger_success,
};
use super::super::{
    action_validation::validate_trigger_parameters, responses::action_error,
    types::DataOpsActionRequest,
};
use super::resolve_pipeline;

mod audit;
mod lock;
mod prefect_run;
mod success;

pub(crate) async fn handle_trigger_pipeline(
    state: &AppState,
    current_user: &CurrentUser,
    request: DataOpsActionRequest,
) -> axum::response::Response {
    let pipeline = resolve_pipeline(request.pipeline_id.as_deref());
    let pipeline = match pipeline {
        Some(item) => item,
        None => {
            return action_error(
                StatusCode::BAD_REQUEST,
                "trigger_pipeline",
                "pipelineId 无效",
                request.pipeline_id,
                None,
                None,
            )
        }
    };

    if rejects_batch_trigger(request.batch_execution, pipeline.batch_trigger_allowed) {
        let message = "该任务包含外部投递副作用，不支持批量触发，请使用单任务确认流程";
        append_trigger_pipeline_audit(
            state,
            current_user,
            pipeline.name.as_str(),
            "失败",
            message.to_string(),
        )
        .await;
        return action_error(
            StatusCode::BAD_REQUEST,
            "trigger_pipeline",
            message,
            Some(pipeline.id.clone()),
            None,
            None,
        );
    }

    let validation = validate_trigger_parameters(pipeline.id.as_str(), request.parameters.as_ref());
    if !validation.errors.is_empty() {
        let message = format!("参数校验失败：{}", validation.errors.join("；"));
        append_trigger_pipeline_audit(
            state,
            current_user,
            pipeline.name.as_str(),
            "失败",
            message.clone(),
        )
        .await;

        return action_error(
            StatusCode::BAD_REQUEST,
            "trigger_pipeline",
            message.as_str(),
            Some(pipeline.id.clone()),
            None,
            None,
        );
    }

    let lock_result = acquire_pipeline_trigger_lock(state, pipeline.id.as_str()).await;
    if !lock_result.acquired {
        return handle_pipeline_lock_conflict(state, current_user, &pipeline, lock_result).await;
    }

    match trigger_pipeline_flow_run(state, &pipeline, validation.parameters.clone()).await {
        Ok(run) => {
            handle_pipeline_trigger_success(
                state,
                current_user,
                &pipeline,
                run,
                validation.parameters,
                lock_result,
            )
            .await
        }
        Err((status, message)) => {
            append_trigger_pipeline_audit(
                state,
                current_user,
                pipeline.name.as_str(),
                "失败",
                message.clone(),
            )
            .await;

            action_error(
                status,
                "trigger_pipeline",
                message.as_str(),
                Some(pipeline.id.clone()),
                None,
                None,
            )
        }
    }
}

fn rejects_batch_trigger(batch_execution: bool, batch_trigger_allowed: bool) -> bool {
    batch_execution && !batch_trigger_allowed
}

#[cfg(test)]
mod tests {
    use super::rejects_batch_trigger;

    #[test]
    fn external_effect_pipeline_rejects_built_in_batch_path() {
        assert!(rejects_batch_trigger(true, false));
        assert!(!rejects_batch_trigger(false, false));
        assert!(!rejects_batch_trigger(true, true));
    }
}
