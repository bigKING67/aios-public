use std::{cmp, sync::Arc};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};
use chrono::NaiveDate;

use super::{
    cache_runtime::{get_monthly_periods_with_cache, get_weekly_periods_with_cache},
    handler_cache::should_bypass_backend_report_cache,
    periods::{extract_month_period_sort_date, extract_week_period_sort_date},
    types::{ListReportsQuery, ReportListItem, ReportsListResponse},
    REPORT_READ_PERMISSIONS,
};

pub(super) async fn list_reports(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<ListReportsQuery>,
) -> AppResult<Json<ReportsListResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);

    let limit = cmp::min(query.limit.unwrap_or(20).max(1), 200);
    let offset = query.offset.unwrap_or(0).max(0);
    let report_type_filter = query
        .report_type
        .clone()
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let mut items = Vec::new();
    let fetch_limit = 200;

    if report_type_filter.is_empty() {
        let (weekly_periods, monthly_periods) = tokio::try_join!(
            get_weekly_periods_with_cache(&state, fetch_limit, bypass_cache),
            get_monthly_periods_with_cache(&state, fetch_limit, bypass_cache)
        )?;

        let fallback_sort_date = NaiveDate::from_ymd_opt(1970, 1, 1).expect("valid fallback date");
        let mut merged_items: Vec<(NaiveDate, String, ReportListItem)> =
            Vec::with_capacity(weekly_periods.len() + monthly_periods.len());

        for item in weekly_periods {
            let sort_date =
                extract_week_period_sort_date(item.value.as_str()).unwrap_or(fallback_sort_date);
            merged_items.push((
                sort_date,
                "weekly".to_string(),
                ReportListItem {
                    report_type: "weekly".to_string(),
                    report_id: item.value,
                    label: item.label,
                },
            ));
        }

        for item in monthly_periods {
            let sort_date =
                extract_month_period_sort_date(item.value.as_str()).unwrap_or(fallback_sort_date);
            merged_items.push((
                sort_date,
                "monthly".to_string(),
                ReportListItem {
                    report_type: "monthly".to_string(),
                    report_id: item.value,
                    label: item.label,
                },
            ));
        }

        merged_items.sort_by(|left, right| {
            right
                .0
                .cmp(&left.0)
                .then_with(|| left.1.cmp(&right.1))
                .then_with(|| left.2.report_id.cmp(&right.2.report_id))
        });

        items = merged_items
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .map(|(_, _, item)| item)
            .collect();
    } else if report_type_filter == "weekly" {
        let weekly_periods =
            get_weekly_periods_with_cache(&state, fetch_limit, bypass_cache).await?;
        let sliced = weekly_periods
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .map(|item| ReportListItem {
                report_type: "weekly".to_string(),
                report_id: item.value,
                label: item.label,
            });
        items.extend(sliced);
    } else if report_type_filter == "monthly" {
        let monthly_periods =
            get_monthly_periods_with_cache(&state, fetch_limit, bypass_cache).await?;
        let sliced = monthly_periods
            .into_iter()
            .skip(offset as usize)
            .take(limit as usize)
            .map(|item| ReportListItem {
                report_type: "monthly".to_string(),
                report_id: item.value,
                label: item.label,
            });
        items.extend(sliced);
    }

    let count = items.len();

    Ok(Json(ReportsListResponse {
        items,
        limit,
        offset,
        count,
    }))
}
