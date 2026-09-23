use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use tracing::error;

use crate::state::AppState;

use super::super::{
    access::normalize_text_input,
    errors::normalize_goods_card_error_message,
    goods_card::build_goods_card_query_sql,
    params::TrafficQueryParams,
    query_runtime::run_dashboard_query_json,
    responses::{json_message_response, json_value_response},
    validation::GOODS_CARD_SUPPORTED_PLATFORMS,
};
use super::validation::{goods_card_date_range_error_response, parse_goods_card_date_range};

pub(in crate::dashboard) async fn get_goods_card(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TrafficQueryParams>,
) -> Response {
    let platform = normalize_text_input(query.platform.as_deref());
    let platform = if platform.is_empty() {
        "douyin".to_string()
    } else {
        platform
    };

    let date_range = match parse_goods_card_date_range(
        query.start_date.as_deref(),
        query.end_date.as_deref(),
        query.prev_start_date.as_deref(),
        query.prev_end_date.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => return goods_card_date_range_error_response(error),
    };

    if !GOODS_CARD_SUPPORTED_PLATFORMS.contains(&platform.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：商品卡维度仅支持 platform=douyin",
        );
    }

    let sql = build_goods_card_query_sql(
        date_range.start_date.as_str(),
        date_range.end_date.as_str(),
        date_range.prev_start_date.as_str(),
        date_range.prev_end_date.as_str(),
    );

    let payload = match run_dashboard_query_json(&state.pool, sql.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_goods_card_error_message(raw_error.as_str());
            error!(target: "dashboard-goods-card", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(StatusCode::OK, payload)
}
