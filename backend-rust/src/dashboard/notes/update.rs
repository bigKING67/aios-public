use std::sync::Arc;

use axum::{
    extract::{rejection::JsonRejection, Path, State},
    http::StatusCode,
    response::Response,
    Json,
};

use crate::{auth::CurrentUser, state::AppState};

use super::super::{
    access::normalize_text_input,
    responses::{json_message_response, json_response},
    validation::parse_note_id,
};
use super::{
    actor::build_dashboard_note_actor,
    model::UpdateDashboardNoteRequest,
    repository::{fetch_note_by_id, update_note_entity, UpdateNoteInput},
    response_helpers::{database_error_response, validate_note_content},
};

pub(crate) async fn update_note(
    State(state): State<Arc<AppState>>,
    Path(note_id_raw): Path<String>,
    current_user: CurrentUser,
    body: Result<Json<UpdateDashboardNoteRequest>, JsonRejection>,
) -> Response {
    let Some(note_id) = parse_note_id(note_id_raw.as_str()) else {
        return json_message_response(StatusCode::BAD_REQUEST, "参数校验失败：id 必须是正整数");
    };

    let Some(actor) = build_dashboard_note_actor(&current_user) else {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号缺少可识别身份标识");
    };
    if !actor.can_write {
        return json_message_response(StatusCode::FORBIDDEN, "仅运营/管理员/超级管理员可修改日报");
    }

    let existing = match fetch_note_by_id(&state.pool, note_id).await {
        Ok(value) => value,
        Err(error) => return database_error_response("查询日报失败", error.as_str()),
    };
    let Some(existing) = existing else {
        return json_message_response(StatusCode::NOT_FOUND, "日报不存在或已删除");
    };

    if !actor.is_admin && existing.created_by != actor.actor_id {
        return json_message_response(StatusCode::FORBIDDEN, "仅作者或管理员可修改该日报");
    }

    let payload = match body {
        Ok(Json(value)) => value,
        Err(_) => return json_message_response(StatusCode::BAD_REQUEST, "请求体必须是 JSON"),
    };

    let action_text_raw = normalize_text_input(payload.action_text.as_deref());
    let reason_text_raw = normalize_text_input(payload.reason_text.as_deref());
    let summary_text_raw = normalize_text_input(payload.summary_text.as_deref());
    let metric_key_raw = normalize_text_input(payload.metric_key.as_deref());

    let next_action_text = if action_text_raw.is_empty() {
        existing.action_text.clone()
    } else {
        action_text_raw
    };
    let next_reason_text = if reason_text_raw.is_empty() {
        existing.reason_text.clone()
    } else {
        reason_text_raw
    };
    let next_summary_text = if summary_text_raw.is_empty() {
        existing.summary_text.clone()
    } else {
        summary_text_raw
    };
    let next_metric_key = if metric_key_raw.is_empty() {
        existing.metric_key.clone()
    } else {
        Some(metric_key_raw)
    };

    if let Some(response) = validate_note_content(
        next_action_text.as_str(),
        next_reason_text.as_str(),
        next_summary_text.as_str(),
        next_metric_key.as_deref().unwrap_or_default(),
    ) {
        return response;
    }

    let updated = match update_note_entity(
        &state.pool,
        UpdateNoteInput {
            note_id,
            metric_key: next_metric_key.as_deref(),
            action_text: next_action_text.as_str(),
            reason_text: next_reason_text.as_str(),
            summary_text: next_summary_text.as_str(),
            actor_id: actor.actor_id.as_str(),
        },
    )
    .await
    {
        Ok(Some(value)) => value,
        Ok(None) => return json_message_response(StatusCode::NOT_FOUND, "日报不存在或已删除"),
        Err(error) => return database_error_response("修改日报失败", error.as_str()),
    };

    json_response(StatusCode::OK, updated)
}
