use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use tracing::error;

use crate::state::AppState;

use super::super::access::normalize_text_input;
use super::super::errors::normalize_live_goods_error_message;
use super::super::live_goods::{
    fetch_douyin_live_goods_as_of_date, fetch_douyin_live_goods_detail_rows,
    fetch_douyin_live_goods_tree,
};
use super::super::params::LiveGoodsQueryParams;
use super::super::responses::{json_message_response, json_value_response};
use super::super::validation::{
    get_validated_date_param, is_date_range_within_limit, is_start_not_after_end,
    normalize_platform, resolve_max_query_date_range_days,
};

pub(crate) async fn get_live_goods(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LiveGoodsQueryParams>,
) -> Response {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let platform = normalize_platform(query.platform.as_deref());
    let scope = normalize_text_input(query.scope.as_deref());
    let scope = if scope.is_empty() {
        "all".to_string()
    } else {
        scope
    };

    if start_date.is_none() || end_date.is_none() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date 必须为 YYYY-MM-DD",
        );
    }

    if platform != "douyin" {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：直播商品维度仅支持 platform=douyin",
        );
    }

    if !["all", "self", "influencer"].contains(&scope.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：scope 仅支持 all/self/influencer",
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

    let (as_of_date, tree) = match tokio::try_join!(
        fetch_douyin_live_goods_as_of_date(&state.pool, start_date.as_str(), end_date.as_str()),
        fetch_douyin_live_goods_tree(
            &state.pool,
            start_date.as_str(),
            end_date.as_str(),
            scope.as_str(),
        ),
    ) {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_live_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-live-goods", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(
        StatusCode::OK,
        json!({
            "startDate": start_date,
            "endDate": end_date,
            "platform": "douyin",
            "scope": scope,
            "asOfDate": as_of_date,
            "tree": tree,
        }),
    )
}

pub(crate) async fn get_live_goods_details(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LiveGoodsQueryParams>,
) -> Response {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let platform = normalize_platform(query.platform.as_deref());
    let scope = normalize_text_input(query.scope.as_deref());
    let scope = if scope.is_empty() {
        "all".to_string()
    } else {
        scope
    };

    if start_date.is_none() || end_date.is_none() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date 必须为 YYYY-MM-DD",
        );
    }

    if platform != "douyin" {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：直播商品明细导出仅支持 platform=douyin",
        );
    }

    if !["all", "self", "influencer"].contains(&scope.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：scope 仅支持 all/self/influencer",
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

    let payload = match fetch_douyin_live_goods_detail_rows(
        &state.pool,
        start_date.as_str(),
        end_date.as_str(),
        scope.as_str(),
    )
    .await
    {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_live_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-live-goods-details", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(StatusCode::OK, payload)
}
