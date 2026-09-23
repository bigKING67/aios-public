use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

use super::{
    list_handlers::list_reports,
    monthly_handlers::{
        get_all_month_periods_handler, get_latest_month_period_handler, get_monthly_by_period,
        get_monthly_metadata, get_monthly_report,
    },
    summary_content::{
        get_weekly_summary_content, get_weekly_summary_status, update_weekly_summary_content,
    },
    summary_handlers::generate_weekly_summary,
    weekly_handlers::{
        get_all_week_periods_handler, get_latest_week_period_handler, get_weekly_by_period,
        get_weekly_metadata, get_weekly_report,
    },
};

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_reports))
        .route("/weekly/by-period", get(get_weekly_by_period))
        .route("/weekly/latest-period", get(get_latest_week_period_handler))
        .route("/weekly/all-periods", get(get_all_week_periods_handler))
        .route("/weekly/{report_id}/meta", get(get_weekly_metadata))
        .route("/weekly/{report_id}", get(get_weekly_report))
        .route(
            "/weekly/{report_id}/generate-summary",
            post(generate_weekly_summary),
        )
        .route(
            "/weekly/{report_id}/summary-status",
            get(get_weekly_summary_status),
        )
        .route(
            "/weekly/{report_id}/summary",
            get(get_weekly_summary_content).put(update_weekly_summary_content),
        )
        .route("/monthly/by-period", get(get_monthly_by_period))
        .route(
            "/monthly/latest-period",
            get(get_latest_month_period_handler),
        )
        .route("/monthly/all-periods", get(get_all_month_periods_handler))
        .route("/monthly/{month_period}/meta", get(get_monthly_metadata))
        .route("/monthly/{month_period}", get(get_monthly_report))
}
