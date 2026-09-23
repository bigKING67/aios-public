use axum::{http::StatusCode, response::Response};
use serde_json::json;

use crate::auth::CurrentUser;

use super::responses::json_no_store;

pub(super) fn resolve_operator(user: &CurrentUser) -> String {
    user.username
        .clone()
        .unwrap_or_else(|| "dataops.user".to_string())
}

pub(super) fn dataops_access_denial(user: &CurrentUser) -> Option<Response> {
    if user.is_admin() {
        return None;
    }

    Some(json_no_store(
        StatusCode::FORBIDDEN,
        json!({"message": "仅超级管理员可访问数据运维能力"}),
    ))
}
