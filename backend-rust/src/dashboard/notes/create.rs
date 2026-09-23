use std::sync::Arc;

use axum::{
    extract::rejection::JsonRejection, extract::State, http::StatusCode, response::Response, Json,
};

use crate::{auth::CurrentUser, state::AppState};

use super::super::{
    access::normalize_text_input,
    responses::{json_message_response, json_response},
    validation::{is_note_platform, is_valid_date_literal},
};
use super::{
    actor::build_dashboard_note_actor,
    model::CreateDashboardNoteRequest,
    repository::{insert_note, CreateNoteInput},
    response_helpers::{database_error_response, validate_note_content},
};

pub(crate) async fn create_note(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    body: Result<Json<CreateDashboardNoteRequest>, JsonRejection>,
) -> Response {
    let Some(actor) = build_dashboard_note_actor(&current_user) else {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号缺少可识别身份标识");
    };
    if !actor.can_write {
        return json_message_response(StatusCode::FORBIDDEN, "仅运营/管理员/超级管理员可写日报");
    }

    let payload = match body {
        Ok(Json(value)) => value,
        Err(_) => return json_message_response(StatusCode::BAD_REQUEST, "请求体必须是 JSON"),
    };

    let note_date = normalize_text_input(payload.note_date.as_deref());
    let platform_raw = normalize_text_input(payload.platform.as_deref());
    let metric_key_raw = normalize_text_input(payload.metric_key.as_deref());
    let action_text = normalize_text_input(payload.action_text.as_deref());
    let reason_text = normalize_text_input(payload.reason_text.as_deref());
    let summary_text = normalize_text_input(payload.summary_text.as_deref());

    if !is_valid_date_literal(note_date.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：note_date 必须为 YYYY-MM-DD",
        );
    }
    if !is_note_platform(platform_raw.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：platform 必须是具体平台（不可为 overview）",
        );
    }
    if let Some(response) = validate_note_content(
        action_text.as_str(),
        reason_text.as_str(),
        summary_text.as_str(),
        metric_key_raw.as_str(),
    ) {
        return response;
    }

    let metric_key = if metric_key_raw.is_empty() {
        None
    } else {
        Some(metric_key_raw.as_str())
    };
    let created = match insert_note(
        &state.pool,
        CreateNoteInput {
            note_date: note_date.as_str(),
            platform: platform_raw.as_str(),
            metric_key,
            action_text: action_text.as_str(),
            reason_text: reason_text.as_str(),
            summary_text: summary_text.as_str(),
            actor_id: actor.actor_id.as_str(),
        },
    )
    .await
    {
        Ok(Some(value)) => value,
        Ok(None) => {
            return json_message_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "创建日报失败：未返回写入结果",
            )
        }
        Err(error) => return database_error_response("创建日报失败", error.as_str()),
    };

    json_response(StatusCode::CREATED, created)
}
