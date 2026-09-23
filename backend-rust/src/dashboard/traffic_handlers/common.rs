use axum::{http::StatusCode, response::Response};
use sqlx::{postgres::PgRow, Row};

use super::super::access::normalize_text_input;
use super::super::params::TrafficQueryParams;
use super::super::responses::json_message_response;
use super::super::validation::{
    get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
    resolve_max_query_date_range_days, TRAFFIC_SUPPORTED_PLATFORMS,
};

pub(super) struct ValidatedTrafficQuery {
    pub(super) start_date: String,
    pub(super) end_date: String,
    pub(super) prev_start_date: String,
    pub(super) prev_end_date: String,
    pub(super) platform: String,
}

pub(super) enum TrafficQueryValidationError {
    MissingDateRange,
    StartAfterEnd,
    RangeTooLarge(i64),
    UnsupportedPlatform,
}

impl TrafficQueryValidationError {
    pub(super) fn into_response(self) -> Response {
        match self {
            Self::MissingDateRange => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：start_date/end_date/prev_start_date/prev_end_date 必须为 YYYY-MM-DD",
            ),
            Self::StartAfterEnd => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：开始日期不能大于结束日期",
            ),
            Self::RangeTooLarge(max_range_days) => json_message_response(
                StatusCode::BAD_REQUEST,
                format!("参数校验失败：日期跨度不能超过 {max_range_days} 天").as_str(),
            ),
            Self::UnsupportedPlatform => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：platform 非法，当前仅支持 taobao",
            ),
        }
    }
}

pub(super) fn validate_traffic_query(
    query: &TrafficQueryParams,
) -> Result<ValidatedTrafficQuery, TrafficQueryValidationError> {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let prev_start_date = get_validated_date_param(query.prev_start_date.as_deref());
    let prev_end_date = get_validated_date_param(query.prev_end_date.as_deref());
    let platform = normalize_text_input(query.platform.as_deref());
    let platform = if platform.is_empty() {
        "taobao".to_string()
    } else {
        platform
    };

    if start_date.is_none()
        || end_date.is_none()
        || prev_start_date.is_none()
        || prev_end_date.is_none()
    {
        return Err(TrafficQueryValidationError::MissingDateRange);
    }

    let start_date = start_date.expect("validated above");
    let end_date = end_date.expect("validated above");
    let prev_start_date = prev_start_date.expect("validated above");
    let prev_end_date = prev_end_date.expect("validated above");

    if !is_start_not_after_end(start_date.as_str(), end_date.as_str())
        || !is_start_not_after_end(prev_start_date.as_str(), prev_end_date.as_str())
    {
        return Err(TrafficQueryValidationError::StartAfterEnd);
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(start_date.as_str(), end_date.as_str(), max_range_days)
        || !is_date_range_within_limit(
            prev_start_date.as_str(),
            prev_end_date.as_str(),
            max_range_days,
        )
    {
        return Err(TrafficQueryValidationError::RangeTooLarge(max_range_days));
    }

    if !TRAFFIC_SUPPORTED_PLATFORMS.contains(&platform.as_str()) {
        return Err(TrafficQueryValidationError::UnsupportedPlatform);
    }

    Ok(ValidatedTrafficQuery {
        start_date,
        end_date,
        prev_start_date,
        prev_end_date,
        platform,
    })
}

pub(super) fn as_of_date_from_rows(rows: &[PgRow], end_date: &str) -> String {
    rows.first()
        .and_then(|row| {
            row.try_get::<Option<String>, _>("as_of_date")
                .ok()
                .flatten()
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| end_date.to_string())
}
