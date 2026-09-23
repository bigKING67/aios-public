use axum::{http::StatusCode, response::Response};

use super::super::{
    responses::json_message_response,
    validation::{validate_note_text, NOTE_METRIC_KEY_MAX_LENGTH, NOTE_TEXT_MAX_LENGTH},
};
use super::errors::normalize_database_error_message;

pub(super) fn validate_note_content(
    action_text: &str,
    reason_text: &str,
    summary_text: &str,
    metric_key: &str,
) -> Option<Response> {
    if let Some(error) = validate_note_text("动作", action_text, NOTE_TEXT_MAX_LENGTH) {
        return Some(json_message_response(
            StatusCode::BAD_REQUEST,
            error.as_str(),
        ));
    }
    if let Some(error) = validate_note_text("原因", reason_text, NOTE_TEXT_MAX_LENGTH) {
        return Some(json_message_response(
            StatusCode::BAD_REQUEST,
            error.as_str(),
        ));
    }
    if let Some(error) = validate_note_text("说明", summary_text, NOTE_TEXT_MAX_LENGTH) {
        return Some(json_message_response(
            StatusCode::BAD_REQUEST,
            error.as_str(),
        ));
    }
    if metric_key.len() > NOTE_METRIC_KEY_MAX_LENGTH {
        return Some(json_message_response(
            StatusCode::BAD_REQUEST,
            "metric_key 不能超过 32 个字符",
        ));
    }

    None
}

pub(super) fn database_error_response(prefix: &str, error: &str) -> Response {
    let message = format!("{prefix}：{}", normalize_database_error_message(error));
    json_message_response(StatusCode::INTERNAL_SERVER_ERROR, message.as_str())
}
