use crate::error::{AppError, AppResult};

pub(super) fn normalize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .map(|item| {
            if item.chars().count() > max_len {
                item.chars().take(max_len).collect()
            } else {
                item
            }
        })
}

pub(super) fn normalize_required_text(
    value: Option<String>,
    max_len: usize,
    error_message: &str,
) -> AppResult<String> {
    normalize_optional_text(value, max_len).ok_or_else(|| AppError::bad_request(error_message))
}
