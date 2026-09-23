mod attribution;
mod diagnosis;
mod platform_snapshot;

use serde_json::json;

use super::super::{
    normalize_week_period_for_api, WeeklyReportResponse, WEEKLY_SUMMARY_SCOPE_TMALL,
};
use attribution::{build_channel_attribution_top, build_product_attribution_top};
use diagnosis::build_channel_diagnosis;
use platform_snapshot::build_tmall_platform_snapshot;

pub(super) fn build_tmall_weekly_summary_facts(
    report: &WeeklyReportResponse,
    week_period: &str,
) -> serde_json::Value {
    json!({
        "summary_scope": WEEKLY_SUMMARY_SCOPE_TMALL,
        "week_period": normalize_week_period_for_api(week_period),
        "tmall_platform_snapshot": build_tmall_platform_snapshot(report),
        "product_attribution_top": build_product_attribution_top(report),
        "channel_attribution_top": build_channel_attribution_top(report),
        "channel_diagnosis": build_channel_diagnosis(report),
    })
}
