use super::super::{
    WEEKLY_SUMMARY_SCOPE_GLOBAL, WEEKLY_SUMMARY_SCOPE_OVERVIEW, WEEKLY_SUMMARY_SCOPE_TMALL,
};

pub(crate) fn normalize_weekly_summary_scope(scope: Option<&str>) -> String {
    let normalized = scope
        .unwrap_or(WEEKLY_SUMMARY_SCOPE_GLOBAL)
        .trim()
        .to_lowercase();

    match normalized.as_str() {
        WEEKLY_SUMMARY_SCOPE_OVERVIEW => WEEKLY_SUMMARY_SCOPE_OVERVIEW.to_string(),
        WEEKLY_SUMMARY_SCOPE_TMALL => WEEKLY_SUMMARY_SCOPE_TMALL.to_string(),
        WEEKLY_SUMMARY_SCOPE_GLOBAL => WEEKLY_SUMMARY_SCOPE_GLOBAL.to_string(),
        _ => WEEKLY_SUMMARY_SCOPE_GLOBAL.to_string(),
    }
}
