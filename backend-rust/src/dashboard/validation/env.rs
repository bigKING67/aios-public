use super::super::{
    DEFAULT_CREATOR_LIVE_MAX_DATE_RANGE_DAYS, DEFAULT_CREATOR_SHORTVIDEO_MAX_DATE_RANGE_DAYS,
    DEFAULT_MAX_DATE_RANGE_DAYS, DEFAULT_SCORE_POOL_N, MIN_TOP_N,
};

const MAX_SCORE_POOL_N: usize = 500;

pub(in crate::dashboard) fn resolve_max_query_date_range_days() -> i64 {
    let raw = std::env::var("DASHBOARD_MAX_QUERY_DAYS").unwrap_or_default();
    let parsed = raw
        .trim()
        .parse::<i64>()
        .ok()
        .unwrap_or(DEFAULT_MAX_DATE_RANGE_DAYS);
    parsed.clamp(1, 720)
}

pub(in crate::dashboard) fn resolve_creator_live_max_query_date_range_days() -> i64 {
    let raw = std::env::var("CREATOR_LIVE_MAX_QUERY_DAYS").unwrap_or_default();
    let parsed = raw
        .trim()
        .parse::<i64>()
        .ok()
        .unwrap_or(DEFAULT_CREATOR_LIVE_MAX_DATE_RANGE_DAYS);
    parsed.clamp(1, 36500)
}

pub(in crate::dashboard) fn resolve_creator_shortvideo_max_query_date_range_days() -> i64 {
    let raw = std::env::var("CREATOR_SHORTVIDEO_MAX_QUERY_DAYS").unwrap_or_default();
    let parsed = raw
        .trim()
        .parse::<i64>()
        .ok()
        .unwrap_or(DEFAULT_CREATOR_SHORTVIDEO_MAX_DATE_RANGE_DAYS);
    parsed.clamp(1, 36500)
}

pub(in crate::dashboard) fn resolve_default_score_pool_size() -> usize {
    let raw = std::env::var("DASHBOARD_GOODS_SCORE_POOL_N").unwrap_or_default();
    let parsed = raw
        .trim()
        .parse::<usize>()
        .ok()
        .filter(|value| *value >= MIN_TOP_N)
        .unwrap_or(DEFAULT_SCORE_POOL_N);
    parsed.min(MAX_SCORE_POOL_N)
}
