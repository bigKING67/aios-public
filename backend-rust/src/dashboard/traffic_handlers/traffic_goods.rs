use std::{sync::Arc, time::Instant};

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use sqlx::Row;
use tracing::error;

use crate::state::AppState;

use super::super::cache::{
    dashboard_cache_key, get_cached_dashboard_payload, set_cached_dashboard_payload,
};
use super::super::errors::normalize_traffic_goods_error_message;
use super::super::params::TrafficQueryParams;
use super::super::responses::{
    json_bytes_response_with_server_timing, json_message_response,
    json_value_response_with_server_timing,
};
use super::super::timing::DashboardTiming;
use super::super::traffic_goods::{
    build_traffic_goods_tree, get_traffic_goods_as_of_date_sql, get_traffic_goods_metrics_sql,
    traffic_goods_metric_row_from_pg_row, DashboardTrafficGoodsMetricRow,
};
use super::common::{as_of_date_from_rows, validate_traffic_query, ValidatedTrafficQuery};

pub(in crate::dashboard) async fn get_traffic_goods(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TrafficQueryParams>,
) -> Response {
    let mut timing = DashboardTiming::start();
    let phase_started_at = Instant::now();
    let validated = match validate_traffic_query(&query) {
        Ok(value) => value,
        Err(error) => return error.into_response(),
    };
    timing.mark_elapsed("validate", phase_started_at);
    let ValidatedTrafficQuery {
        start_date,
        end_date,
        prev_start_date,
        prev_end_date,
        platform,
    } = validated;

    let cache_key = dashboard_cache_key(
        "traffic_goods",
        &[
            ("start", start_date.as_str()),
            ("end", end_date.as_str()),
            ("prev_start", prev_start_date.as_str()),
            ("prev_end", prev_end_date.as_str()),
            ("platform", platform.as_str()),
        ],
    );
    let phase_started_at = Instant::now();
    if let Some(payload) = get_cached_dashboard_payload(
        cache_key.as_str(),
        state.settings.dashboard_api_cache_ttl_ms,
    )
    .await
    {
        timing.mark_elapsed("cache_hit", phase_started_at);
        return json_bytes_response_with_server_timing(
            StatusCode::OK,
            payload,
            timing.header_value(),
        );
    }
    timing.mark_elapsed("cache_miss", phase_started_at);

    let phase_started_at = Instant::now();
    let mut connection = match state.pool.acquire().await {
        Ok(value) => value,
        Err(error) => {
            let raw_error = error.to_string();
            let message = normalize_traffic_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-traffic-goods", raw_error = %raw_error, "db acquire failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };
    timing.mark_elapsed("db_acquire", phase_started_at);

    let phase_started_at = Instant::now();
    let metrics_payload_rows = match sqlx::query(get_traffic_goods_metrics_sql())
        .bind(start_date.as_str())
        .bind(end_date.as_str())
        .bind(prev_start_date.as_str())
        .bind(prev_end_date.as_str())
        .fetch_all(&mut *connection)
        .await
    {
        Ok(value) => value,
        Err(error) => {
            let raw_error = error.to_string();
            let message = normalize_traffic_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-traffic-goods", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };
    timing.mark_elapsed("metrics_query", phase_started_at);
    drop(connection);

    let phase_started_at = Instant::now();
    let mut metrics_as_of_date = None;
    let mut metrics_rows = Vec::<DashboardTrafficGoodsMetricRow>::new();
    for row in metrics_payload_rows {
        if metrics_as_of_date.is_none() {
            metrics_as_of_date = match row.try_get::<Option<String>, _>("as_of_date") {
                Ok(value) => value,
                Err(error) => {
                    let raw_error = error.to_string();
                    let message = normalize_traffic_goods_error_message(raw_error.as_str());
                    error!(target: "dashboard-traffic-goods", raw_error = %raw_error, "query failed");
                    return json_message_response(
                        StatusCode::SERVICE_UNAVAILABLE,
                        message.as_str(),
                    );
                }
            };
        }

        let metric_row = match traffic_goods_metric_row_from_pg_row(&row) {
            Ok(value) => value,
            Err(error) => {
                let raw_error = error.to_string();
                let message = normalize_traffic_goods_error_message(raw_error.as_str());
                error!(target: "dashboard-traffic-goods", raw_error = %raw_error, "query failed");
                return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
            }
        };

        metrics_rows.push(metric_row);
    }
    timing.mark_elapsed("metrics_decode", phase_started_at);

    let as_of_date = if let Some(value) = metrics_as_of_date {
        value
    } else {
        let phase_started_at = Instant::now();
        let as_of_rows = match sqlx::query(get_traffic_goods_as_of_date_sql())
            .bind(start_date.as_str())
            .bind(end_date.as_str())
            .fetch_all(&state.pool)
            .await
        {
            Ok(value) => value,
            Err(error) => {
                let raw_error = error.to_string();
                let message = normalize_traffic_goods_error_message(raw_error.as_str());
                error!(target: "dashboard-traffic-goods", raw_error = %raw_error, "query failed");
                return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
            }
        };
        timing.mark_elapsed("as_of_query", phase_started_at);
        as_of_date_from_rows(as_of_rows.as_slice(), end_date.as_str())
    };

    let phase_started_at = Instant::now();
    let tree = build_traffic_goods_tree(metrics_rows.as_slice());
    timing.mark_elapsed("tree_build", phase_started_at);

    let phase_started_at = Instant::now();
    let payload = json!({
        "startDate": start_date,
        "endDate": end_date,
        "prevStartDate": prev_start_date,
        "prevEndDate": prev_end_date,
        "platform": platform,
        "asOfDate": as_of_date,
        "tree": tree,
    });
    timing.mark_elapsed("payload_build", phase_started_at);

    let phase_started_at = Instant::now();
    set_cached_dashboard_payload(
        cache_key.as_str(),
        &payload,
        state.settings.dashboard_api_cache_ttl_ms,
    )
    .await;
    timing.mark_elapsed("cache_write", phase_started_at);

    json_value_response_with_server_timing(StatusCode::OK, payload, timing.header_value())
}
