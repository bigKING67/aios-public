use once_cell::sync::Lazy;

use super::super::locks::{CacheFillLockMap, CacheRefreshSet};

pub(super) static WEEKLY_REPORT_CACHE_FILL_LOCKS: Lazy<CacheFillLockMap> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));
pub(super) static MONTHLY_REPORT_CACHE_FILL_LOCKS: Lazy<CacheFillLockMap> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));
pub(super) static WEEKLY_REPORT_BACKGROUND_REFRESHING: Lazy<CacheRefreshSet> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));
pub(super) static MONTHLY_REPORT_BACKGROUND_REFRESHING: Lazy<CacheRefreshSet> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));
