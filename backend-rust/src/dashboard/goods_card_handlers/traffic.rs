use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use sqlx::Row;
use tracing::error;

use crate::state::AppState;

use super::super::{
    access::normalize_text_input,
    errors::normalize_goods_card_traffic_error_message,
    goods_card_traffic::{
        build_goods_card_traffic_tree, get_goods_card_traffic_meta_sql,
        get_goods_card_traffic_metrics_sql, goods_card_traffic_metric_row_from_pg_row,
        DashboardGoodsCardTrafficMetricRow,
    },
    params::GoodsCardTrafficQueryParams,
    responses::{json_message_response, json_value_response},
    validation::GOODS_CARD_SUPPORTED_PLATFORMS,
};
use super::validation::{goods_card_date_range_error_response, parse_goods_card_date_range};

pub(in crate::dashboard) async fn get_goods_card_traffic(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GoodsCardTrafficQueryParams>,
) -> Response {
    let platform = normalize_text_input(query.platform.as_deref());
    let platform = if platform.is_empty() {
        "douyin".to_string()
    } else {
        platform
    };
    let product_id = normalize_text_input(query.product_id.as_deref());
    let shop_id = normalize_text_input(query.shop_id.as_deref());

    if product_id.is_empty() {
        return json_message_response(StatusCode::BAD_REQUEST, "参数校验失败：product_id 不能为空");
    }

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
            "参数校验失败：商品卡流量来源仅支持 platform=douyin",
        );
    }

    let shop_id_filter = if shop_id.is_empty() {
        None
    } else {
        Some(shop_id.as_str())
    };

    let rows = match sqlx::query(get_goods_card_traffic_metrics_sql())
        .bind(date_range.start_date.as_str())
        .bind(date_range.end_date.as_str())
        .bind(date_range.prev_start_date.as_str())
        .bind(date_range.prev_end_date.as_str())
        .bind(product_id.as_str())
        .bind(shop_id_filter)
        .fetch_all(&state.pool)
        .await
    {
        Ok(value) => value,
        Err(error) => {
            let raw_error = error.to_string();
            let message = normalize_goods_card_traffic_error_message(raw_error.as_str());
            error!(target: "dashboard-goods-card-traffic", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    let mut metrics_rows = Vec::<DashboardGoodsCardTrafficMetricRow>::new();
    for row in rows {
        let metric_row = match goods_card_traffic_metric_row_from_pg_row(&row) {
            Ok(value) => value,
            Err(raw_error) => {
                let message = normalize_goods_card_traffic_error_message(raw_error.as_str());
                error!(target: "dashboard-goods-card-traffic", raw_error = %raw_error, "query failed");
                return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
            }
        };
        metrics_rows.push(metric_row);
    }

    let meta_row = match sqlx::query(get_goods_card_traffic_meta_sql())
        .bind(date_range.start_date.as_str())
        .bind(date_range.end_date.as_str())
        .bind(product_id.as_str())
        .bind(shop_id_filter)
        .fetch_one(&state.pool)
        .await
    {
        Ok(value) => value,
        Err(error) => {
            let raw_error = error.to_string();
            let message = normalize_goods_card_traffic_error_message(raw_error.as_str());
            error!(target: "dashboard-goods-card-traffic", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    let as_of_date = meta_row
        .try_get::<Option<String>, _>("as_of_date")
        .ok()
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| date_range.end_date.clone());
    let product_title = meta_row
        .try_get::<Option<String>, _>("product_title")
        .ok()
        .flatten()
        .unwrap_or_default();
    let resolved_shop_id = meta_row
        .try_get::<Option<String>, _>("shop_id")
        .ok()
        .flatten()
        .unwrap_or_else(|| shop_id.clone());

    json_value_response(
        StatusCode::OK,
        json!({
            "startDate": date_range.start_date,
            "endDate": date_range.end_date,
            "prevStartDate": date_range.prev_start_date,
            "prevEndDate": date_range.prev_end_date,
            "platform": platform,
            "asOfDate": as_of_date,
            "productId": product_id,
            "shopId": resolved_shop_id,
            "productTitle": product_title,
            "tree": build_goods_card_traffic_tree(metrics_rows.as_slice()),
        }),
    )
}
