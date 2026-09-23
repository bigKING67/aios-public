use axum::{http::StatusCode, response::Response};

use super::super::super::{
    params::LiveQueryParams,
    responses::json_message_response,
    validation::{
        get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
        normalize_platform, resolve_max_query_date_range_days,
    },
};

pub(super) struct ShortVideoQueryDates {
    pub(super) start_date: String,
    pub(super) end_date: String,
    pub(super) prev_start_date: String,
    pub(super) prev_end_date: String,
}

pub(super) enum ShortVideoQueryError {
    InvalidDates,
    UnsupportedPlatform,
    ReversedDateRange,
    DateRangeTooLong(i64),
}

impl ShortVideoQueryError {
    pub(super) fn into_response(self) -> Response {
        match self {
            Self::InvalidDates => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：start_date/end_date/prev_start_date/prev_end_date 必须为 YYYY-MM-DD",
            ),
            Self::UnsupportedPlatform => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：短视频维度仅支持 platform=douyin",
            ),
            Self::ReversedDateRange => json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：开始日期不能大于结束日期",
            ),
            Self::DateRangeTooLong(max_range_days) => json_message_response(
                StatusCode::BAD_REQUEST,
                format!("参数校验失败：日期跨度不能超过 {max_range_days} 天").as_str(),
            ),
        }
    }
}

pub(super) fn validate_short_video_query(
    query: LiveQueryParams,
) -> Result<ShortVideoQueryDates, ShortVideoQueryError> {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let prev_start_date = get_validated_date_param(query.prev_start_date.as_deref());
    let prev_end_date = get_validated_date_param(query.prev_end_date.as_deref());
    let platform = normalize_platform(query.platform.as_deref());

    if start_date.is_none()
        || end_date.is_none()
        || prev_start_date.is_none()
        || prev_end_date.is_none()
    {
        return Err(ShortVideoQueryError::InvalidDates);
    }

    if platform != "douyin" {
        return Err(ShortVideoQueryError::UnsupportedPlatform);
    }

    let dates = ShortVideoQueryDates {
        start_date: start_date.expect("validated above"),
        end_date: end_date.expect("validated above"),
        prev_start_date: prev_start_date.expect("validated above"),
        prev_end_date: prev_end_date.expect("validated above"),
    };

    if !is_start_not_after_end(dates.start_date.as_str(), dates.end_date.as_str())
        || !is_start_not_after_end(dates.prev_start_date.as_str(), dates.prev_end_date.as_str())
    {
        return Err(ShortVideoQueryError::ReversedDateRange);
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(
        dates.start_date.as_str(),
        dates.end_date.as_str(),
        max_range_days,
    ) || !is_date_range_within_limit(
        dates.prev_start_date.as_str(),
        dates.prev_end_date.as_str(),
        max_range_days,
    ) {
        return Err(ShortVideoQueryError::DateRangeTooLong(max_range_days));
    }

    Ok(dates)
}
