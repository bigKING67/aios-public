use crate::error::{AppError, AppResult};

use super::super::common::normalize_text;

pub(super) fn normalize_fans_band(value: Option<String>) -> AppResult<Option<String>> {
    normalize_allowed_filter(
        value,
        &["lt_10w", "10w_50w", "50w_100w", "100w_500w", "gte_500w"],
        "粉丝量级参数不合法",
    )
}

pub(super) fn normalize_last_follow_range(value: Option<String>) -> AppResult<Option<String>> {
    normalize_allowed_filter(
        value,
        &["none", "over_30d", "over_14d", "within_7d"],
        "跟进时间参数不合法",
    )
}

pub(super) fn normalize_ownership(value: Option<String>) -> AppResult<Option<String>> {
    normalize_allowed_filter(
        value,
        &["public_seed", "mine", "others"],
        "录入归属参数不合法",
    )
}

pub(super) fn normalize_mcn_status(value: Option<String>) -> AppResult<Option<String>> {
    normalize_allowed_filter(value, &["registered", "missing"], "MCN 状态参数不合法")
}

fn normalize_allowed_filter(
    value: Option<String>,
    allowed: &[&str],
    error_message: &str,
) -> AppResult<Option<String>> {
    let Some(value) = value.and_then(normalize_text) else {
        return Ok(None);
    };

    if allowed.contains(&value.as_str()) {
        Ok(Some(value))
    } else {
        Err(AppError::bad_request(error_message))
    }
}
