use super::super::periods::{normalize_month_period_for_api, normalize_week_period_for_api};

// 版本号用于主动失效历史缓存，避免 ETL/字段口径变更后继续命中旧报表明细。
const WEEKLY_DETAIL_CACHE_VERSION: &str = "v5";
const MONTHLY_DETAIL_CACHE_VERSION: &str = "v2";

pub(in crate::reports) fn weekly_report_cache_key(week_period: &str, data_version: &str) -> String {
    let normalized = normalize_week_period_for_api(week_period);
    format!("cache:reports:weekly:detail:{WEEKLY_DETAIL_CACHE_VERSION}:{data_version}:{normalized}")
}

pub(in crate::reports) fn monthly_report_cache_key(
    month_period: &str,
    data_version: &str,
) -> String {
    match normalize_month_period_for_api(month_period) {
        Ok(normalized) => format!(
            "cache:reports:monthly:detail:{MONTHLY_DETAIL_CACHE_VERSION}:{data_version}:{normalized}"
        ),
        Err(_) => format!(
            "cache:reports:monthly:detail:{MONTHLY_DETAIL_CACHE_VERSION}:{data_version}:{}",
            month_period.trim()
        ),
    }
}
