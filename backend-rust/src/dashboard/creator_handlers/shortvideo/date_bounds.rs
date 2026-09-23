use std::sync::Arc;

use axum::{extract::State, http::StatusCode, response::Response};
use tracing::error;

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    errors::normalize_creator_shortvideo_error_message,
    query_runtime::run_dashboard_query_json,
    responses::{json_message_response, json_value_response},
    validation::can_access_creator_shortvideo_dashboard,
};
use super::super::sql::CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL;

pub(crate) async fn get_creator_shortvideo_date_bounds(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> Response {
    if !can_access_creator_shortvideo_dashboard(&current_user) {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号没有带货达人看板访问权限");
    }

    let payload =
        match run_dashboard_query_json(&state.pool, CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL).await {
            Ok(value) => value,
            Err(raw_error) => {
                let message = normalize_creator_shortvideo_error_message(raw_error.as_str());
                error!(
                    target: "dashboard-creator-shortvideo-date-bounds",
                    raw_error = %raw_error,
                    "query failed"
                );
                return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
            }
        };

    json_value_response(StatusCode::OK, payload)
}
