use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Response,
};

use crate::{auth::CurrentUser, state::AppState};

use super::super::{
    responses::{empty_response, json_message_response},
    validation::parse_note_id,
};
use super::{
    actor::build_dashboard_note_actor,
    repository::{fetch_note_by_id, soft_delete_note},
    response_helpers::database_error_response,
};

pub(crate) async fn delete_note(
    State(state): State<Arc<AppState>>,
    Path(note_id_raw): Path<String>,
    current_user: CurrentUser,
) -> Response {
    let Some(note_id) = parse_note_id(note_id_raw.as_str()) else {
        return json_message_response(StatusCode::BAD_REQUEST, "参数校验失败：id 必须是正整数");
    };

    let Some(actor) = build_dashboard_note_actor(&current_user) else {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号缺少可识别身份标识");
    };
    if !actor.can_write {
        return json_message_response(StatusCode::FORBIDDEN, "仅运营/管理员/超级管理员可删除日报");
    }

    let existing = match fetch_note_by_id(&state.pool, note_id).await {
        Ok(value) => value,
        Err(error) => return database_error_response("查询日报失败", error.as_str()),
    };
    let Some(existing) = existing else {
        return json_message_response(StatusCode::NOT_FOUND, "日报不存在或已删除");
    };

    if !actor.is_admin && existing.created_by != actor.actor_id {
        return json_message_response(StatusCode::FORBIDDEN, "仅作者或管理员可删除该日报");
    }

    let affected = match soft_delete_note(&state.pool, note_id, actor.actor_id.as_str()).await {
        Ok(value) => value,
        Err(error) => return database_error_response("删除日报失败", error.as_str()),
    };

    if affected < 1 {
        return json_message_response(StatusCode::NOT_FOUND, "日报不存在或已删除");
    }

    empty_response(StatusCode::NO_CONTENT)
}
