use chrono::Utc;

const DETAIL_CACHE_SOFT_REFRESH_MIN_REMAINING_SECONDS: i64 = 20;
const DETAIL_CACHE_SOFT_REFRESH_MAX_REMAINING_SECONDS: i64 = 120;

pub(in crate::reports) fn should_trigger_detail_cache_refresh(
    cached_at_epoch_seconds: i64,
    ttl_seconds: u64,
) -> bool {
    if ttl_seconds == 0 {
        return false;
    }

    let ttl = ttl_seconds as i64;
    let age = (Utc::now().timestamp() - cached_at_epoch_seconds).max(0);
    let remaining = ttl - age;
    let threshold = (ttl / 5).clamp(
        DETAIL_CACHE_SOFT_REFRESH_MIN_REMAINING_SECONDS,
        DETAIL_CACHE_SOFT_REFRESH_MAX_REMAINING_SECONDS,
    );

    remaining <= threshold
}
