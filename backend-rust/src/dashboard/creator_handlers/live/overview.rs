use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use tracing::error;

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    creator_live_overview::{build_creator_live_overview_query_sql, CreatorLiveOverviewSqlOptions},
    errors::normalize_creator_live_error_message,
    params::CreatorLiveOverviewQueryParams,
    query_runtime::run_dashboard_query_json,
    responses::{json_message_response, json_value_response},
    validation::{
        can_access_creator_dashboard_by_role, get_validated_date_param, is_date_range_within_limit,
        is_start_not_after_end, resolve_creator_live_max_query_date_range_days,
    },
};

pub(crate) async fn get_creator_live_overview(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CreatorLiveOverviewQueryParams>,
    current_user: CurrentUser,
) -> Response {
    if !can_access_creator_dashboard_by_role(&current_user.roles) {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号没有带货达人看板访问权限");
    }

    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let prev_start_date = get_validated_date_param(query.prev_start_date.as_deref());
    let prev_end_date = get_validated_date_param(query.prev_end_date.as_deref());

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

    let max_range_days = resolve_creator_live_max_query_date_range_days();
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

    let sql = build_creator_live_overview_query_sql(CreatorLiveOverviewSqlOptions {
        start_date: start_date.as_str(),
        end_date: end_date.as_str(),
        prev_start_date: prev_start_date.as_str(),
        prev_end_date: prev_end_date.as_str(),
    });

    let payload = match run_dashboard_query_json(&state.pool, sql.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_creator_live_error_message(raw_error.as_str());
            error!(target: "dashboard-creator-live-overview", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(StatusCode::OK, payload)
}
