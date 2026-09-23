use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use tracing::error;

use crate::state::AppState;

use super::super::errors::normalize_live_error_message;
use super::super::live_details::fetch_douyin_live_detail_rows_bundle;
use super::super::live_summary::{
    fetch_douyin_live_as_of_date, fetch_douyin_live_data_date_bounds,
    fetch_douyin_live_totals_bundle, fetch_douyin_live_trend_bundle,
};
use super::super::params::LiveQueryParams;
use super::super::responses::{json_message_response, json_value_response};
use super::super::validation::{
    get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
    normalize_platform, resolve_max_query_date_range_days,
};

pub(crate) async fn get_live(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LiveQueryParams>,
) -> Response {
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
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date/prev_start_date/prev_end_date 必须为 YYYY-MM-DD",
        );
    }

    if platform != "douyin" {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：直播维度仅支持 platform=douyin",
        );
    }

    let start_date = start_date.expect("validated above");
    let end_date = end_date.expect("validated above");
    let prev_start_date = prev_start_date.expect("validated above");
    let prev_end_date = prev_end_date.expect("validated above");

    if !is_start_not_after_end(start_date.as_str(), end_date.as_str())
        || !is_start_not_after_end(prev_start_date.as_str(), prev_end_date.as_str())
    {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：开始日期不能大于结束日期",
        );
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(start_date.as_str(), end_date.as_str(), max_range_days)
        || !is_date_range_within_limit(
            prev_start_date.as_str(),
            prev_end_date.as_str(),
            max_range_days,
        )
    {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            format!("参数校验失败：日期跨度不能超过 {max_range_days} 天").as_str(),
        );
    }

    let (
        (min_date, max_date),
        as_of_date,
        (
            overview_current_totals,
            overview_previous_totals,
            self_current_totals,
            self_previous_totals,
            influencer_current_totals,
            influencer_previous_totals,
        ),
        (overview_trend, self_trend, influencer_trend),
        (self_detail_rows, influencer_detail_rows),
    ) = match tokio::try_join!(
        fetch_douyin_live_data_date_bounds(&state.pool),
        fetch_douyin_live_as_of_date(&state.pool, start_date.as_str(), end_date.as_str()),
        fetch_douyin_live_totals_bundle(
            &state.pool,
            start_date.as_str(),
            end_date.as_str(),
            prev_start_date.as_str(),
            prev_end_date.as_str(),
        ),
        fetch_douyin_live_trend_bundle(&state.pool, start_date.as_str(), end_date.as_str()),
        fetch_douyin_live_detail_rows_bundle(&state.pool, start_date.as_str(), end_date.as_str()),
    ) {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_live_error_message(raw_error.as_str());
            error!(target: "dashboard-live", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    let payload = json!({
      "startDate": start_date,
      "endDate": end_date,
      "prevStartDate": prev_start_date,
      "prevEndDate": prev_end_date,
      "platform": "douyin",
      "asOfDate": as_of_date,
      "dataDateBounds": {
        "minDate": min_date,
        "maxDate": max_date
      },
      "overview": {
        "currentTotals": overview_current_totals,
        "previousTotals": overview_previous_totals,
        "trend": overview_trend
      },
      "selfLive": {
        "currentTotals": self_current_totals,
        "previousTotals": self_previous_totals,
        "trend": self_trend,
        "rows": self_detail_rows
      },
      "influencerLive": {
        "currentTotals": influencer_current_totals,
        "previousTotals": influencer_previous_totals,
        "trend": influencer_trend,
        "rows": influencer_detail_rows
      }
    });

    json_value_response(StatusCode::OK, payload)
}
