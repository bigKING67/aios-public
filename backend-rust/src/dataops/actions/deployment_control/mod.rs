mod audit;

use axum::http::StatusCode;

use crate::{auth::CurrentUser, state::AppState};

use super::super::{
    prefect::{get_deployment_by_name, patch_deployment_paused},
    responses::{action_error, action_success},
    types::DataOpsActionRequest,
};
use super::resolve_pipeline;

pub(crate) async fn handle_pause_or_resume(
    state: &AppState,
    current_user: &CurrentUser,
    request: DataOpsActionRequest,
) -> axum::response::Response {
    let action = request.action.as_str();
    let pipeline = resolve_pipeline(request.pipeline_id.as_deref());
    let pipeline = match pipeline {
        Some(item) => item,
        None => {
            return action_error(
                StatusCode::BAD_REQUEST,
                action,
                "pipelineId 无效",
                request.pipeline_id,
                None,
                None,
            )
        }
    };

    let deployment = match get_deployment_by_name(
        state,
        pipeline.flow_name.as_str(),
        pipeline.deployment_name.as_str(),
    )
    .await
    {
        Ok(Some(item)) => item,
        Ok(None) => {
            let message = format!(
                "未找到 Deployment：{}/{}",
                pipeline.flow_name, pipeline.deployment_name
            );
            return action_error(
                StatusCode::NOT_FOUND,
                action,
                message.as_str(),
                Some(pipeline.id.clone()),
                None,
                None,
            );
        }
        Err(error) => {
            let message = format!("{}调度失败：{}", action_verb(action), error.message);
            return action_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                action,
                message.as_str(),
                Some(pipeline.id.clone()),
                None,
                None,
            );
        }
    };

    let patch_result =
        patch_deployment_paused(state, deployment.id.as_str(), action == "pause_deployment").await;

    match patch_result {
        Ok(()) => {
            let success_message = format!("已{}「{}」调度", action_verb(action), pipeline.name);
            audit::append_deployment_control_audit_event(
                state,
                current_user,
                action,
                pipeline.name.as_str(),
                "成功",
                format!(
                    "{}（{}）",
                    success_message,
                    super::super::time::format_shanghai_datetime_from_utc(chrono::Utc::now())
                ),
            )
            .await;

            action_success(
                StatusCode::OK,
                action,
                success_message.as_str(),
                Some(pipeline.id.clone()),
                None,
                Some(serde_json::json!({
                    "runtimeStatus": if action == "pause_deployment" { "paused" } else { "healthy" },
                })),
            )
        }
        Err(error) => {
            let message = format!("{}调度失败：{}", action_verb(action), error.message);
            audit::append_deployment_control_audit_event(
                state,
                current_user,
                action,
                pipeline.name.as_str(),
                "失败",
                message.clone(),
            )
            .await;

            action_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                action,
                message.as_str(),
                Some(pipeline.id.clone()),
                None,
                None,
            )
        }
    }
}

fn action_verb(action: &str) -> &'static str {
    if action == "pause_deployment" {
        "暂停"
    } else {
        "恢复"
    }
}
