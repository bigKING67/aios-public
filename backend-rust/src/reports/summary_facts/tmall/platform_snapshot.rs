use serde_json::json;

use super::super::super::WeeklyReportResponse;
use super::super::platform::{
    is_tmall_platform_name, normalize_platform_key, platform_display_name_zh,
};

pub(super) fn build_tmall_platform_snapshot(report: &WeeklyReportResponse) -> serde_json::Value {
    report
        .charts
        .platforms
        .iter()
        .find(|item| is_tmall_platform_name(item.platform.as_str()))
        .map(|item| {
            json!({
                "platform": platform_display_name_zh(item.platform.as_str()),
                "platform_code": normalize_platform_key(item.platform.as_str()),
                "gmv": item.gmv,
                "prev_gmv": item.prev_gmv,
                "wow": item.wow,
                "contribution": item.contribution,
                "orders": item.orders,
                "uv": item.uv,
                "cvr": item.cvr,
                "pay_cvr": item.pay_cvr,
                "arpu": item.arpu,
                "uv_value": item.uv_value,
                "refund_amount_refund_time": item.refund_amount_refund_time,
                "refund_amount_pay_time": item.refund_amount_pay_time,
                "visitor_count": item.visitor_count,
            })
        })
        .unwrap_or_else(|| json!({}))
}
