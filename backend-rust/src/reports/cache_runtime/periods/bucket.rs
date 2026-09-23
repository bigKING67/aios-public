use super::super::locks::CacheFillLockMap;
use super::PeriodOption;

pub(super) struct PeriodCacheBucket<'a> {
    pub(super) cache_key: &'a str,
    pub(super) lock_map: &'a CacheFillLockMap,
    pub(super) ttl_seconds: u64,
}

pub(super) fn take_period_items(periods: &[PeriodOption], limit: i64) -> Vec<PeriodOption> {
    periods.iter().take(limit as usize).cloned().collect()
}
