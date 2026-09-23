use once_cell::sync::Lazy;

use super::cache::{get_cached_value, set_cached_value};
use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

mod detail;
mod locks;
mod payload;
mod periods;

use locks::CacheFillLockMap;

static WEEKLY_PERIODS_CACHE_FILL_LOCKS: Lazy<CacheFillLockMap> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));
static MONTHLY_PERIODS_CACHE_FILL_LOCKS: Lazy<CacheFillLockMap> =
    Lazy::new(|| tokio::sync::Mutex::new(Default::default()));

pub(super) const CACHE_KEY_WEEKLY_LATEST_PERIOD: &str = "cache:reports:weekly:latest-period";
pub(super) const CACHE_KEY_MONTHLY_LATEST_PERIOD: &str = "cache:reports:monthly:latest-period";
pub(super) const CACHE_KEY_WEEKLY_ALL_PERIODS_FULL: &str = "cache:reports:weekly:all-periods:full";
pub(super) const CACHE_KEY_MONTHLY_ALL_PERIODS_FULL: &str =
    "cache:reports:monthly:all-periods:full";
pub(super) const PERIODS_CACHE_MAX_ITEMS: i64 = 200;

pub(super) use detail::{get_or_build_monthly_report, get_or_build_weekly_report};
pub(super) use periods::{
    get_latest_month_period_with_cache, get_latest_week_period_with_cache,
    get_monthly_periods_with_cache, get_weekly_periods_with_cache,
};
