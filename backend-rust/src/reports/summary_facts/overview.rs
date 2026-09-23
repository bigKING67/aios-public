use serde_json::json;

use super::super::{normalize_week_period_for_api, WeeklyReportResponse};
use super::platform::{normalize_platform_key, platform_display_name_zh};

pub(super) fn build_overview_weekly_summary_facts(
    report: &WeeklyReportResponse,
    week_period: &str,
    summary_scope: &str,
) -> serde_json::Value {
    let kpis = report
        .kpis
        .iter()
        .map(|kpi| {
            json!({
                "label": kpi.label,
                "value": kpi.value,
                "display_value": kpi.display_value,
                "wow": kpi.wow,
            })
        })
        .collect::<Vec<_>>();

    let platforms = report
        .charts
        .platforms
        .iter()
        .take(6)
        .map(|platform| {
            let platform_code = normalize_platform_key(platform.platform.as_str());
            let platform_name = platform_display_name_zh(platform.platform.as_str());
            json!({
                "name": platform_name,
                "platform_code": platform_code,
                "gmv": platform.gmv,
                "prev_gmv": platform.prev_gmv,
                "contribution": platform.contribution,
                "wow": platform.wow,
                "orders": platform.orders,
                "uv": platform.uv,
                "cvr": platform.cvr,
            })
        })
        .collect::<Vec<_>>();

    json!({
        "summary_scope": summary_scope,
        "week_period": normalize_week_period_for_api(week_period),
        "kpis": kpis,
        "platforms": platforms,
    })
}
