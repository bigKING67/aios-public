use axum::{http::StatusCode, response::Response};

use super::super::{
    responses::json_message_response,
    validation::{
        get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
        resolve_max_query_date_range_days,
    },
};

pub(super) struct GoodsCardDateRange {
    pub(super) start_date: String,
    pub(super) end_date: String,
    pub(super) prev_start_date: String,
    pub(super) prev_end_date: String,
}

pub(super) enum GoodsCardDateRangeError {
    MissingDate,
    InvalidOrder,
    RangeTooLarge(i64),
}

pub(super) fn parse_goods_card_date_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
    prev_start_date: Option<&str>,
    prev_end_date: Option<&str>,
) -> Result<GoodsCardDateRange, GoodsCardDateRangeError> {
    let start_date = get_validated_date_param(start_date);
    let end_date = get_validated_date_param(end_date);
    let prev_start_date = get_validated_date_param(prev_start_date);
    let prev_end_date = get_validated_date_param(prev_end_date);

    if start_date.is_none()
        || end_date.is_none()
        || prev_start_date.is_none()
        || prev_end_date.is_none()
    {
        return Err(GoodsCardDateRangeError::MissingDate);
    }

    let date_range = GoodsCardDateRange {
        start_date: start_date.expect("validated above"),
        end_date: end_date.expect("validated above"),
        prev_start_date: prev_start_date.expect("validated above"),
        prev_end_date: prev_end_date.expect("validated above"),
    };

    if !is_start_not_after_end(date_range.start_date.as_str(), date_range.end_date.as_str())
        || !is_start_not_after_end(
            date_range.prev_start_date.as_str(),
            date_range.prev_end_date.as_str(),
        )
    {
        return Err(GoodsCardDateRangeError::InvalidOrder);
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(
        date_range.start_date.as_str(),
        date_range.end_date.as_str(),
        max_range_days,
    ) || !is_date_range_within_limit(
        date_range.prev_start_date.as_str(),
        date_range.prev_end_date.as_str(),
        max_range_days,
    ) {
        return Err(GoodsCardDateRangeError::RangeTooLarge(max_range_days));
    }

    Ok(date_range)
}

pub(super) fn goods_card_date_range_error_response(error: GoodsCardDateRangeError) -> Response {
    let message = match error {
        GoodsCardDateRangeError::MissingDate => {
            "参数校验失败：start_date/end_date/prev_start_date/prev_end_date 必须为 YYYY-MM-DD"
                .to_string()
        }
        GoodsCardDateRangeError::InvalidOrder => {
            "参数校验失败：开始日期不能大于结束日期".to_string()
        }
        GoodsCardDateRangeError::RangeTooLarge(max_range_days) => {
            format!("参数校验失败：日期跨度不能超过 {max_range_days} 天")
        }
    };

    json_message_response(StatusCode::BAD_REQUEST, message.as_str())
}
