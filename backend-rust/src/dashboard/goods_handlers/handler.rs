use std::{sync::Arc, time::Instant};

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use tracing::error;

use crate::state::AppState;

use super::super::cache::{
    dashboard_cache_key, get_cached_dashboard_payload, set_cached_dashboard_payload,
};
use super::super::errors::normalize_goods_error_message;
use super::super::params::GoodsQueryParams;
use super::super::responses::{
    json_bytes_response_with_server_timing, json_message_response,
    json_value_response_with_server_timing,
};
use super::super::timing::DashboardTiming;
use super::as_of::fetch_goods_as_of_date;
use super::metrics_query::fetch_goods_metrics_rows;
use super::request::validate_goods_query;
use super::response::build_goods_payload;

pub(in crate::dashboard) async fn get_goods(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GoodsQueryParams>,
) -> Response {
    let mut timing = DashboardTiming::start();
    let phase_started_at = Instant::now();
    let validated = match validate_goods_query(&query) {
        Ok(value) => value,
        Err(error) => return error.into_response(),
    };
    timing.mark_elapsed("validate", phase_started_at);

    let top_n = validated.top_n.to_string();
    let score_pool_n = validated.score_pool_n.to_string();
    let cache_key = dashboard_cache_key(
        "goods",
        &[
            ("start", validated.start_date.as_str()),
            ("end", validated.end_date.as_str()),
            ("prev_start", validated.prev_start_date.as_str()),
            ("prev_end", validated.prev_end_date.as_str()),
            ("platform", validated.platform.as_str()),
            ("top_n", top_n.as_str()),
            ("score_pool_n", score_pool_n.as_str()),
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
            let message = normalize_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-goods", raw_error = %raw_error, "db acquire failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };
    timing.mark_elapsed("db_acquire", phase_started_at);

    let phase_started_at = Instant::now();
    let metrics_result = match fetch_goods_metrics_rows(&mut connection, &validated).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_goods_error_message(raw_error.as_str());
            error!(target: "dashboard-goods", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };
    timing.mark_elapsed("metrics_fetch", phase_started_at);
    drop(connection);

    let as_of_date = if let Some(value) = metrics_result.as_of_date.clone() {
        value
    } else {
        let phase_started_at = Instant::now();
        let value = match fetch_goods_as_of_date(
            &state.pool,
            validated.start_date.as_str(),
            validated.end_date.as_str(),
        )
        .await
        {
            Ok(value) => value,
            Err(raw_error) => {
                let message = normalize_goods_error_message(raw_error.as_str());
                error!(target: "dashboard-goods", raw_error = %raw_error, "query failed");
                return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
            }
        };
        timing.mark_elapsed("as_of_query", phase_started_at);
        value
    };

    let phase_started_at = Instant::now();
    let payload = build_goods_payload(
        &validated,
        as_of_date.as_str(),
        metrics_result.rows.as_slice(),
    );
    timing.mark_elapsed("response_build", phase_started_at);

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
