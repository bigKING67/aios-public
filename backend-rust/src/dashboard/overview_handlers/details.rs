use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use tracing::error;

use crate::state::AppState;

use super::super::{
    errors::normalize_overview_details_error_message,
    overview::{build_overview_details_query_sql, OverviewDetailsSqlOptions},
    params::OverviewDetailsQueryParams,
    query_runtime::{apply_overview_details_nowcast_prediction, run_dashboard_query_json},
    responses::{json_message_response, json_value_response},
    validation::{
        get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
        is_supported_platform, normalize_platform, resolve_max_query_date_range_days,
    },
};

pub(in crate::dashboard) async fn get_overview_details(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OverviewDetailsQueryParams>,
) -> Response {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let platform = normalize_platform(query.platform.as_deref());

    if start_date.is_none() || end_date.is_none() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date 必须为 YYYY-MM-DD",
        );
    }

    let start_date = start_date.expect("validated above");
    let end_date = end_date.expect("validated above");

    if !is_start_not_after_end(start_date.as_str(), end_date.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：开始日期不能大于结束日期",
        );
    }

    let max_range_days = resolve_max_query_date_range_days();
    if !is_date_range_within_limit(start_date.as_str(), end_date.as_str(), max_range_days) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            format!("参数校验失败：日期跨度不能超过 {max_range_days} 天").as_str(),
        );
    }

    if !is_supported_platform(platform.as_str()) {
        return json_message_response(StatusCode::BAD_REQUEST, "参数校验失败：platform 非法");
    }

    let sql = build_overview_details_query_sql(OverviewDetailsSqlOptions {
        start_date: start_date.as_str(),
        end_date: end_date.as_str(),
        platform: platform.as_str(),
    });

    let mut payload = match run_dashboard_query_json(&state.pool, sql.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_overview_details_error_message(raw_error.as_str());
            error!(target: "dashboard-overview-details", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    if let Err(raw_error) = apply_overview_details_nowcast_prediction(
        &state.pool,
        &mut payload,
        start_date.as_str(),
        end_date.as_str(),
        platform.as_str(),
    )
    .await
    {
        let message = normalize_overview_details_error_message(raw_error.as_str());
        error!(target: "dashboard-overview-details", raw_error = %raw_error, "query failed");
        return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
    }

    json_value_response(StatusCode::OK, payload)
}
