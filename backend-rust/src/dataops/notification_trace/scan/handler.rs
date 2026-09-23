use std::{collections::HashSet, sync::Arc};

use axum::{extract::State, http::StatusCode, response::Response, Json};
use chrono::Utc;
use serde_json::{json, Value};

use crate::{auth::CurrentUser, state::AppState};

use super::{
    item::build_scan_item,
    options::parse_scan_options,
    response::{build_scan_response, sort_scan_items},
};
use crate::dataops::{
    access::dataops_access_denial,
    notification_trace::{
        append_unique_warning, format_notification_store_read_warning,
        list_notification_retry_groups,
    },
    responses::json_no_store,
};

pub(crate) async fn post_notification_trace_scan(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<Value>,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let options = parse_scan_options(payload);
    let started_at = Utc::now();
    let retry_groups_read =
        list_notification_retry_groups(state.as_ref(), options.lookback_hours, options.max_groups)
            .await;
    let mut warnings: Vec<String> = Vec::new();
    let mut warning_set: HashSet<String> = HashSet::new();

    if let Some(warning) = retry_groups_read.warning.as_ref() {
        append_unique_warning(
            &mut warnings,
            &mut warning_set,
            format_notification_store_read_warning("通知追踪分组", warning).as_str(),
        );
    }

    let mut items = Vec::with_capacity(retry_groups_read.items.len());
    for group in retry_groups_read.items.iter() {
        items.push(
            build_scan_item(
                state.as_ref(),
                group,
                options,
                &mut warnings,
                &mut warning_set,
            )
            .await,
        );
    }

    sort_scan_items(&mut items);
    let response =
        build_scan_response(started_at, options, retry_groups_read.mode, items, warnings);

    json_no_store(StatusCode::OK, json!(response))
}
