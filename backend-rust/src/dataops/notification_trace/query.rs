use std::collections::HashMap;
use std::sync::Arc;

use axum::{extract::Query, extract::State, http::StatusCode, response::Response};
use chrono::Utc;
use serde_json::json;

use crate::auth::CurrentUser;

use super::super::{
    access::dataops_access_denial,
    notification_slo::evaluate_notification_trace_slo,
    parse_retry_group_id,
    responses::json_no_store,
    time::format_shanghai_datetime_from_utc,
    types::{DataOpsNotificationTraceResponse, NotificationTraceQuery},
    DATAOPS_CONFIG,
};
use super::{
    build_notification_trace_reason_hash_recovery, build_notification_trace_summary,
    format_notification_store_read_warning, DEFAULT_TRACE_LIMIT, MAX_TRACE_LIMIT,
};
use crate::state::AppState;

pub(crate) async fn get_notification_trace(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<NotificationTraceQuery>,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let retry_group_id_raw = query.retry_group_id.unwrap_or_default();
    let retry_group_id = match parse_retry_group_id(Some(retry_group_id_raw.as_str())) {
        Ok(value) => value,
        Err(message) => return json_no_store(StatusCode::BAD_REQUEST, json!({"message": message})),
    };

    let limit = query
        .limit
        .map(|value| value.clamp(1, MAX_TRACE_LIMIT))
        .unwrap_or(DEFAULT_TRACE_LIMIT);

    let read_result =
        super::super::runtime_store::list_notification_events_by_retry_group_with_store(
            state.as_ref(),
            retry_group_id.as_str(),
            limit,
        )
        .await;
    let mut events = read_result.items;
    events.sort_by(|left, right| {
        let diff = super::super::time::to_dataops_timestamp(right.sent_at.as_str())
            - super::super::time::to_dataops_timestamp(left.sent_at.as_str());
        if diff != 0 {
            return diff.cmp(&0);
        }
        right.id.cmp(&left.id)
    });

    let channel_name_map = DATAOPS_CONFIG
        .notification_channels
        .iter()
        .filter(|channel| channel.enabled && !channel.status.eq_ignore_ascii_case("paused"))
        .map(|channel| (channel.id.clone(), channel.channel_name.clone()))
        .collect::<HashMap<_, _>>();

    let reason_hash_recovery = build_notification_trace_reason_hash_recovery(events.as_slice());
    let slo_status = evaluate_notification_trace_slo(
        state.as_ref(),
        retry_group_id.as_str(),
        reason_hash_recovery.as_slice(),
        false,
    )
    .await;

    let mut warnings = Vec::new();
    if let Some(warning) = read_result.warning.as_ref() {
        warnings.push(format_notification_store_read_warning(
            "通知追踪事件",
            warning,
        ));
    }
    if let Some(warning) = slo_status.warning.clone() {
        warnings.push(warning);
    }

    let summary = build_notification_trace_summary(events.clone(), channel_name_map);
    let payload = DataOpsNotificationTraceResponse {
        snapshot_at: format_shanghai_datetime_from_utc(Utc::now()),
        retry_group_id,
        events,
        summary,
        reason_hash_recovery,
        slo: slo_status,
        source: read_result.mode,
        warnings,
    };

    json_no_store(StatusCode::OK, json!(payload))
}
